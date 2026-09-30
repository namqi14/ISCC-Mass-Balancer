import React, { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, resolveAssetUrl } from "../api/client";
import type { Company, Site } from "../api/types";
import { Badge, Loading, PageHeader } from "../components/Ui";
import { COUNTRIES } from "../lib/constants";
import { fmtDate } from "../lib/format";

/**
 * Company Profile: lets COMPANY_ADMIN manage their own company's identity
 * (name, registration number, address, contact, logo) plus the sites and
 * ISCC certificates that belong to it -- all in one place. Backed by
 * GET/PATCH /companies/me and POST /companies/me/logo (see
 * backend/src/routes/companies.routes.ts), reusing the existing GET/POST/
 * PATCH /sites endpoints for the sites section. Replaces the old
 * standalone SitesPage; gated to isCompanyAdmin the same way /users is
 * (see App.tsx's <AdminOnly>), so this whole page -- not just the company
 * details -- is admin-only.
 */
export function CompanyProfilePage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [sites, setSites] = useState<Site[] | null>(null);

  function loadCompany() {
    api.get<Company>("/companies/me").then((res) => setCompany(res.data));
  }
  function loadSites() {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
  }
  useEffect(() => {
    loadCompany();
    loadSites();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Company Profile"
        subtitle="Your company's identity, account status, and sites -- including the ISCC certificates recorded against each."
      />

      {!company ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CompanyDetailsCard company={company} onSaved={setCompany} />
          </div>
          <AccountStatusCard company={company} siteCount={sites?.length ?? 0} />
        </div>
      )}

      <SitesSection sites={sites} onChanged={loadSites} />
    </div>
  );
}

function CompanyDetailsCard({ company, onSaved }: { company: Company; onSaved: (c: Company) => void }) {
  const [name, setName] = useState(company.name);
  const [registrationNumber, setRegistrationNumber] = useState(company.registrationNumber);
  const [address, setAddress] = useState(company.address ?? "");
  const [contactName, setContactName] = useState(company.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(company.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(company.contactEmail ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // contactEmail is validated server-side as a real email address when
      // present at all -- omit it entirely rather than sending "" so
      // clearing an unset field doesn't trip that validation.
      const body: Record<string, string> = { name, registrationNumber, address, contactName, contactPhone };
      if (contactEmail.trim()) body.contactEmail = contactEmail.trim();
      const res = await api.patch<Company>("/companies/me", body);
      onSaved(res.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError("");
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await api.post<{ logoUrl: string }>("/companies/me/logo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSaved({ ...company, logoUrl: res.data.logoUrl });
    } catch (err) {
      setLogoError(apiErrorMessage(err));
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const logoSrc = resolveAssetUrl(company.logoUrl);

  return (
    <form className="panel h-full" onSubmit={handleSave}>
      <h2>Company details</h2>
      <div className="panel-sub">Visible to your team and used on generated compliance documents.</div>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-xl border border-[var(--border)] bg-black/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoSrc ? (
            <img src={logoSrc} alt="Company logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">No logo</span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            id="logo-upload"
            className="hidden"
            onChange={handleLogoChange}
          />
          <label htmlFor="logo-upload" className="btn ghost small" style={{ cursor: logoBusy ? "not-allowed" : "pointer" }}>
            {logoBusy ? "Uploading…" : "Upload logo"}
          </label>
          <div className="text-[11px] text-[var(--text-faint)] mt-2">PNG, JPEG, WEBP, or SVG. Max 2MB.</div>
          {logoError && <div className="error-msg" style={{ marginTop: 8 }}>{logoError}</div>}
        </div>
      </div>

      <div className="form-grid">
        <div className="field span2">
          <label>Company name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field span2">
          <label>Registration number</label>
          <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} required />
        </div>
        <div className="field span4">
          <label>Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, postcode, country" />
        </div>
        <div className="field">
          <label>Contact name</label>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="field">
          <label>Contact phone</label>
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div className="field span2">
          <label>Contact email</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      <div style={{ marginTop: 14 }}>
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function AccountStatusCard({ company, siteCount }: { company: Company; siteCount: number }) {
  const quotaText =
    company.maxSites === null || company.maxSites === undefined
      ? `${siteCount} site${siteCount === 1 ? "" : "s"} (no limit set)`
      : `${siteCount} of ${company.maxSites} site${company.maxSites === 1 ? "" : "s"} used`;
  const atQuota = company.maxSites !== null && company.maxSites !== undefined && siteCount >= company.maxSites;

  return (
    <div className="panel h-full flex flex-col">
      <h2>Account status</h2>
      <div className="panel-sub">Set by ALS Solutions -- contact them to change your plan.</div>

      <div className="flex flex-col gap-5 mt-2">
        <div>
          <div className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1">Status</div>
          {company.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Inactive</Badge>}
        </div>
        <div>
          <div className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1">Site quota</div>
          <div className="font-bold font-display text-[var(--heading)]">{quotaText}</div>
          {atQuota && (
            <div className="text-[12px] text-[var(--text-dim)] mt-1">
              Contact ALS Solutions to raise this limit before adding another site.
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1">Company since</div>
          <div className="font-bold font-display text-[var(--heading)]">{fmtDate(company.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

const emptySiteForm = {
  name: "",
  locationId: "",
  country: "Malaysia",
  certScheme: "ISCC_EU" as "ISCC_EU" | "ISCC_PLUS",
  operatorType: "TRADER" as "TRADER" | "PROCESSING_UNIT",
  multiSiteBalancingEnabled: false,
  certificateNumber: "",
  certifyingBody: "",
  certifiedFrom: "",
  certifiedTo: "",
  certifiedSiteRoles: "",
  certificateFileUrl: "",
};

function certificateStatus(site: Site): { label: string; tone: "ok" | "warn" | "neutral" } {
  if (!site.certificateNumber) return { label: "No certificate on file", tone: "neutral" };
  if (site.certifiedTo && new Date(site.certifiedTo) < new Date()) return { label: `Expired ${fmtDate(site.certifiedTo)}`, tone: "warn" };
  return { label: site.certifiedTo ? `Valid to ${fmtDate(site.certifiedTo)}` : "Valid", tone: "ok" };
}

function SitesSection({ sites, onChanged }: { sites: Site[] | null; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySiteForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parseNotice, setParseNotice] = useState("");
  const certFileInputRef = useRef<HTMLInputElement>(null);

  function startCreate() {
    setEditingSiteId(null);
    setForm(emptySiteForm);
    setError("");
    setParseError("");
    setParseNotice("");
    setShowForm(true);
  }

  function startEdit(site: Site) {
    setEditingSiteId(site.id);
    setForm({
      name: site.name,
      locationId: site.locationId,
      country: site.country,
      certScheme: site.certScheme,
      operatorType: site.operatorType,
      multiSiteBalancingEnabled: site.multiSiteBalancingEnabled,
      certificateNumber: site.certificateNumber ?? "",
      certifyingBody: site.certifyingBody ?? "",
      certifiedFrom: site.certifiedFrom ? site.certifiedFrom.slice(0, 10) : "",
      certifiedTo: site.certifiedTo ? site.certifiedTo.slice(0, 10) : "",
      certifiedSiteRoles: site.certifiedSiteRoles ?? "",
      certificateFileUrl: site.certificateFileUrl ?? "",
    });
    setError("");
    setParseNotice("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingSiteId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = {
        name: form.name,
        locationId: form.locationId,
        country: form.country,
        certScheme: form.certScheme,
        operatorType: form.operatorType,
        multiSiteBalancingEnabled: form.multiSiteBalancingEnabled,
        certificateNumber: form.certificateNumber || undefined,
        certifyingBody: form.certifyingBody || undefined,
        certifiedFrom: form.certifiedFrom || undefined,
        certifiedTo: form.certifiedTo || undefined,
        certifiedSiteRoles: form.certifiedSiteRoles || undefined,
        certificateFileUrl: form.certificateFileUrl || undefined,
      };
      if (editingSiteId) {
        await api.patch(`/sites/${editingSiteId}`, body);
      } else {
        await api.post("/sites", body);
      }
      closeForm();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCertificateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    setParseNotice("");
    setParseBusy(true);
    try {
      const body = new FormData();
      body.append("certificate", file);
      const res = await api.post<{
        certificateFileUrl: string;
        certificateNumber: string | null;
        certifyingBody: string | null;
        certifiedFrom: string | null;
        certifiedTo: string | null;
        certifiedSiteRoles: string | null;
        certScheme: "ISCC_EU" | "ISCC_PLUS" | null;
      }>("/sites/parse-certificate", body, { headers: { "Content-Type": "multipart/form-data" } });
      const data = res.data;
      setForm((prev) => ({
        ...prev,
        certificateFileUrl: data.certificateFileUrl,
        certificateNumber: data.certificateNumber ?? prev.certificateNumber,
        certifyingBody: data.certifyingBody ?? prev.certifyingBody,
        certifiedFrom: data.certifiedFrom ?? prev.certifiedFrom,
        certifiedTo: data.certifiedTo ?? prev.certifiedTo,
        certifiedSiteRoles: data.certifiedSiteRoles ?? prev.certifiedSiteRoles,
        certScheme: data.certScheme ?? prev.certScheme,
      }));
      setParseNotice(`Extracted from ${file.name} -- review the fields below before saving.`);
    } catch (err) {
      setParseError(apiErrorMessage(err));
    } finally {
      setParseBusy(false);
      if (certFileInputRef.current) certFileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="Sites & certificates"
        subtitle="Each site carries its own certification scheme, operator type, multi-site balancing flag (Rule 1), and ISCC certificate."
        action={
          <button className="btn" onClick={() => (showForm ? closeForm() : startCreate())}>
            {showForm ? "Cancel" : "+ New site"}
          </button>
        }
      />

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <h2>{editingSiteId ? "Edit site" : "New site"}</h2>
          <div className="panel-sub">A TRADER site can only book inbound/outbound. A PROCESSING_UNIT may also run conversions.</div>
          <div className="form-grid">
            <div className="field span2">
              <label>Site name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Location ID (unique)</label>
              <input value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} required />
            </div>
            <div className="field">
              <label>Country</label>
              <input
                list="country-list"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                required
              />
              <datalist id="country-list">
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>Certification scheme</label>
              <select value={form.certScheme} onChange={(e) => setForm({ ...form, certScheme: e.target.value as any })}>
                <option value="ISCC_EU">ISCC EU</option>
                <option value="ISCC_PLUS">ISCC PLUS</option>
              </select>
            </div>
            <div className="field">
              <label>Operator type</label>
              <select value={form.operatorType} onChange={(e) => setForm({ ...form, operatorType: e.target.value as any })}>
                <option value="TRADER">Trader</option>
                <option value="PROCESSING_UNIT">Processing Unit</option>
              </select>
            </div>
            <div className="field">
              <label>Multi-site balancing</label>
              <div className="checkbox-row" style={{ height: 36 }}>
                <input
                  type="checkbox"
                  checked={form.multiSiteBalancingEnabled}
                  onChange={(e) => setForm({ ...form, multiSiteBalancingEnabled: e.target.checked })}
                />
                Allow pooling with other sites
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 24 }}>ISCC certificate</h2>
          <div className="panel-sub">Optional -- fill in once the site's certificate is issued. Bounds which period dates can be opened for this site.</div>

          <div className="flex items-center gap-3 mb-5">
            <input
              ref={certFileInputRef}
              type="file"
              accept="application/pdf"
              id="certificate-upload"
              className="hidden"
              onChange={handleCertificateUpload}
            />
            <label htmlFor="certificate-upload" className="btn ghost small" style={{ cursor: parseBusy ? "not-allowed" : "pointer" }}>
              {parseBusy ? "Reading certificate…" : "Upload certificate PDF (auto-fill)"}
            </label>
            {form.certificateFileUrl && !parseBusy && (
              <span className="text-[11px] text-[var(--text-faint)]">Certificate on file</span>
            )}
          </div>
          {parseNotice && <div className="text-[12px] text-[var(--text-dim)] mb-4">{parseNotice}</div>}
          {parseError && <div className="error-msg" style={{ marginBottom: 16 }}>{parseError}</div>}

          <div className="form-grid">
            <div className="field span2">
              <label>Certificate number</label>
              <input value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} />
            </div>
            <div className="field span2">
              <label>Certifying body</label>
              <input value={form.certifyingBody} onChange={(e) => setForm({ ...form, certifyingBody: e.target.value })} />
            </div>
            <div className="field">
              <label>Certified from</label>
              <input type="date" value={form.certifiedFrom} onChange={(e) => setForm({ ...form, certifiedFrom: e.target.value })} />
            </div>
            <div className="field">
              <label>Certified to</label>
              <input type="date" value={form.certifiedTo} onChange={(e) => setForm({ ...form, certifiedTo: e.target.value })} />
            </div>
            <div className="field span2">
              <label>Certified site roles</label>
              <input
                value={form.certifiedSiteRoles}
                onChange={(e) => setForm({ ...form, certifiedSiteRoles: e.target.value })}
                placeholder="e.g. Collection point, Warehouse"
              />
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : editingSiteId ? "Save changes" : "Create site"}
            </button>
          </div>
        </form>
      )}

      {!sites ? (
        <Loading />
      ) : sites.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="title">No sites yet</div>
            <div>Create your first site to start recording transactions.</div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location ID</th>
                  <th>Country</th>
                  <th>Scheme</th>
                  <th>Operator type</th>
                  <th>Multi-site</th>
                  <th>Certificate</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const cert = certificateStatus(s);
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="mono">{s.locationId}</td>
                      <td>{s.country}</td>
                      <td>
                        <Badge tone={s.certScheme === "ISCC_EU" ? "blue" : "ok"}>{s.certScheme.replace("ISCC_", "")}</Badge>
                      </td>
                      <td>{s.operatorType === "PROCESSING_UNIT" ? "Processing Unit" : "Trader"}</td>
                      <td>{s.multiSiteBalancingEnabled ? <Badge tone="ok">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge>}</td>
                      <td>
                        <Badge tone={cert.tone}>{cert.label}</Badge>
                      </td>
                      <td>
                        <button className="btn small ghost" onClick={() => startEdit(s)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

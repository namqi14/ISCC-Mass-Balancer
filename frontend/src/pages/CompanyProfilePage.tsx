import React, { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, resolveAssetUrl } from "../api/client";
import type { Company, ConversionRate, Site, StageInfo, StageUnitRule } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Badge, Loading, PageHeader } from "../components/Ui";
import { COUNTRIES, CONVERSION_STAGES, UNIT_LABELS, enabledStages } from "../lib/constants";
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

/**
 * One stage + source unit's rate: the rate in force today, the client's
 * typical range as a non-binding hint, the dated history, and (admins only)
 * a form to add a new dated rate. Rates change monthly/weekly, so they are
 * settings the user maintains -- see backend ConversionRate. Not a <form>:
 * this panel sits next to the site form and must not nest inside it.
 */
function RateBlock({
  site,
  stage,
  rule,
  rows,
  canEdit,
  onSaved,
}: {
  site: Site;
  stage: StageInfo;
  rule: StageUnitRule;
  rows: ConversionRate[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [factor, setFactor] = useState("");
  const [minFactor, setMinFactor] = useState("");
  const [maxFactor, setMaxFactor] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // rows arrive newest-first; the rate in force today is the newest one dated on/before today.
  const inForce = rows.find((r) => r.effectiveFrom.slice(0, 10) <= today);

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api.post("/conversions/rates", {
        siteId: site.id,
        stage: stage.stage,
        sourceUnit: rule.sourceUnit,
        factor: Number(factor),
        minFactor: minFactor ? Number(minFactor) : undefined,
        maxFactor: maxFactor ? Number(maxFactor) : undefined,
        effectiveFrom,
      });
      setFactor("");
      setMinFactor("");
      setMaxFactor("");
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="section-title">
        {stage.label} — {rule.perUnitText} ({UNIT_LABELS[rule.sourceUnit]} → {UNIT_LABELS[rule.targetUnit]})
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>
        Typical (client guidance, not applied automatically): {rule.typical.min}–{rule.typical.max}. {rule.typical.basis}
      </div>
      <div style={{ marginBottom: 8 }}>
        {inForce ? (
          <>
            Rate in force: <strong>{Number(inForce.factor)}</strong>
            {(inForce.minFactor || inForce.maxFactor) && (
              <span className="text-[var(--text-dim)]">
                {" "}
                (range {inForce.minFactor ? Number(inForce.minFactor) : "—"} to {inForce.maxFactor ? Number(inForce.maxFactor) : "—"})
              </span>
            )}
            <span className="text-[var(--text-dim)]"> since {fmtDate(inForce.effectiveFrom)}</span>
          </>
        ) : (
          <span className="text-[var(--text-dim)]">No rate set yet — conversions will ask for the factor each time.</span>
        )}
      </div>

      {canEdit && (
        <div className="form-grid">
          <div className="field">
            <label>New rate</label>
            <input type="number" step="any" min="0" value={factor} onChange={(e) => setFactor(e.target.value)} />
          </div>
          <div className="field">
            <label>Warn below (optional)</label>
            <input type="number" step="any" min="0" value={minFactor} onChange={(e) => setMinFactor(e.target.value)} />
          </div>
          <div className="field">
            <label>Warn above (optional)</label>
            <input type="number" step="any" min="0" value={maxFactor} onChange={(e) => setMaxFactor(e.target.value)} />
          </div>
          <div className="field">
            <label>Effective from</label>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <button type="button" className="btn small" disabled={busy || !factor || !effectiveFrom} onClick={save}>
              {busy ? "Saving…" : "Save rate"}
            </button>
          </div>
        </div>
      )}
      {error && <div className="error-msg">{error}</div>}

      {rows.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="hint" style={{ cursor: "pointer" }}>
            History ({rows.length})
          </summary>
          <table className="data-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>Effective from</th>
                <th className="num">Rate</th>
                <th className="num">Warn below</th>
                <th className="num">Warn above</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.effectiveFrom)}</td>
                  <td className="num">{Number(r.factor)}</td>
                  <td className="num">{r.minFactor ? Number(r.minFactor) : "—"}</td>
                  <td className="num">{r.maxFactor ? Number(r.maxFactor) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/** Conversion rates for a saved site, one block per enabled stage and source unit. */
function ConversionRatesPanel({ site }: { site: Site }) {
  const { isCompanyAdmin } = useAuth();
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [rates, setRates] = useState<ConversionRate[]>([]);

  function load() {
    api.get<StageInfo[]>("/conversions/stages").then((r) => setStages(r.data));
    api.get<ConversionRate[]>("/conversions/rates", { params: { siteId: site.id, history: 1 } }).then((r) => setRates(r.data));
  }
  useEffect(load, [site.id]);

  const siteStages = enabledStages(site);
  if (siteStages.length === 0) return null;

  return (
    <div className="panel">
      <h2>Conversion rates · {site.name}</h2>
      <div className="panel-sub">
        Rates change over time: each new rate applies from its effective date, and a conversion pre-fills the rate in force on
        its own date. Only stages already saved on the site are listed here.
      </div>
      {siteStages.map((st) => {
        const info = stages.find((x) => x.stage === st.stage);
        if (!info) return null;
        return info.unitRules.map((rule) => (
          <RateBlock
            key={st.stage + "-" + rule.sourceUnit}
            site={site}
            stage={info}
            rule={rule}
            rows={rates.filter((r) => r.stage === st.stage && r.sourceUnit === rule.sourceUnit)}
            canEdit={isCompanyAdmin}
            onSaved={load}
          />
        ));
      })}
    </div>
  );
}

const emptySiteForm = {
  name: "",
  locationId: "",
  country: "Malaysia",
  certScheme: "ISCC_EU" as "ISCC_EU" | "ISCC_PLUS",
  canConvertP1: false,
  canConvertP2: false,
  canConvertP3: false,
  canConvertP4: false,
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
      canConvertP1: site.canConvertP1,
      canConvertP2: site.canConvertP2,
      canConvertP3: site.canConvertP3,
      canConvertP4: site.canConvertP4,
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
        canConvertP1: form.canConvertP1,
        canConvertP2: form.canConvertP2,
        canConvertP3: form.canConvertP3,
        canConvertP4: form.canConvertP4,
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
        subtitle="Each site carries its own certification scheme, conversion stages, multi-site balancing flag (Rule 1), and ISCC certificate."
        action={
          <button className="btn" onClick={() => (showForm ? closeForm() : startCreate())}>
            {showForm ? "Cancel" : "+ New site"}
          </button>
        }
      />

      {showForm && (
        <form className="panel" onSubmit={handleSubmit}>
          <h2>{editingSiteId ? "Edit site" : "New site"}</h2>
          <div className="panel-sub">A site with no conversion stage ticked only books inbound/outbound. Tick the stages this site actually runs.</div>
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
            <div className="field span2">
              <label>Conversion stages</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
                {CONVERSION_STAGES.map((s) => (
                  <label key={s.stage} className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={form[s.flag]}
                      onChange={(e) => setForm({ ...form, [s.flag]: e.target.checked })}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
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

      {showForm && editingSiteId !== null && sites?.find((s) => s.id === editingSiteId) && (
        <ConversionRatesPanel site={sites.find((s) => s.id === editingSiteId)!} />
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
                  <th>Conversion stages</th>
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
                      <td>
                        {enabledStages(s).length === 0 ? (
                          <span className="text-[var(--text-faint)]">None (trader)</span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 4 }}>
                            {enabledStages(s).map((st) => (
                              <Badge key={st.stage} tone="blue">{st.stage}</Badge>
                            ))}
                          </span>
                        )}
                      </td>
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

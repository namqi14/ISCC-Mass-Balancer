import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { ClientCompany } from "../api/types";
import { Badge, Loading, PageHeader } from "../components/Ui";

/**
 * SUPER_ADMIN only. Onboards and manages the client companies using the
 * platform: create a client (optionally with its first admin login), set how
 * many sites it may create, rename it, and switch its access on or off. Uses
 * GET/POST /companies and PATCH /companies/:id. It never shows a client's
 * operational data (pools, transactions, periods).
 */
export function ClientsPage() {
  const [clients, setClients] = useState<ClientCompany[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  // --- create form ---
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [maxSites, setMaxSites] = useState("");
  const [withAdmin, setWithAdmin] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // --- edit form ---
  const [editing, setEditing] = useState<ClientCompany | null>(null);
  const [editName, setEditName] = useState("");
  const [editReg, setEditReg] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get<ClientCompany[]>("/companies")
      .then((res) => setClients(res.data))
      .catch((err) => setLoadError(apiErrorMessage(err)));
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setMessage("");
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (regNo.trim()) body.registrationNumber = regNo.trim();
      if (maxSites.trim() !== "") body.maxSites = Number(maxSites);
      if (withAdmin) body.admin = { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword };
      await api.post("/companies", body);
      setMessage(
        withAdmin
          ? `Client "${name.trim()}" created with admin login ${adminEmail.trim().toLowerCase()}. Give them the password you set.`
          : `Client "${name.trim()}" created. Add a login for them from the Users page.`
      );
      setName("");
      setRegNo("");
      setMaxSites("");
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      setShowCreate(false);
      load();
    } catch (err) {
      setCreateError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(c: ClientCompany) {
    setEditing(c);
    setEditName(c.name);
    setEditReg(c.registrationNumber);
    setEditMax(c.maxSites === null ? "" : String(c.maxSites));
    setEditError("");
    setMessage("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError("");
    setSaving(true);
    try {
      await api.patch(`/companies/${editing.id}`, {
        name: editName.trim(),
        registrationNumber: editReg.trim(),
        maxSites: editMax.trim() === "" ? null : Number(editMax),
      });
      setMessage(`Saved changes to "${editName.trim()}".`);
      setEditing(null);
      load();
    } catch (err) {
      setEditError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: ClientCompany) {
    const action = c.isActive ? "deactivate" : "reactivate";
    const warning = c.isActive ? " Nobody in this company will be able to log in until you reactivate it." : "";
    if (!window.confirm(`Really ${action} "${c.name}"?${warning}`)) return;
    setMessage("");
    try {
      await api.patch(`/companies/${c.id}`, { isActive: !c.isActive });
      setMessage(`"${c.name}" ${c.isActive ? "deactivated" : "reactivated"}.`);
      load();
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={
          <>
            The companies using the platform. Create a client, set how many sites it may add, and switch its access on or off. You cannot see a
            client's pools, transactions or periods from here.
          </>
        }
        action={
          <button className="btn" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? "Cancel" : "+ New client"}
          </button>
        }
      />

      {message && <div className="alert-msg INFO">{message}</div>}
      {loadError && <div className="error-msg">{loadError}</div>}

      {showCreate && (
        <form className="panel" onSubmit={handleCreate}>
          <h2>New client</h2>
          <div className="form-grid">
            <div className="field">
              <label>Company name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Registration number</label>
              <input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="Leave blank to fill in later" />
            </div>
            <div className="field">
              <label>Site limit</label>
              <input type="number" min={0} value={maxSites} onChange={(e) => setMaxSites(e.target.value)} placeholder="Blank = unlimited" />
            </div>
            <div className="field span2">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal", textTransform: "none" }}>
                <input type="checkbox" checked={withAdmin} onChange={(e) => setWithAdmin(e.target.checked)} />
                Also create the client's first admin login
              </label>
            </div>
            {withAdmin && (
              <>
                <div className="field">
                  <label>Admin name *</label>
                  <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Admin email *</label>
                  <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Admin password * (min. 8 characters)</label>
                  <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                </div>
              </>
            )}
          </div>
          {createError && <div className="error-msg">{createError}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={creating}>
              {creating ? "Creating…" : "Create client"}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <form className="panel" onSubmit={handleSave}>
          <h2>Edit {editing.name}</h2>
          <div className="form-grid">
            <div className="field">
              <label>Company name *</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Registration number *</label>
              <input value={editReg} onChange={(e) => setEditReg(e.target.value)} required />
            </div>
            <div className="field">
              <label>Site limit</label>
              <input type="number" min={0} value={editMax} onChange={(e) => setEditMax(e.target.value)} placeholder="Blank = unlimited" />
              <span className="sub">Currently using {editing.siteCount} site{editing.siteCount === 1 ? "" : "s"}.</span>
            </div>
          </div>
          {editError && <div className="error-msg">{editError}</div>}
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button className="btn" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!clients ? (
        loadError ? null : <Loading />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Registration no.</th>
                  <th>Sites</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.registrationNumber}</td>
                    <td>
                      {c.siteCount} / {c.maxSites === null ? "unlimited" : c.maxSites}
                    </td>
                    <td>{c.userCount}</td>
                    <td>{c.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Inactive</Badge>}</td>
                    <td>{c.createdAt.slice(0, 10)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn small ghost" onClick={() => openEdit(c)} style={{ marginRight: 6 }}>
                        Edit
                      </button>
                      <button className="btn small ghost" onClick={() => toggleActive(c)}>
                        {c.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

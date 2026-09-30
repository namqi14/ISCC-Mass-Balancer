import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { ManagedUser, UserRole, Site } from "../api/types";
import { Badge, Loading, PageHeader } from "../components/Ui";

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("COMPANY_USER");
  const [siteIds, setSiteIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<ManagedUser[]>("/auth/users").then((res) => setUsers(res.data));
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/users", { name, email, password, role, siteIds: role === "COMPANY_USER" ? siteIds : [] });
      setName("");
      setEmail("");
      setPassword("");
      setSiteIds([]);
      setShowForm(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: ManagedUser) {
    await api.patch(`/auth/users/${u.id}`, { isActive: !u.isActive });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={
          <>
            COMPANY_ADMIN manages sites/users and closes periods. COMPANY_USER records data for the company's sites. SUPER_ADMIN is the
            platform operator role (cross-company visibility is a later multi-tenant phase; today it behaves like COMPANY_ADMIN).
          </>
        }
        action={
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New user"}
          </button>
        }
      />

      {showForm && (
        <form className="panel" onSubmit={handleCreate}>
          <h2>New user</h2>
          <div className="form-grid">
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                <option value="COMPANY_ADMIN">Company Admin</option>
                <option value="COMPANY_USER">Company User</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            {role === "COMPANY_USER" && (
              <div className="field span2">
                <label>Assigned Sites</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {sites.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'normal', margin: 0, textTransform: 'none' }}>
                      <input type="checkbox" checked={siteIds.includes(s.id)} onChange={e => {
                        if (e.target.checked) setSiteIds(prev => [...prev, s.id]);
                        else setSiteIds(prev => prev.filter(id => id !== s.id));
                      }} />
                      {s.name}
                    </label>
                  ))}
                  {sites.length === 0 && <span className="sub">No sites exist yet.</span>}
                </div>
              </div>
            )}
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      )}

      {!users ? (
        <Loading />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Assigned Sites</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.role === "COMPANY_USER" ? (u.siteIds?.length > 0 ? u.siteIds.map(id => sites.find(s => s.id === id)?.name).filter(Boolean).join(", ") : "None") : "All sites"}</td>
                    <td>{u.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Disabled</Badge>}</td>
                    <td>
                      <button className="btn small ghost" onClick={() => toggleActive(u)}>
                        {u.isActive ? "Disable" : "Enable"}
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

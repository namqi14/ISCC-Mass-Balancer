import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuditLogEntry } from "../api/types";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmtDate } from "../lib/format";

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    api.get<AuditLogEntry[]>("/audit-log").then((res) => setEntries(res.data));
  }, []);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only. Every create, merge, and close action in the system is recorded here permanently and cannot be edited or removed."
      />

      {!entries ? (
        <Loading />
      ) : entries.length === 0 ? (
        <EmptyState title="No audit entries yet" sub="Actions taken in the system will appear here." />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Entity</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{new Date(e.timestamp).toLocaleString()}</td>
                    <td>
                      {e.entityType} #{e.entityId}
                    </td>
                    <td>{e.action}</td>
                    <td>{e.actorName}</td>
                    <td style={{ maxWidth: 220 }}>{e.beforeValue || "—"}</td>
                    <td style={{ maxWidth: 220 }}>{e.afterValue || "—"}</td>
                    <td style={{ maxWidth: 260 }}>{e.notes || "—"}</td>
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

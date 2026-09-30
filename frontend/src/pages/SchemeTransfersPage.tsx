import React, { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Batch, Period, SchemeTransfer, Site } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";

export function SchemeTransfersPage() {
  const { canWrite } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sourcePeriods, setSourcePeriods] = useState<Period[]>([]);
  const [targetPeriods, setTargetPeriods] = useState<Period[]>([]);
  const [transfers, setTransfers] = useState<SchemeTransfer[] | null>(null);

  const [sourceSiteId, setSourceSiteId] = useState<number | "">("");
  const [targetSiteId, setTargetSiteId] = useState<number | "">("");
  const [sourcePeriodId, setSourcePeriodId] = useState<number | "">("");
  const [targetPeriodId, setTargetPeriodId] = useState<number | "">("");
  const [sourceBatchId, setSourceBatchId] = useState<number | "">("");
  const [volume, setVolume] = useState("");
  const [transferDate, setTransferDate] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const euSites = useMemo(() => sites.filter((s) => s.certScheme === "ISCC_EU"), [sites]);
  const plusSites = useMemo(() => sites.filter((s) => s.certScheme === "ISCC_PLUS"), [sites]);

  function loadTransfers() {
    api.get<SchemeTransfer[]>("/scheme-transfers").then((res) => setTransfers(res.data));
  }

  useEffect(() => {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    loadTransfers();
  }, []);

  useEffect(() => {
    if (!sourceSiteId) {
      setBatches([]);
      setSourcePeriods([]);
      return;
    }
    api.get<Batch[]>("/batches", { params: { siteId: sourceSiteId } }).then((res) => setBatches(res.data));
    api.get<Period[]>("/periods", { params: { siteId: sourceSiteId } }).then((res) => setSourcePeriods(res.data.filter((p) => p.status === "OPEN")));
  }, [sourceSiteId]);

  useEffect(() => {
    if (!targetSiteId) {
      setTargetPeriods([]);
      return;
    }
    api.get<Period[]>("/periods", { params: { siteId: targetSiteId } }).then((res) => setTargetPeriods(res.data.filter((p) => p.status === "OPEN")));
  }, [targetSiteId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api.post("/scheme-transfers", {
        sourceSiteId,
        targetSiteId,
        sourceBatchId,
        sourcePeriodId,
        targetPeriodId,
        volume: Number(volume),
        transferDate,
      });
      setSuccess("Scheme transfer recorded.");
      setVolume("");
      loadTransfers();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const siteName = (id: number) => sites.find((s) => s.id === id)?.name ?? `Site #${id}`;

  return (
    <div>
      <PageHeader
        title="Scheme Transfers"
        subtitle={
          <>
            Certified volume may move from an ISCC EU site to an ISCC PLUS site, or between PLUS sites (enforced server-side regardless
            of what this form allows you to select). Both sites need an open period covering the transfer date: it books a real OUTBOUND
            transaction at the source and INBOUND transaction at the target.
          </>
        }
      />

      {canWrite && (
        <form className="panel" onSubmit={handleSubmit}>
          <h2>New transfer</h2>
          <div className="form-grid">
            <div className="field">
              <label>Source site (EU or PLUS)</label>
              <select
                value={sourceSiteId}
                onChange={(e) => {
                  setSourceSiteId(Number(e.target.value));
                  setSourceBatchId("");
                  setSourcePeriodId("");
                }}
                required
              >
                <option value="">— select source site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.certScheme.replace("ISCC_", "")}] {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Source open period</label>
              <select value={sourcePeriodId} onChange={(e) => setSourcePeriodId(Number(e.target.value))} required>
                <option value="">— select period —</option>
                {sourcePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id}: {p.startDate.slice(0, 10)} to {p.endDate.slice(0, 10)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Target site (ISCC PLUS)</label>
              <select
                value={targetSiteId}
                onChange={(e) => {
                  setTargetSiteId(Number(e.target.value));
                  setTargetPeriodId("");
                }}
                required
              >
                <option value="">— select PLUS site —</option>
                {plusSites.filter(s => s.id !== sourceSiteId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Target open period</label>
              <select value={targetPeriodId} onChange={(e) => setTargetPeriodId(Number(e.target.value))} required>
                <option value="">— select period —</option>
                {targetPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id}: {p.startDate.slice(0, 10)} to {p.endDate.slice(0, 10)}
                  </option>
                ))}
              </select>
            </div>
            {sourceSiteId && targetSiteId && sites.find(s => s.id === sourceSiteId)?.certScheme === "ISCC_PLUS" && sites.find(s => s.id === targetSiteId)?.certScheme === "ISCC_PLUS" && (
              <div className="field span2" style={{ color: '#b45309', fontSize: 13, background: '#fef3c7', padding: '12px', borderRadius: 6, border: '1px solid #f59e0b' }}>
                <strong>PLUS-to-PLUS Adjacency Rule (Rule 9):</strong> Target site is in {sites.find(s => s.id === targetSiteId)?.country} and Source is in {sites.find(s => s.id === sourceSiteId)?.country}. The backend will reject this if these countries are not identical or officially neighboring.
              </div>
            )}
            <div className="field">
              <label>Transfer date</label>
              <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>Volume</label>
              <input type="number" step="any" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} required />
            </div>
            <div className="field span2">
              <label>Source stock pool</label>
              <select value={sourceBatchId} onChange={(e) => setSourceBatchId(Number(e.target.value))} required>
                <option value="">— choose a pool at the source site —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.productType} · {b.rawMaterial} / {b.countryOfOrigin} / GHG {b.ghgValue} — avail: {fmt(b.availableVolume)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}
          {success && <div className="alert-msg INFO">{success}</div>}

          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : "Record transfer"}
            </button>
          </div>
        </form>
      )}

      {!transfers ? (
        <Loading />
      ) : transfers.length === 0 ? (
        <EmptyState title="No scheme transfers yet" sub="EU-to-PLUS and PLUS-to-PLUS volume transfers will appear here." />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Target (PLUS)</th>
                  <th>Material</th>
                  <th className="num">Volume</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transferDate)}</td>
                    <td>{siteName(t.sourceSiteId)}</td>
                    <td>{siteName(t.targetSiteId)}</td>
                    <td>
                      {t.sourceBatch?.rawMaterial} / {t.sourceBatch?.countryOfOrigin}
                    </td>
                    <td className="num">{fmt(t.volume)}</td>
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

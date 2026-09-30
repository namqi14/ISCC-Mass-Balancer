import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { PhysicalStockReading, Site } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";

export function StockReadingsPage() {
  const { canWrite } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [readings, setReadings] = useState<PhysicalStockReading[] | null>(null);

  const [siteId, setSiteId] = useState<number | "">("");
  const [readingDate, setReadingDate] = useState("");
  const [certifiedStockQty, setCertifiedStockQty] = useState("");
  const [fossilStockQty, setFossilStockQty] = useState("0");
  const [source, setSource] = useState<"SENSOR" | "MANUAL_STOCKTAKE">("MANUAL_STOCKTAKE");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    api.get<PhysicalStockReading[]>("/stock-readings").then((res) => setReadings(res.data));
  }
  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/stock-readings", {
        siteId,
        readingDate,
        certifiedStockQty: Number(certifiedStockQty),
        fossilStockQty: Number(fossilStockQty),
        source,
      });
      setCertifiedStockQty("");
      setFossilStockQty("0");
      load();
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
        title="Physical Stock Readings"
        subtitle={
          <>
            Independent tank/silo readings, entered manually. Used for the ISCC EU carry-forward cap and the 0.5% booked-vs-physical
            tolerance check (Rules 6 &amp; 8), deliberately never derived from booked transactions.
          </>
        }
      />

      {canWrite && (
        <form className="panel" onSubmit={handleSubmit}>
          <h2>New reading</h2>
          <div className="form-grid">
            <div className="field">
              <label>Site</label>
              <select value={siteId} onChange={(e) => setSiteId(Number(e.target.value))} required>
                <option value="">— select site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Reading date</label>
              <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>Certified stock qty</label>
              <input type="number" step="any" min="0" value={certifiedStockQty} onChange={(e) => setCertifiedStockQty(e.target.value)} required />
            </div>
            <div className="field">
              <label>Fossil stock qty</label>
              <input type="number" step="any" min="0" value={fossilStockQty} onChange={(e) => setFossilStockQty(e.target.value)} />
            </div>
            <div className="field">
              <label>Source</label>
              <select value={source} onChange={(e) => setSource(e.target.value as any)}>
                <option value="MANUAL_STOCKTAKE">Manual stocktake</option>
                <option value="SENSOR">Sensor</option>
              </select>
            </div>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : "Record reading"}
            </button>
          </div>
        </form>
      )}

      {!readings ? (
        <Loading />
      ) : readings.length === 0 ? (
        <EmptyState title="No readings yet" sub="Physical stock readings will appear here." />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th className="num">Certified</th>
                  <th className="num">Fossil</th>
                  <th className="num">Total</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.readingDate)}</td>
                    <td>{siteName(r.siteId)}</td>
                    <td className="num">{fmt(r.certifiedStockQty)}</td>
                    <td className="num">{fmt(r.fossilStockQty)}</td>
                    <td className="num">{fmt(Number(r.certifiedStockQty) + Number(r.fossilStockQty))}</td>
                    <td>{r.source}</td>
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

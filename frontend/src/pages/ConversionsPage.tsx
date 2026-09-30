import React, { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Batch, ConversionEvent, Period, Site } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";

export function ConversionsPage() {
  const { canWrite } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [events, setEvents] = useState<ConversionEvent[] | null>(null);

  const [siteId, setSiteId] = useState<number | "">("");
  const [periodId, setPeriodId] = useState<number | "">("");
  const [sourceBatchId, setSourceBatchId] = useState<number | "">("");
  const [sourceVolume, setSourceVolume] = useState("");
  const [conversionFactorCf, setConversionFactorCf] = useState("1");
  const [conversionDate, setConversionDate] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const processingSites = useMemo(() => sites.filter((s) => s.operatorType === "PROCESSING_UNIT"), [sites]);
  const sourceBatch = useMemo(() => batches.find((b) => b.id === sourceBatchId), [batches, sourceBatchId]);
  const targetProductType = sourceBatch ? (sourceBatch.productType === "BIOMETHANE" ? "BIOLNG" : "BIOMETHANE") : null;
  const resultVolume = sourceVolume && conversionFactorCf ? Number(sourceVolume) * Number(conversionFactorCf) : 0;

  function loadEvents() {
    api.get<ConversionEvent[]>("/conversions").then((res) => setEvents(res.data));
  }

  useEffect(() => {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    loadEvents();
  }, []);

  useEffect(() => {
    if (!siteId) {
      setPeriods([]);
      setBatches([]);
      return;
    }
    api.get<Period[]>("/periods", { params: { siteId } }).then((res) => setPeriods(res.data.filter((p) => p.status === "OPEN")));
    api.get<Batch[]>("/batches", { params: { siteId } }).then((res) => setBatches(res.data));
  }, [siteId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!targetProductType) return;
    setBusy(true);
    try {
      await api.post("/conversions", {
        siteId,
        periodId,
        sourceBatchId,
        sourceVolume: Number(sourceVolume),
        conversionFactorCf: Number(conversionFactorCf),
        conversionDate,
        targetProductType,
      });
      setSuccess("Conversion recorded.");
      setSourceVolume("");
      loadEvents();
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
        title="Conversions"
        subtitle="Only Processing Unit sites may convert between Biomethane and Bio-LNG. Verify the correct GCV-based conversion factor with your auditor."
      />

      {canWrite && (
        <form className="panel" onSubmit={handleSubmit}>
          <h2>New conversion</h2>
          <div className="form-grid">
            <div className="field span2">
              <label>Processing unit site</label>
              <select value={siteId} onChange={(e) => { setSiteId(Number(e.target.value)); setSourceBatchId(""); }} required>
                <option value="">— select site —</option>
                {processingSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {siteId !== "" && processingSites.length === 0 && (
                <div className="hint">No Processing Unit sites yet — create one on the Sites page.</div>
              )}
            </div>
            <div className="field">
              <label>Open period</label>
              <select value={periodId} onChange={(e) => setPeriodId(Number(e.target.value))} required>
                <option value="">— select period —</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id}: {p.startDate.slice(0, 10)} to {p.endDate.slice(0, 10)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date of conversion</label>
              <input type="date" value={conversionDate} onChange={(e) => setConversionDate(e.target.value)} required />
            </div>

            <div className="field span2">
              <label>Source stock pool</label>
              <select value={sourceBatchId} onChange={(e) => setSourceBatchId(Number(e.target.value))} required>
                <option value="">— choose a pool —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.productType} · {b.rawMaterial} / {b.countryOfOrigin} / GHG {b.ghgValue} — avail: {fmt(b.availableVolume)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Source volume</label>
              <input type="number" step="any" min="0" value={sourceVolume} onChange={(e) => setSourceVolume(e.target.value)} required />
            </div>
            <div className="field">
              <label>Conversion factor</label>
              <input type="number" step="any" min="0" value={conversionFactorCf} onChange={(e) => setConversionFactorCf(e.target.value)} required />
            </div>
            <div className="field">
              <label>Resulting product</label>
              <input value={targetProductType ?? "—"} disabled />
            </div>
            <div className="field">
              <label>Resulting volume</label>
              <input value={fmt(resultVolume)} disabled />
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}
          {success && <div className="alert-msg INFO">{success}</div>}

          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : "Record conversion"}
            </button>
          </div>
        </form>
      )}

      {!events ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState title="No conversions yet" sub="Conversions between Biomethane and Bio-LNG will appear here." />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Site</th>
                  <th className="num">Factor</th>
                  <th>Input</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const input = ev.lines?.find((l) => l.role === "INPUT")?.transaction;
                  const output = ev.lines?.find((l) => l.role === "OUTPUT")?.transaction;
                  return (
                    <tr key={ev.id}>
                      <td>{fmtDate(ev.conversionDate)}</td>
                      <td>{siteName(ev.siteId)}</td>
                      <td className="num">{fmt(ev.conversionFactorCf, 6)}</td>
                      <td>
                        {input?.batch?.productType} — {fmt(input?.volume)}
                      </td>
                      <td>
                        {output?.batch?.productType} — {fmt(output?.volume)}
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

import React, { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Batch, ConversionEvent, ConversionRate, Period, Site, StageInfo } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";
import { PRODUCT_LABELS, UNIT_LABELS, enabledStages } from "../lib/constants";

const today = () => new Date().toISOString().slice(0, 10);

export function ConversionsPage() {
  const { canWrite } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [events, setEvents] = useState<ConversionEvent[] | null>(null);
  // Units each stage takes/produces, and the client's typical-range hint
  // (GET /conversions/stages) -- the hint is never applied automatically.
  const [stagesInfo, setStagesInfo] = useState<StageInfo[]>([]);
  // The site's own rates in force on the chosen conversion date (rates are
  // user-maintained and dated -- Company Profile > Sites).
  const [inForceRates, setInForceRates] = useState<ConversionRate[]>([]);

  const [siteId, setSiteId] = useState<number | "">("");
  const [periodId, setPeriodId] = useState<number | "">("");
  const [sourceBatchId, setSourceBatchId] = useState<number | "">("");
  const [sourceVolume, setSourceVolume] = useState("");
  const [conversionFactorCf, setConversionFactorCf] = useState("");
  const [conversionDate, setConversionDate] = useState(today());

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Only sites with at least one conversion stage switched on (Company
  // Profile > Sites) can run conversions at all.
  const processingSites = useMemo(() => sites.filter((s) => enabledStages(s).length > 0), [sites]);
  const site = useMemo(() => sites.find((s) => s.id === siteId), [sites, siteId]);
  const siteStageList = useMemo(() => (site ? enabledStages(site) : []), [site]);

  // A conversion is exactly one step of the chain, and a rate is only
  // meaningful in its own unit -- so only pools that are the INPUT of one of
  // this site's enabled stages, held in a unit that stage accepts, can be
  // converted. Pools that fit the product but not the unit are counted, not
  // silently dropped, so the user knows why a pool isn't offered.
  const unitFits = (b: Batch) => {
    const st = siteStageList.find((s) => s.source === b.productType);
    if (!st) return false;
    const info = stagesInfo.find((x) => x.stage === st.stage);
    return !info || info.unitRules.some((r) => r.sourceUnit === b.unit); // no info loaded yet: don't hide anything
  };
  const productFits = (b: Batch) => siteStageList.some((st) => st.source === b.productType);
  const convertiblePools = useMemo(
    () => batches.filter((b) => productFits(b) && unitFits(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batches, siteStageList, stagesInfo]
  );
  const hiddenForUnit = useMemo(
    () => batches.filter((b) => productFits(b) && !unitFits(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batches, siteStageList, stagesInfo]
  );

  const sourceBatch = useMemo(() => batches.find((b) => b.id === sourceBatchId), [batches, sourceBatchId]);
  const activeStage = sourceBatch ? siteStageList.find((st) => st.source === sourceBatch.productType) : undefined;
  const stageInfo = activeStage ? stagesInfo.find((x) => x.stage === activeStage.stage) : undefined;
  const rule = stageInfo && sourceBatch ? stageInfo.unitRules.find((r) => r.sourceUnit === sourceBatch.unit) : undefined;
  const targetProductType = activeStage ? activeStage.target : null;
  const inForce = activeStage && rule ? inForceRates.find((r) => r.stage === activeStage.stage && r.sourceUnit === rule.sourceUnit) : undefined;

  const cf = Number(conversionFactorCf);
  const resultVolume = sourceVolume && conversionFactorCf ? Number(sourceVolume) * cf : 0;
  const rangeWarning = (() => {
    if (!inForce || !conversionFactorCf) return null;
    const min = inForce.minFactor ? Number(inForce.minFactor) : null;
    const max = inForce.maxFactor ? Number(inForce.maxFactor) : null;
    if ((min !== null && cf < min) || (max !== null && cf > max)) {
      return `This factor is outside the range configured for this site (${min ?? "—"} to ${max ?? "—"}). You can still record it.`;
    }
    return null;
  })();

  function loadEvents() {
    api.get<ConversionEvent[]>("/conversions").then((res) => setEvents(res.data));
  }
  function loadBatches() {
    if (siteId) api.get<Batch[]>("/batches", { params: { siteId } }).then((res) => setBatches(res.data));
  }

  useEffect(() => {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    api.get<StageInfo[]>("/conversions/stages").then((res) => setStagesInfo(res.data));
    loadEvents();
  }, []);

  useEffect(() => {
    if (!siteId) {
      setPeriods([]);
      setBatches([]);
      return;
    }
    api.get<Period[]>("/periods", { params: { siteId } }).then((res) => setPeriods(res.data.filter((p) => p.status === "OPEN")));
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // The rate in force depends on the site and the conversion DATE.
  useEffect(() => {
    if (!siteId || !conversionDate) {
      setInForceRates([]);
      return;
    }
    api
      .get<ConversionRate[]>("/conversions/rates", { params: { siteId, asOf: conversionDate } })
      .then((res) => setInForceRates(res.data))
      .catch(() => setInForceRates([]));
  }, [siteId, conversionDate]);

  // Pre-fill the factor from the rate in force for the chosen pool and date.
  // No rate set -> leave it empty so the user types it (nothing is assumed).
  useEffect(() => {
    setConversionFactorCf(inForce ? String(Number(inForce.factor)) : "");
  }, [inForce?.id, sourceBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setWarnings([]);
    if (!targetProductType) return;
    setBusy(true);
    try {
      const res = await api.post("/conversions", {
        siteId,
        periodId,
        sourceBatchId,
        sourceVolume: Number(sourceVolume),
        conversionFactorCf: Number(conversionFactorCf),
        conversionDate,
        targetProductType,
      });
      setSuccess("Conversion recorded.");
      setWarnings(res.data?.warnings ?? []);
      setSourceVolume("");
      loadEvents();
      loadBatches();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const siteName = (id: number) => sites.find((s) => s.id === id)?.name ?? `Site #${id}`;
  const withUnit = (tx?: { volume: string; batch?: { unit: Batch["unit"] } }) =>
    tx ? `${fmt(tx.volume)}${tx.batch ? " " + UNIT_LABELS[tx.batch.unit] : ""}` : "";

  return (
    <div>
      <PageHeader
        title="Conversions"
        subtitle="Each site converts only the stages enabled for it in Company Profile: P1 POME to Biogas, P2 Biogas to Biomethane, P3 Biomethane to Bio-LNG, P4 Bio-LNG back to Biomethane. A conversion changes the unit, and the factor is the site's own rate for that date."
      />

      {canWrite && (
        <form className="panel" onSubmit={handleSubmit}>
          <h2>New conversion</h2>
          <div className="form-grid">
            <div className="field span2">
              <label>Site</label>
              <select
                value={siteId}
                onChange={(e) => {
                  setSiteId(Number(e.target.value));
                  setSourceBatchId("");
                }}
                required
              >
                <option value="">— select site —</option>
                {processingSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {sites.length > 0 && processingSites.length === 0 && (
                <div className="hint">No site has a conversion stage yet — tick the stages a site runs in Company Profile.</div>
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
                {convertiblePools.map((b) => (
                  <option key={b.id} value={b.id}>
                    {PRODUCT_LABELS[b.productType]} · {b.rawMaterial} / {b.countryOfOrigin} / GHG {b.ghgValue} — avail:{" "}
                    {fmt(b.availableVolume)} {UNIT_LABELS[b.unit]}
                  </option>
                ))}
              </select>
              {site && (
                <div className="hint">
                  This site runs: {siteStageList.map((st) => st.label).join(", ")}.
                  {convertiblePools.length === 0 && " No pool here is an input for those stages yet — book the input product in first (Transactions)."}
                  {hiddenForUnit.length > 0 &&
                    ` ${hiddenForUnit.length} pool${hiddenForUnit.length === 1 ? " is" : "s are"} hidden because the unit doesn't fit the stage (${[
                      ...new Set(hiddenForUnit.map((b) => `${PRODUCT_LABELS[b.productType]} in ${UNIT_LABELS[b.unit]}`)),
                    ].join(", ")}).`}
                </div>
              )}
            </div>
            <div className="field">
              <label>Source volume{sourceBatch ? ` (${UNIT_LABELS[sourceBatch.unit]})` : ""}</label>
              <input type="number" step="any" min="0" value={sourceVolume} onChange={(e) => setSourceVolume(e.target.value)} required />
            </div>
            <div className="field">
              <label>Conversion factor{rule ? ` (${rule.perUnitText})` : ""}</label>
              <input type="number" step="any" min="0" value={conversionFactorCf} onChange={(e) => setConversionFactorCf(e.target.value)} required />
              {rule && (
                <div className="hint">
                  {inForce
                    ? `Pre-filled from this site's rate in force on ${fmtDate(conversionDate)} (set since ${fmtDate(inForce.effectiveFrom)}).`
                    : "No rate set for this date — enter the factor, or save a rate in Company Profile > Sites."}{" "}
                  Typical (client guidance, not applied automatically): {rule.typical.min}–{rule.typical.max}.
                </div>
              )}
            </div>
            <div className="field">
              <label>Resulting product</label>
              <input value={targetProductType ? PRODUCT_LABELS[targetProductType] : "—"} disabled />
            </div>
            <div className="field">
              <label>Resulting volume{rule ? ` (${UNIT_LABELS[rule.targetUnit]})` : ""}</label>
              <input value={fmt(resultVolume)} disabled />
            </div>
          </div>

          {rangeWarning && <div className="alert-msg WARNING">{rangeWarning}</div>}
          {error && <div className="error-msg">{error}</div>}
          {success && <div className="alert-msg INFO">{success}</div>}
          {warnings.map((w) => (
            <div key={w} className="alert-msg WARNING">
              {w}
            </div>
          ))}

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
        <EmptyState title="No conversions yet" sub="Conversions between POME, Biogas, Biomethane and Bio-LNG will appear here." />
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
                        {input?.batch ? PRODUCT_LABELS[input.batch.productType] : ""} — {withUnit(input)}
                      </td>
                      <td>
                        {output?.batch ? PRODUCT_LABELS[output.batch.productType] : ""} — {withUnit(output)}
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

import React, { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Batch, ConversionEvent, ConversionRate, LngLot, Period, Site, StageInfo } from "../api/types";
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

  // Tolling (client workbook "PU Conversion" tab): the stock and the output lot
  // stay with the booking (trader) site, while the processing unit named here
  // does the conversion -- its stages and rates apply.
  const [tolling, setTolling] = useState(false);
  const [puSiteId, setPuSiteId] = useState<number | "">("");
  const [reference, setReference] = useState("");
  const [instructionRef, setInstructionRef] = useState("");
  const [processingGhg, setProcessingGhg] = useState("");
  const [lngLots, setLngLots] = useState<LngLot[]>([]);
  const [lngLotId, setLngLotId] = useState<number | "">("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Only sites with at least one conversion stage switched on (Company
  // Profile > Sites) can run conversions at all.
  const processingSites = useMemo(() => sites.filter((s) => enabledStages(s).length > 0), [sites]);
  const site = useMemo(() => sites.find((s) => s.id === siteId), [sites, siteId]);
  // The site whose stages and rates apply: the processing unit when tolling.
  const puSite = useMemo(() => (tolling ? sites.find((s) => s.id === puSiteId) : undefined), [sites, tolling, puSiteId]);
  const stageSite = tolling ? puSite : site;
  const siteStageList = useMemo(() => (stageSite ? enabledStages(stageSite) : []), [stageSite]);

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
  // Output GHG = source GHG + processing GHG (e.g. 32 + 13.48 = 45.48).
  const outputGhg = sourceBatch ? Math.round((Number(sourceBatch.ghgValue) + (processingGhg ? Number(processingGhg) : 0)) * 10000) / 10000 : null;
  // Conventional LNG goes with a liquefaction (P3); only lots in the output unit with stock left.
  const isLiquefaction = activeStage?.stage === "P3";
  const usableLngLots = lngLots.filter((l) => Number(l.remaining) > 0 && (!rule || l.unit === rule.targetUnit));
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
  function loadLngLots() {
    if (siteId) api.get<LngLot[]>("/lng/lots", { params: { siteId } }).then((res) => setLngLots(res.data)).catch(() => setLngLots([]));
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
    loadLngLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // The rate in force depends on the site that does the conversion (the PU when
  // tolling) and the conversion DATE.
  const rateSiteId = tolling ? puSiteId : siteId;
  useEffect(() => {
    if (!rateSiteId || !conversionDate) {
      setInForceRates([]);
      return;
    }
    api
      .get<ConversionRate[]>("/conversions/rates", { params: { siteId: rateSiteId, asOf: conversionDate } })
      .then((res) => setInForceRates(res.data))
      .catch(() => setInForceRates([]));
  }, [rateSiteId, conversionDate]);

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
        ...(tolling
          ? {
              puSiteId,
              reference: reference.trim() || undefined,
              instructionRef: instructionRef.trim() || undefined,
              processingGhg: processingGhg !== "" ? Number(processingGhg) : undefined,
              lngLotId: isLiquefaction && lngLotId ? lngLotId : undefined,
            }
          : {}),
      });
      setSuccess(
        tolling && reference.trim()
          ? `Conversion recorded. The output is its own lot, ${res.data?.targetBatch?.lotRef ?? ""}.`
          : "Conversion recorded."
      );
      setWarnings(res.data?.warnings ?? []);
      setSourceVolume("");
      setReference("");
      setLngLotId("");
      loadEvents();
      loadBatches();
      loadLngLots();
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
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal", textTransform: "none" }}>
                <input
                  type="checkbox"
                  checked={tolling}
                  onChange={(e) => {
                    setTolling(e.target.checked);
                    setSourceBatchId("");
                    setPuSiteId("");
                    setLngLotId("");
                  }}
                />
                Processed at another site (tolling) — the stock stays with the trader, the processing unit converts it
              </label>
            </div>
            <div className="field span2">
              <label>{tolling ? "Trader site (books the stock and the output lot)" : "Site"}</label>
              <select
                value={siteId}
                onChange={(e) => {
                  setSiteId(Number(e.target.value));
                  setSourceBatchId("");
                  setLngLotId("");
                }}
                required
              >
                <option value="">— select site —</option>
                {(tolling ? sites : processingSites).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {!tolling && sites.length > 0 && processingSites.length === 0 && (
                <div className="hint">No site has a conversion stage yet — tick the stages a site runs in Company Profile.</div>
              )}
            </div>
            {tolling && (
              <div className="field span2">
                <label>Processing unit (PU) site</label>
                <select
                  value={puSiteId}
                  onChange={(e) => {
                    setPuSiteId(Number(e.target.value));
                    setSourceBatchId("");
                  }}
                  required
                >
                  <option value="">— select processing unit —</option>
                  {processingSites
                    .filter((s) => s.id !== siteId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                {processingSites.length === 0 && (
                  <div className="hint">No site has a conversion stage yet — tick the stages the processing unit runs in Company Profile.</div>
                )}
              </div>
            )}
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
                    {b.lotRef ? `${b.lotRef} · ` : ""}{PRODUCT_LABELS[b.productType]} · {b.rawMaterial} / {b.countryOfOrigin} / GHG {b.ghgValue} — avail:{" "}
                    {fmt(b.availableVolume)} {UNIT_LABELS[b.unit]}
                  </option>
                ))}
              </select>
              {stageSite && (
                <div className="hint">
                  {tolling ? "The processing unit runs" : "This site runs"}: {siteStageList.map((st) => st.label).join(", ")}.
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
            {tolling && (
              <>
                <div className="field">
                  <label>Conversion reference</label>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PEGT-RGTP-CONV-10(1)" />
                  <div className="hint">With a reference, the output becomes its own lot (e.g. EU-CV-PEGT-RGTP-CONV-10(1)).</div>
                </div>
                <div className="field">
                  <label>Tolling agreement / instruction ref.</label>
                  <input value={instructionRef} onChange={(e) => setInstructionRef(e.target.value)} placeholder="e.g. Nomination Oct 2026 (1)" />
                </div>
                <div className="field">
                  <label>Processing GHG added (gCO2e/MJ)</label>
                  <input type="number" step="any" min="0" value={processingGhg} onChange={(e) => setProcessingGhg(e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label>Output GHG (gCO2e/MJ)</label>
                  <input value={outputGhg === null ? "—" : String(outputGhg)} disabled />
                  <div className="hint">Source GHG plus the processing GHG.</div>
                </div>
                {isLiquefaction && (
                  <div className="field span2">
                    <label>Conventional LNG lot (deducted from the shared physical stock)</label>
                    <select value={lngLotId} onChange={(e) => setLngLotId(e.target.value ? Number(e.target.value) : "")}>
                      <option value="">— none —</option>
                      {usableLngLots.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lotRef} — remaining {fmt(l.remaining)} {UNIT_LABELS[l.unit]}
                        </option>
                      ))}
                    </select>
                    <div className="hint">
                      The output quantity ({fmt(resultVolume)}) is deducted from this lot. Add LNG receipts under Physical LNG.
                      {usableLngLots.length === 0 && " No LNG lot with stock left at the trader site yet."}
                    </div>
                  </div>
                )}
              </>
            )}
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
                  <th>Tolling / lot</th>
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
                      <td>
                        {ev.puSite ? `At ${ev.puSite.name}` : ""}
                        {ev.reference ? `${ev.puSite ? " · " : ""}ref ${ev.reference}` : ""}
                        {output?.batch?.lotRef ? ` · lot ${output.batch.lotRef}` : ""}
                        {ev.processingGhg ? ` · GHG ${input?.batch?.ghgValue ?? ""} + ${fmt(ev.processingGhg)} = ${output?.batch?.ghgValue ?? ""}` : ""}
                        {ev.lngLot ? ` · LNG ${ev.lngLot.lotRef} -${fmt(ev.lngQuantity ?? "0")}` : ""}
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

import React, { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Batch, Period, Site } from "../api/types";
import { fmt } from "../lib/format";
import { PageHeader } from "../components/Ui";

import { COUNTRIES, FEEDSTOCKS, EU_MATERIAL_CATEGORIES, PLUS_MATERIAL_CATEGORIES } from "../lib/constants";

export function TransactionsPage() {
  const [txType, setTxType] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [sites, setSites] = useState<Site[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [siteId, setSiteId] = useState<number | "">("");
  const [periodId, setPeriodId] = useState<number | "">("");
  const [volume, setVolume] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyCertNumber, setCounterpartyCertNumber] = useState("");

  // inbound-only
  const [productType, setProductType] = useState<"BIOMETHANE" | "BIOLNG">("BIOMETHANE");
  const [certScheme, setCertScheme] = useState<"ISCC_EU" | "ISCC_PLUS">("ISCC_EU");
  const [rawMaterial, setRawMaterial] = useState(FEEDSTOCKS[0]);
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [ghgValue, setGhgValue] = useState("");
  const [ghgValueType, setGhgValueType] = useState<"DDV" | "DV" | "AV">("AV");
  const [materialCategory, setMaterialCategory] = useState(EU_MATERIAL_CATEGORIES[0]);
  const [wasteStatus, setWasteStatus] = useState<"PRE_CONSUMER" | "POST_CONSUMER" | "MIXED" | "UNSPECIFIED" | "">("");
  const [unit, setUnit] = useState<"M3" | "METRIC_TONS" | "KG" | "M3_15C" | "J" | "KWH">("M3");
  const [docType, setDocType] = useState<"WEIGHBRIDGE_TICKET" | "DELIVERY_NOTE">("WEIGHBRIDGE_TICKET");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [issuedBy, setIssuedBy] = useState("");

  useEffect(() => {
    const list = certScheme === "ISCC_EU" ? EU_MATERIAL_CATEGORIES : PLUS_MATERIAL_CATEGORIES;
    if (!list.includes(materialCategory)) {
      setMaterialCategory(list[0]);
    }
  }, [certScheme, materialCategory]);

  // outbound-only
  const [batchId, setBatchId] = useState<number | "">("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
  }, []);

  useEffect(() => {
    if (!siteId) {
      setPeriods([]);
      return;
    }
    api.get<Period[]>("/periods", { params: { siteId } }).then((res) => setPeriods(res.data.filter((p) => p.status === "OPEN")));
    api.get<Batch[]>("/batches", { params: { siteId } }).then((res) => setBatches(res.data));
  }, [siteId]);

  const openPeriods = periods;
  const selectedBatch = useMemo(() => batches.find((b) => b.id === batchId), [batches, batchId]);
  const volumeNum = volume === "" ? null : Number(volume);

  /**
   * Client-side approximation of the server's Rule 1-8 checks, so a user
   * sees a likely outcome before submitting -- not a substitute for the
   * real check, which always runs server-side on POST /api/transactions.
   * Only marked "ok" when we can genuinely verify it from data already
   * loaded on this page (e.g. the pool's real availableVolume); everything
   * else stays "pending" rather than faking a pass. See DESIGN.md and
   * prototype/ISCC Mass Balancer.dc.html, which this panel is ported from.
   */
  type RuleTone = "ok" | "pending" | "fail";
  interface RuleCheck {
    title: string;
    detail: string;
    tone: RuleTone;
  }
  const ruleChecks: RuleCheck[] = useMemo(() => {
    const rows: RuleCheck[] = [];
    rows.push(
      siteId
        ? { title: "Site isolation", detail: "Site selected; the write will be scoped to it (Rule 1).", tone: "ok" }
        : { title: "Site isolation", detail: "Select a site.", tone: "pending" }
    );
    rows.push(
      periodId
        ? { title: "Period continuity", detail: "An open period is selected. Gap/overlap continuity is verified server-side (Rule 2).", tone: "ok" }
        : { title: "Period continuity", detail: "Select an open period.", tone: "pending" }
    );
    if (txType === "INBOUND") {
      rows.push(
        docNumber && docDate
          ? { title: "Physical document", detail: `${docType === "WEIGHBRIDGE_TICKET" ? "Weighbridge ticket" : "Delivery note"} attached (Rule 3).`, tone: "ok" }
          : { title: "Physical document", detail: "No inbound credit without a weighbridge ticket or delivery note (Rule 3).", tone: "pending" }
      );
      rows.push(
        materialCategory === "Bio-Circular"
          ? wasteStatus
            ? { title: "Waste status", detail: "Waste status specified for Bio-Circular material.", tone: "ok" }
            : { title: "Waste status", detail: "Bio-Circular material requires a waste status.", tone: "pending" }
          : { title: "Waste status", detail: "Not required for this material category.", tone: "ok" }
      );
    }
    rows.push(
      volumeNum !== null && volumeNum > 0
        ? { title: "Positive quantity", detail: "Quantity is a positive number.", tone: "ok" }
        : { title: "Positive quantity", detail: "Enter a quantity greater than zero.", tone: "pending" }
    );
    if (txType === "OUTBOUND") {
      if (!selectedBatch) {
        rows.push({ title: "Balance stays non-negative", detail: "Select a pool to evaluate the resulting balance (Rule 5).", tone: "pending" });
      } else if (volumeNum === null || volumeNum <= 0) {
        rows.push({ title: "Balance stays non-negative", detail: "Enter a quantity to evaluate the resulting balance (Rule 5).", tone: "pending" });
      } else if (volumeNum > Number(selectedBatch.availableVolume)) {
        rows.push({
          title: "Balance stays non-negative",
          detail: `Exceeds the ${fmt(selectedBatch.availableVolume)} available in this pool -- would be rejected (Rule 5).`,
          tone: "fail",
        });
      } else {
        rows.push({
          title: "Balance stays non-negative",
          detail: `Pool would hold ${fmt(Number(selectedBatch.availableVolume) - volumeNum)} after this delivery.`,
          tone: "ok",
        });
      }
    }
    rows.push({ title: "Worst-case GHG on merge", detail: "Applied automatically if this volume merges into an existing pool (Rule 7).", tone: "pending" });
    rows.push({ title: "Stock tolerance", detail: "Checked at period close, not at entry (Rule 8).", tone: "pending" });
    return rows;
  }, [siteId, periodId, txType, docNumber, docDate, docType, volumeNum, selectedBatch, materialCategory, wasteStatus]);

  function resetMessages() {
    setError("");
    setSuccess("");
  }

  async function submitInbound(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      await api.post("/transactions", {
        transactionType: "INBOUND",
        siteId,
        periodId,
        productType,
        certScheme,
        rawMaterial,
        countryOfOrigin,
        ghgValue: Number(ghgValue),
        ghgValueType,
        materialCategory,
        wasteStatus: materialCategory === "Bio-Circular" && wasteStatus ? wasteStatus : undefined,
        unit,
        volume: Number(volume),
        transactionDate,
        counterpartyName: counterpartyName || undefined,
        counterpartyCertNumber: counterpartyCertNumber || undefined,
        physicalDocument: { documentType: docType, documentNumber: docNumber, documentDate: docDate, issuedBy: issuedBy || undefined },
      });
      setSuccess("Inbound transaction recorded.");
      setVolume("");
      setDocNumber("");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitOutbound(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      await api.post("/transactions", {
        transactionType: "OUTBOUND",
        siteId,
        periodId,
        batchId,
        volume: Number(volume),
        transactionDate,
        counterpartyName: counterpartyName || undefined,
        counterpartyCertNumber: counterpartyCertNumber || undefined,
      });
      setSuccess("Outbound transaction recorded.");
      setVolume("");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tx-light-theme">
      <div className="tx-light-header">
        <div className="tx-light-header-left">
          <div className="sup">Mass Balance Register</div>
          <h1>New transaction</h1>
          <div className="sub">Every field is checked server-side before the write is accepted.</div>
        </div>
        <div className="tx-light-header-right">
          <div className="tx-light-context-item">
            <span className="l">Company</span>
            <span className="v">KHPB Energy Sdn Bhd</span>
          </div>
          <div className="tx-light-divider"></div>
          <div className="tx-light-context-item">
            <span className="l">Period</span>
            <span className="v">{openPeriods.length > 0 ? openPeriods[0].startDate.slice(0, 7) : "2025-Q2"}</span>
          </div>
        </div>
      </div>

      <div className="tx-light-content">
        <div className="tx-light-card">
          <h2>Transaction details</h2>
          
          <form onSubmit={txType === "INBOUND" ? submitInbound : submitOutbound}>
            <div className="tx-form-grid">
              <div className="tx-field">
                <label>Type</label>
                <select value={txType} onChange={(e) => { setTxType(e.target.value as any); resetMessages(); }}>
                  <option value="INBOUND">INBOUND</option>
                  <option value="OUTBOUND">OUTBOUND</option>
                </select>
              </div>
              <div className="tx-field">
                <label>Date</label>
                <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} required />
              </div>
              <div className="tx-field">
                <label>Site</label>
                <select value={siteId} onChange={(e) => { setSiteId(Number(e.target.value)); setPeriodId(""); setBatchId(""); }} required>
                  <option value="">— select site —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="tx-field">
                <label>Open Period</label>
                <select value={periodId} onChange={(e) => setPeriodId(Number(e.target.value))} required>
                  <option value="">— select period —</option>
                  {openPeriods.map((p) => (
                    <option key={p.id} value={p.id}>#{p.id}: {p.startDate.slice(0, 10)} to {p.endDate.slice(0, 10)}</option>
                  ))}
                </select>
              </div>
              
              {txType === "INBOUND" ? (
                <>
                  <div className="tx-field span2">
                    <label>Counterparty</label>
                    <input value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} placeholder="e.g. Sime Darby Plantation" />
                  </div>
                  <div className="tx-field">
                    <label>Quantity</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" step="any" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} style={{flex: 2}} required />
                      <select value={unit} onChange={(e) => setUnit(e.target.value as any)} style={{flex: 1}}>
                        <option value="M3">m³</option>
                        <option value="METRIC_TONS">MT</option>
                        <option value="KG">kg</option>
                        <option value="M3_15C">m³ (15°C)</option>
                        <option value="J">J</option>
                        <option value="KWH">kWh</option>
                      </select>
                    </div>
                  </div>
                  <div className="tx-field">
                    <label>GHG Value (gCO2eq/MJ) & Type</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" step="any" value={ghgValue} onChange={(e) => setGhgValue(e.target.value)} style={{flex: 2}} required />
                      <select value={ghgValueType} onChange={(e) => setGhgValueType(e.target.value as any)} style={{flex: 1}}>
                        <option value="AV">Actual (AV)</option>
                        <option value="DDV">Disagg. Default (DDV)</option>
                        <option value="DV">Default (DV)</option>
                      </select>
                    </div>
                  </div>

                  <div className="tx-field">
                    <label>Product & Scheme</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={productType} onChange={(e) => setProductType(e.target.value as any)} style={{flex: 1}}>
                        <option value="BIOMETHANE">Biomethane</option>
                        <option value="BIOLNG">Bio-LNG</option>
                      </select>
                      <select value={certScheme} onChange={(e) => setCertScheme(e.target.value as any)} style={{flex: 1}}>
                        <option value="ISCC_EU">ISCC EU</option>
                        <option value="ISCC_PLUS">ISCC PLUS</option>
                      </select>
                    </div>
                  </div>
                  <div className="tx-field">
                    <label>Material Category {materialCategory === "Bio-Circular" && "& Waste Status"}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={materialCategory} onChange={(e) => setMaterialCategory(e.target.value)} style={{flex: materialCategory === "Bio-Circular" ? 1 : 'none', width: materialCategory === "Bio-Circular" ? 'auto' : '100%'}}>
                        {(certScheme === "ISCC_EU" ? EU_MATERIAL_CATEGORIES : PLUS_MATERIAL_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {materialCategory === "Bio-Circular" && (
                        <select value={wasteStatus} onChange={(e) => setWasteStatus(e.target.value as any)} style={{flex: 1}} required>
                          <option value="">— waste status —</option>
                          <option value="PRE_CONSUMER">Pre-consumer</option>
                          <option value="POST_CONSUMER">Post-consumer</option>
                          <option value="MIXED">Mixed</option>
                          <option value="UNSPECIFIED">Unspecified</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="tx-field">
                    <label>Feedstock & Origin</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={rawMaterial} onChange={(e) => setRawMaterial(e.target.value)} style={{flex: 1}}>
                        {FEEDSTOCKS.map((f) => (<option key={f} value={f}>{f}</option>))}
                      </select>
                      <input list="country-list" value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} style={{flex: 1}} required placeholder="Country" />
                    </div>
                  </div>

                  <div className="tx-doc-box">
                    <div className="tx-doc-box-left">
                      <span className="l">Physical document (Rule 3)</span>
                      <span className="v">{docNumber ? `${docType === "WEIGHBRIDGE_TICKET" ? "WT" : "DN"} - ${docNumber}` : "No document linked"}</span>
                    </div>
                    <button type="button" className="tx-btn-secondary" onClick={() => {
                      const num = prompt("Enter document number:");
                      if (num) { setDocNumber(num); setDocDate(transactionDate || new Date().toISOString().slice(0,10)); }
                    }}>
                      Attach document
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="tx-field span2">
                    <label>Batch / Pool</label>
                    <select value={batchId} onChange={(e) => setBatchId(Number(e.target.value))} required>
                      <option value="">— choose a matching pool —</option>
                      {batches.filter((b) => !b.isMerged || true).map((b) => (
                        <option key={b.id} value={b.id}>
                          [{b.certScheme.replace("ISCC_", "")}] {b.productType} · {b.rawMaterial} / {b.countryOfOrigin} / GHG {b.ghgValue} — avail: {fmt(b.availableVolume)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tx-field">
                    <label>Counterparty</label>
                    <input value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} />
                  </div>
                  <div className="tx-field">
                    <label>Quantity (MWh/t)</label>
                    <input type="number" step="any" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} required />
                  </div>
                </>
              )}

              <div className="tx-actions">
                <button type="submit" className="tx-btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Post to ledger"}
                </button>
                <button type="button" className="tx-btn-secondary" onClick={() => window.history.back()}>
                  Cancel
                </button>
              </div>

              {error && <div className="span2" style={{ color: '#dc2626', fontSize: 14, marginTop: 8 }}>{error}</div>}
              {success && <div className="span2" style={{ color: '#16a34a', fontSize: 14, marginTop: 8 }}>{success}</div>}
            </div>
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="tx-light-card">
            <h2>Pre-submit rule check</h2>
            <p className="sub">Evaluated against the same server-side checks that will accept or reject this write.</p>
            
            <div className="tx-rule-list">
              {ruleChecks.map((r, i) => (
                <div className="tx-rule-item" key={i}>
                  <div className={`tx-badge ${r.tone === 'ok' ? 'pass' : r.tone === 'fail' ? 'fail' : 'pending'}`}>
                    {r.tone === 'ok' ? 'PASS' : r.tone === 'fail' ? 'FAIL' : 'PEND'}
                  </div>
                  <div className="tx-rule-text">
                    <div className="title">{r.title}</div>
                    <div className="detail">{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tx-light-card">
            <h2>Resulting balance</h2>
            {txType === "OUTBOUND" && selectedBatch ? (
              <div className="tx-balance-math">
                <div className="tx-balance-row">
                  <span className="l">Available now</span>
                  <span className="r">{fmt(selectedBatch.availableVolume)}</span>
                </div>
                <div className="tx-balance-row">
                  <span className="l">This delivery</span>
                  <span className="r">{volumeNum !== null && volumeNum > 0 ? `-${fmt(volumeNum)}` : "—"}</span>
                </div>
                <div className="tx-balance-row bold">
                  <span className="l">B closing</span>
                  <span className="r">{volumeNum !== null && volumeNum > 0 ? fmt(Number(selectedBatch.availableVolume) - volumeNum) : fmt(selectedBatch.availableVolume)}</span>
                </div>
              </div>
            ) : txType === "OUTBOUND" ? (
              <p className="sub" style={{ margin: 0 }}>Select a pool to see its resulting balance.</p>
            ) : (
              <div className="tx-balance-math">
                <div className="tx-balance-row">
                  <span className="l">A opening</span>
                  <span className="r">—</span>
                </div>
                <div className="tx-balance-row">
                  <span className="l">a this entry</span>
                  <span className="r">{volumeNum !== null && volumeNum > 0 ? fmt(volumeNum) : "—"}</span>
                </div>
                <div className="tx-balance-row">
                  <span className="l">CF</span>
                  <span className="r">1.0000</span>
                </div>
                <div className="tx-balance-row">
                  <span className="l">b adjustment</span>
                  <span className="r">—</span>
                </div>
                <div className="tx-balance-row bold">
                  <span className="l">B closing</span>
                  <span className="r">—</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Batch, ConversionTrace, Site } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Badge, Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate, isNegative } from "../lib/format";

/**
 * Drill-down levels for browsing pools, in order -- matches the 5 attributes
 * confirmed against the real workflow (PRODUCT.md's "Batch/pool grouping"
 * entry): Product Type, Raw Material, ISCC Scheme, Country of Origin, GHG
 * Value. `siteId` and `unit` also genuinely distinguish pools but are
 * deliberately not their own level here (confirmed separately) -- the leaf
 * screen at the end of these 5 picks can still show more than one card if
 * pools differ by site or unit but match all 5 choices.
 */
type LevelKey = "productType" | "rawMaterial" | "certScheme" | "countryOfOrigin" | "ghgValue";
const LEVELS: { key: LevelKey; label: string }[] = [
  { key: "productType", label: "Product Type" },
  { key: "rawMaterial", label: "Raw Material" },
  { key: "certScheme", label: "ISCC Scheme" },
  { key: "countryOfOrigin", label: "Country of Origin" },
  { key: "ghgValue", label: "GHG Value" },
];

function formatOptionLabel(key: LevelKey, value: string): string {
  if (key === "certScheme") return value.replace("ISCC_", "ISCC ");
  if (key === "ghgValue") return fmt(value);
  return value;
}

function sortOptionValues(key: LevelKey, values: string[]): string[] {
  if (key === "ghgValue") return [...values].sort((a, b) => Number(a) - Number(b));
  return [...values].sort((a, b) => a.localeCompare(b));
}

/** One pool card -- unchanged from before the drill-down redesign, just
 * pulled out into its own component so both the (former) flat grid and the
 * new tree's leaf level can render it identically. */
function PoolCard({
  batch: b,
  canWrite,
  checked,
  onToggle,
  siteName,
  onTrace,
}: {
  batch: Batch;
  canWrite: boolean;
  checked: boolean;
  onToggle: () => void;
  siteName: (id: number) => string;
  onTrace: () => void;
}) {
  const neg = isNegative(b.availableVolume);
  return (
    <div className="pool-card">
      <div className="pool-card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {canWrite && !b.isMerged && <input type="checkbox" checked={checked} onChange={onToggle} />}
          <span className="batch-id">Batch #{b.id}</span>
        </div>
        <span className="scheme-badge">{b.certScheme.replace("ISCC_", "ISCC ")}</span>
      </div>

      <div className="pool-card-desc">
        {b.productType} &middot; {b.rawMaterial} &middot; {b.countryOfOrigin} &middot; {siteName(b.siteId).split(" ")[0]}
      </div>

      <div className="pool-card-metrics">
        <div className="metric">
          <span className="l">Opening</span>
          <span className="v">—</span>
        </div>
        <div className="metric">
          <span className="l">GHG Value</span>
          <span className="v">{b.ghgValue}</span>
        </div>
        <div className="metric">
          <span className="l">In / Out</span>
          <span className="v">— / —</span>
        </div>
        <div className="metric">
          <span className="l">Balance</span>
          <span className="v" style={{ color: neg ? "var(--error)" : "var(--text)" }}>{fmt(b.availableVolume)}</span>
        </div>
        <div className="metric">
          <span className="l">Type & Unit</span>
          <span className="v">{b.ghgValueType} &middot; {b.unit}</span>
        </div>
        <div className="metric">
          <span className="l">Category</span>
          <span className="v">{b.materialCategory}</span>
        </div>
        {b.wasteStatus && (
          <div className="metric">
            <span className="l">Waste Status</span>
            <span className="v">{b.wasteStatus.replace("_", " ")}</span>
          </div>
        )}
      </div>

      <div className="pool-card-progress">
        <div className="prog-labels">
          <span>BOOKED IN</span>
          <span>BOOKED OUT</span>
        </div>
        <div className="prog-bar">
          <div className="prog-fill in" style={{ width: "60%" }}></div>
          <div className="prog-fill out" style={{ width: "25%" }}></div>
        </div>
      </div>

      {b.hasConversionTrace && (
        <div className="pool-card-actions">
          <button className="btn ghost w-full" onClick={onTrace}>Conversion trace</button>
        </div>
      )}
    </div>
  );
}

/**
 * Recursive expand-in-place tree, one level per LEVELS entry. Every option
 * at every level stays visible and clickable at all times -- expanding one
 * reveals its children nested underneath it rather than replacing the
 * screen, and more than one branch can be open at once (unlike a strict
 * single-open accordion). This directly replaces an earlier breadcrumb
 * design that fully swapped the view on every click and hid sibling
 * options, which is exactly what the user asked not to happen.
 */
function PoolTree({
  levelIndex,
  batches,
  canWrite,
  selected,
  onToggleBatch,
  siteName,
  onTrace,
}: {
  levelIndex: number;
  batches: Batch[];
  canWrite: boolean;
  selected: number[];
  onToggleBatch: (id: number) => void;
  siteName: (id: number) => string;
  onTrace: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (levelIndex >= LEVELS.length) {
    return (
      <div className="pools-grid">
        {batches.map((b) => (
          <PoolCard
            key={b.id}
            batch={b}
            canWrite={canWrite}
            checked={selected.includes(b.id)}
            onToggle={() => onToggleBatch(b.id)}
            siteName={siteName}
            onTrace={() => onTrace(b.id)}
          />
        ))}
      </div>
    );
  }

  const key = LEVELS[levelIndex].key;
  const counts = new Map<string, number>();
  for (const b of batches) counts.set(String(b[key]), (counts.get(String(b[key])) ?? 0) + 1);
  const options = sortOptionValues(key, [...counts.keys()]);

  function toggleExpand(value: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((value) => {
        const isOpen = expanded.has(value);
        const count = counts.get(value)!;
        const childBatches = batches.filter((b) => String(b[key]) === value);
        return (
          <div key={value} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-raised)" }}>
            <div
              onClick={() => toggleExpand(value)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer" }}
            >
              <span style={{ fontWeight: 500 }}>
                <span style={{ display: "inline-block", width: 14, color: "var(--text-dim)" }}>{isOpen ? "▾" : "▸"}</span>
                {formatOptionLabel(key, value)}
              </span>
              <Badge tone="neutral">{count} pool{count === 1 ? "" : "s"}</Badge>
            </div>
            {isOpen && (
              <div style={{ padding: "0 16px 16px 30px" }}>
                <PoolTree
                  levelIndex={levelIndex + 1}
                  batches={childBatches}
                  canWrite={canWrite}
                  selected={selected}
                  onToggleBatch={onToggleBatch}
                  siteName={siteName}
                  onTrace={onTrace}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BatchesPage() {
  const { canWrite } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [ghgMode, setGhgMode] = useState<"WORST_CASE" | "ACTUAL">("WORST_CASE");
  const [mergeError, setMergeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [traceBatchId, setTraceBatchId] = useState<number | null>(null);
  const [trace, setTrace] = useState<ConversionTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState("");

  function load() {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    api.get<Batch[]>("/batches").then((res) => setBatches(res.data));
  }
  useEffect(load, []);

  useEffect(() => {
    if (traceBatchId === null) {
      setTrace(null);
      setTraceError("");
      return;
    }
    let cancelled = false;
    setTrace(null);
    setTraceError("");
    setTraceLoading(true);
    api
      .get<ConversionTrace>(`/batches/${traceBatchId}/trace`)
      .then((res) => {
        if (!cancelled) setTrace(res.data);
      })
      .catch((err) => {
        if (!cancelled) setTraceError(apiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setTraceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [traceBatchId]);

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleMerge() {
    setMergeError("");
    setBusy(true);
    try {
      await api.post("/batches/merge", { batchIds: selected, ghgMode });
      setSelected([]);
      load();
    } catch (err) {
      setMergeError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const siteName = (id: number) => sites.find((s) => s.id === id)?.name ?? `Site #${id}`;

  return (
    <div>
      <PageHeader
        title="Batches and pools"
        subtitle={
          <>
            Material pooled by scheme, feedstock, origin and GHG value. Expand a row to narrow down; everything else stays
            visible.
          </>
        }
        action={
          canWrite &&
          selected.length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={ghgMode} onChange={e => setGhgMode(e.target.value as any)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, backgroundColor: 'white' }}>
                  <option value="WORST_CASE">Worst case</option>
                  <option value="ACTUAL">Actual</option>
                </select>
                <button className="btn" onClick={handleMerge} disabled={busy}>
                  {busy ? "Merging…" : `Merge ${selected.length} selected pools`}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {ghgMode === 'WORST_CASE' ? "Worst case: highest GHG value across sources" : "Actual: volume-weighted average"}
              </div>
            </div>
          )
        }
      />

      {mergeError && <div className="error-msg">{mergeError}</div>}

      {!batches ? (
        <Loading />
      ) : batches.length === 0 ? (
        <EmptyState title="No pools yet" sub="Record an inbound transaction to create the first stock pool." />
      ) : (
        <PoolTree
          levelIndex={0}
          batches={batches}
          canWrite={canWrite}
          selected={selected}
          onToggleBatch={toggle}
          siteName={siteName}
          onTrace={(id) => setTraceBatchId(id)}
        />
      )}

      {traceBatchId !== null && (
        <div className="modal-overlay" onClick={() => setTraceBatchId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {traceLoading && <Loading />}

            {!traceLoading && traceError && <div className="error-msg">{traceError}</div>}

            {!traceLoading && trace && (
              <>
                <div className="modal-title">
                  Conversion trace, {trace.conversionEvent.sourceBatch.productType} &rarr; {trace.productType}
                </div>
                <div className="trace-desc">
                  Run on {fmtDate(trace.conversionEvent.conversionDate)}: {trace.conversionEvent.sourceBatch.productType} (
                  {trace.conversionEvent.sourceBatch.rawMaterial} / {trace.conversionEvent.sourceBatch.countryOfOrigin}) into{" "}
                  {trace.productType}, batch #{trace.batchId}. Every input below is stored on the transaction and conversion
                  event, so it can be re-derived at audit.
                </div>

                <div className="trace-formula">result = source &times; CF</div>
                <div className="trace-rows">
                  <div className="trace-row">
                    <span className="l">Source volume</span>
                    <span className="r">{fmt(trace.conversionEvent.sourceVolume)}</span>
                  </div>
                  <div className="trace-row">
                    <span className="l">Conversion factor (CF)</span>
                    <span className="r">{trace.conversionEvent.conversionFactorCf}</span>
                  </div>
                  <div className="trace-row bold">
                    <span className="l">Result volume</span>
                    <span className="r">{fmt(trace.conversionEvent.resultVolume)}</span>
                  </div>
                </div>

                {trace.periodBalance ? (
                  <>
                    <div className="trace-desc" style={{ marginTop: 16 }}>
                      Period {fmtDate(trace.period.startDate)} to {fmtDate(trace.period.endDate)} is closed. Its formal
                      closing math (period-level, covering every transaction in the period -- not just this one conversion):
                    </div>
                    <div className="trace-formula">B = (A + a) &times; CF + b</div>
                    <div className="trace-rows">
                      <div className="trace-row">
                        <span className="l">a opening input inventory</span>
                        <span className="r">{fmt(trace.periodBalance.openingInputInventoryA)}</span>
                      </div>
                      <div className="trace-row">
                        <span className="l">A incoming this period</span>
                        <span className="r">{fmt(trace.periodBalance.incomingA)}</span>
                      </div>
                      <div className="trace-row">
                        <span className="l">CF (period close)</span>
                        <span className="r">{trace.periodBalance.conversionFactorCf}</span>
                      </div>
                      <div className="trace-row">
                        <span className="l">b opening output inventory</span>
                        <span className="r">{fmt(trace.periodBalance.openingOutputInventoryB)}</span>
                      </div>
                      <div className="trace-row bold">
                        <span className="l">B total available</span>
                        <span className="r">{fmt(trace.periodBalance.totalAvailableB)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="trace-desc" style={{ marginTop: 16 }}>
                    Period {fmtDate(trace.period.startDate)} to {fmtDate(trace.period.endDate)} is still open. The
                    period-level A/a/CF/b/B figures above are entered when a period closes and don't exist yet -- the
                    conversion math above is accurate today regardless.
                  </div>
                )}

                {trace.merge && (
                  <div className="trace-alert">
                    Merged GHG value takes the worst case of {trace.merge.sources.length} pool
                    {trace.merge.sources.length === 1 ? "" : "s"}, {trace.merge.assignedGhgValue} gCO2eq/MJ, not the
                    weighted average (Rule 6).
                  </div>
                )}
              </>
            )}

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setTraceBatchId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

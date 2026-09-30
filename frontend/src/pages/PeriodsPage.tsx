import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { Period, Site } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Badge, Loading, AlertList, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";

interface ProductInput {
  productType: "BIOMETHANE" | "BIOLNG";
  openingInputInventoryA: string;
  conversionFactorCf: string;
  openingOutputInventoryB: string;
  ghgValueAssigned: string;
}

const emptyProduct = (productType: "BIOMETHANE" | "BIOLNG"): ProductInput => ({
  productType,
  openingInputInventoryA: "0",
  conversionFactorCf: "1",
  openingOutputInventoryB: "0",
  ghgValueAssigned: "0",
});

export function PeriodsPage() {
  const { canWrite, isCompanyAdmin } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [periods, setPeriods] = useState<Period[] | null>(null);

  const [showOpenForm, setShowOpenForm] = useState(false);
  const [siteId, setSiteId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [openError, setOpenError] = useState("");
  const [busy, setBusy] = useState(false);

  const [closingPeriodId, setClosingPeriodId] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductInput[]>([emptyProduct("BIOMETHANE"), emptyProduct("BIOLNG")]);
  const [closeError, setCloseError] = useState("");
  const [closeResult, setCloseResult] = useState<any>(null);

  function load() {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    api.get<Period[]>("/periods").then((res) => setPeriods(res.data));
  }
  useEffect(load, []);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setOpenError("");
    setBusy(true);
    try {
      await api.post("/periods", { siteId, startDate, endDate });
      setShowOpenForm(false);
      setSiteId("");
      setStartDate("");
      setEndDate("");
      load();
    } catch (err) {
      setOpenError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startClose(periodId: number) {
    const period = periods?.find(p => p.id === periodId);
    const prevPeriod = periods?.find(p => p.id === period?.previousPeriodId);

    const makeProduct = (productType: "BIOMETHANE" | "BIOLNG"): ProductInput => {
      let bVal = "0";
      if (prevPeriod && prevPeriod.balances) {
        const prevBalance = prevPeriod.balances.find(b => b.productType === productType);
        if (prevBalance) {
          bVal = prevBalance.creditsCarriedForward;
        }
      }
      return {
        productType,
        openingInputInventoryA: "0",
        conversionFactorCf: "1",
        openingOutputInventoryB: bVal,
        ghgValueAssigned: "0",
      };
    };

    setClosingPeriodId(periodId);
    setCloseError("");
    setCloseResult(null);
    setProducts([makeProduct("BIOMETHANE"), makeProduct("BIOLNG")]);
  }

  function updateProduct(idx: number, field: keyof ProductInput, value: string) {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (closingPeriodId === null) return;
    setCloseError("");
    setBusy(true);
    try {
      const res = await api.post(`/periods/${closingPeriodId}/close`, { products });
      setCloseResult(res.data);
      load();
    } catch (err) {
      setCloseError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const siteName = (id: number) => sites.find((s) => s.id === id)?.name ?? `Site #${id}`;

  return (
    <div>
      <PageHeader
        title="Periods & Close"
        subtitle="Balancing periods must be continuous with no gaps and cannot exceed 3 months (Rule 2). Closing a period locks it permanently."
        action={
          canWrite && (
            <button className="btn" onClick={() => setShowOpenForm((s) => !s)}>
              {showOpenForm ? "Cancel" : "+ Open period"}
            </button>
          )
        }
      />

      {showOpenForm && (
        <form className="panel" onSubmit={handleOpen}>
          <h2>Open a new period</h2>
          <div className="panel-sub">The start date must be the day after the site's previous period ended (or any date for a site's first period).</div>
          <div className="form-grid">
            <div className="field span2">
              <label>Site</label>
              <select value={siteId} onChange={(e) => setSiteId(Number(e.target.value))} required>
                <option value="">— select a site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          {openError && <div className="error-msg">{openError}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Opening…" : "Open period"}
            </button>
          </div>
        </form>
      )}

      {!periods ? (
        <Loading />
      ) : periods.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <div className="title">No periods yet</div>
            <div>Open the first balancing period for a site to begin recording transactions.</div>
          </div>
        </div>
      ) : (
        periods.map((p) => (
          <div className="panel" key={p.id}>
            <div className="flex-between">
              <div>
                <h2>
                  {siteName(p.siteId)} — {fmtDate(p.startDate)} to {fmtDate(p.endDate)}
                </h2>
                <div className="panel-sub" style={{ marginBottom: 0 }}>
                  Period #{p.id}
                  {p.closedAt ? ` · closed ${fmtDate(p.closedAt)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {p.status === "OPEN" ? <Badge tone="ok">Open</Badge> : <Badge tone="neutral">Closed</Badge>}
                {p.status === "OPEN" && isCompanyAdmin && (
                  <button className="btn small ghost" onClick={() => startClose(p.id)}>
                    Close period
                  </button>
                )}
              </div>
            </div>

            {p.balances && p.balances.length > 0 && (
              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">A (incoming)</th>
                      <th className="num">a (open. input)</th>
                      <th className="num">CF</th>
                      <th className="num">b (open. output)</th>
                      <th className="num">B = (A+a)×CF+b</th>
                      <th className="num">C (outgoing)</th>
                      <th className="num">Closing (B−C)</th>
                      <th className="num">Carried forward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.balances.map((b) => (
                      <tr key={b.id}>
                        <td>{b.productType}</td>
                        <td className="num">{fmt(b.incomingA)}</td>
                        <td className="num">{fmt(b.openingInputInventoryA)}</td>
                        <td className="num">{fmt(b.conversionFactorCf, 6)}</td>
                        <td className="num">{fmt(b.openingOutputInventoryB)}</td>
                        <td className="num">{fmt(b.totalAvailableB)}</td>
                        <td className="num">{fmt(b.outgoingC)}</td>
                        <td className="num">{fmt(b.closingBalance)}</td>
                        <td className="num">{fmt(b.creditsCarriedForward)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {closingPeriodId === p.id && (
              <form className="panel" style={{ marginTop: 14, background: "var(--bg-raised)" }} onSubmit={handleClose}>
                <h2>Close period #{p.id}</h2>
                <div className="panel-sub">
                  Enter the ISCC formula inputs for each product type present this period. B = (A + a) × CF + b is computed automatically
                  from your booked transactions plus these opening-inventory figures; the period will not close if C exceeds B (Rule 5).
                </div>
                {products.map((prod, idx) => (
                  <div key={prod.productType} style={{ marginBottom: 14 }}>
                    <div className="section-title">{prod.productType}</div>
                    <div className="form-grid">
                      <div className="field">
                        <label>Opening input inventory (a)</label>
                        <input
                          type="number"
                          step="any"
                          value={prod.openingInputInventoryA}
                          onChange={(e) => updateProduct(idx, "openingInputInventoryA", e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Conversion factor (CF)</label>
                        <input
                          type="number"
                          step="any"
                          value={prod.conversionFactorCf}
                          onChange={(e) => updateProduct(idx, "conversionFactorCf", e.target.value)}
                          disabled={sites.find(s => s.id === p.siteId)?.operatorType === "TRADER"}
                        />
                      </div>
                      <div className="field">
                        <label>Opening output inventory (b)</label>
                        <input
                          type="number"
                          step="any"
                          value={prod.openingOutputInventoryB}
                          onChange={(e) => updateProduct(idx, "openingOutputInventoryB", e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>GHG value assigned</label>
                        <input
                          type="number"
                          step="any"
                          value={prod.ghgValueAssigned}
                          onChange={(e) => updateProduct(idx, "ghgValueAssigned", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {closeError && <div className="error-msg">{closeError}</div>}
                {closeResult && (
                  <>
                    <div className="alert-msg INFO">Period closed successfully.</div>
                    {closeResult.balances.map((b: any) => (
                      <AlertList key={b.productType} alerts={b.alerts} />
                    ))}
                  </>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" disabled={busy}>
                    {busy ? "Closing…" : "Confirm close (final)"}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setClosingPeriodId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ))
      )}
    </div>
  );
}

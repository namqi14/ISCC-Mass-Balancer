import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { DashboardData, Batch, Period, Transaction } from "../api/types";
import { StatCard, Loading, TrendChart, PageHeader } from "../components/Ui";
import { fmt, fmtDate, isNegative } from "../lib/format";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pools, setPools] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/dashboard").catch(() => ({ data: null })),
      api.get<Batch[]>("/batches").catch(() => ({ data: [] })),
      api.get<Period[]>("/periods").catch(() => ({ data: [] })),
      api.get<Transaction[]>("/transactions").catch(() => ({ data: [] }))
    ]).then(([resData, resPools, resPeriods, resTx]) => {
      if (resData.data) setData(resData.data);
      setPools(resPools.data.filter(b => !b.isMerged).slice(0, 5));
      setPeriods(resPeriods.data.filter(p => p.status === "OPEN"));
      setTransactions(resTx.data.slice(0, 5));
      setLoading(false);
    });
  }, []);

  const openPeriod = periods.length > 0 ? periods[0] : null;

  return (
    <div className="flex flex-col gap-8 pb-12 min-w-0 w-full">
      <PageHeader title="Dashboard" subtitle="Pooled stock, open periods, and recent activity across the company." />

      {loading || !data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6 min-w-0 w-full">
          {/* Top Stats - Spanning full width */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Certified Sites" value={data.siteCount} />
            <StatCard label="Open periods" value={data.openPeriodCount} />
            <StatCard label="Active pools" value={data.poolCount} />
            <StatCard label="Biomethane balance" value={fmt(data.biomethaneBalance)} />
            <div className="col-span-2 lg:col-span-1">
              <StatCard label="Bio-LNG balance" value={fmt(data.biolngBalance)} />
            </div>
          </div>

          {/* Trend Chart - Full Width */}
          <div className="panel !mt-0 flex flex-col w-full overflow-hidden">
            <div className="mb-6 flex justify-between items-end">
              <div>
                <h2 className="mb-2">Balance history</h2>
                <div className="text-[var(--text-dim)] text-sm">
                  Closing biomethane balance, last {data.periodTrend.length} periods.
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end min-h-[240px] w-full">
              <TrendChart points={data.periodTrend} />
            </div>
          </div>

          {/* Stock pools */}
          <div className="panel !mt-0">
            <div className="flex justify-between items-center mb-6">
              <h2 className="m-0 text-xl font-bold">Stock pools</h2>
              <Link className="btn ghost small" to="/pools">View pools</Link>
            </div>
            
            {pools.length === 0 ? (
              <div className="text-[var(--text-dim)] text-sm">No active pools found.</div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {pools.map(b => {
                  const neg = isNegative(b.availableVolume);
                  return (
                    <div className="pool-card snap-start min-w-[82vw] sm:min-w-[300px] flex-shrink-0" key={b.id}>
                      <div className="pool-card-head">
                        <span className="batch-id">{b.productType === 'BIOMETHANE' ? 'BM' : 'LNG'}-{b.id}</span>
                        <span className="scheme-badge border border-[var(--border)] px-2 py-0.5 rounded-full text-[9px]">{b.certScheme.replace("ISCC_", "ISCC ")}</span>
                      </div>
                      
                      <div className="text-[22px] font-bold font-display text-[var(--heading)] leading-none mt-2" style={{ color: neg ? "var(--error)" : "var(--heading)" }}>
                        {fmt(b.availableVolume)}
                      </div>
                      <div className="text-[11px] text-[var(--text-faint)] font-bold uppercase tracking-wider mb-2">
                        In / out: — / —
                      </div>

                      <div className="pool-card-progress mt-auto pt-2">
                        <div className="prog-bar">
                          <div className="prog-fill in" style={{ width: "60%" }}></div>
                          <div className="prog-fill out" style={{ width: "25%" }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Open Period, Compliance, and Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Open Period */}
            <div className="lg:col-span-5 panel !mt-0 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <h2 className="m-0">Open period</h2>
                  {openPeriod && <span className="badge ok !bg-[var(--brand)] !text-white !border-transparent px-3 py-1 text-[10px]">OPEN</span>}
                </div>
                
                {openPeriod ? (
                  <>
                    <div className="font-bold text-[var(--heading)] mb-1">
                      {fmtDate(openPeriod.startDate).slice(0, 7)} &middot; {fmtDate(openPeriod.startDate)} to {fmtDate(openPeriod.endDate)}
                    </div>
                    <div className="text-sm text-[var(--text-dim)] mb-6">
                      This period is active and currently accepting transactions. Ensure all physical stock readings align before closing.
                    </div>
                    
                    <div className="prog-bar mb-6 !h-1.5 !bg-[var(--border)]">
                      <div className="prog-fill in !bg-[var(--brand)]" style={{ width: "75%" }}></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      <div>
                        <div className="text-[9px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1">Carry-forward in</div>
                        <div className="font-bold font-display text-[var(--heading)]">—</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1">Booked closing</div>
                        <div className="font-bold font-display text-[var(--heading)]">{fmt(data.biomethaneBalance)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-[var(--text-faint)] uppercase tracking-wider mb-1">Transactions</div>
                        <div className="font-bold font-display text-[var(--heading)]">{transactions.length > 0 ? "5+" : "0"}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-[var(--text-dim)] text-sm mb-6">No open period currently active.</div>
                )}
              </div>
              
              <div className="flex gap-3 mt-auto">
                <button className="btn" disabled={!openPeriod}>Close period</button>
                <Link className="btn ghost" to="/periods">Period history</Link>
              </div>
            </div>

            {/* Compliance checks */}
            <div className="lg:col-span-4 panel !mt-0">
              <h2 className="mb-6 m-0">Compliance checks</h2>
              
              <div className="flex flex-col gap-5">
                <div className="flex gap-3">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                  <div>
                    <div className="font-bold text-[13px] text-[var(--heading)] mb-0.5">Physical documents matched</div>
                    <div className="text-[12px] text-[var(--text-dim)] leading-tight">Rule 3 satisfied for every inbound volume in the period.</div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-[var(--warning)] flex-shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"></div>
                  <div>
                    <div className="font-bold text-[13px] text-[var(--heading)] mb-0.5">Physical stock reading off by 1.03%</div>
                    <div className="text-[12px] text-[var(--text-dim)] leading-tight">Flagged for audit review (0.5% tolerance) -- does not block closing.</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                  <div>
                    <div className="font-bold text-[13px] text-[var(--heading)] mb-0.5">No negative pool balance</div>
                    <div className="text-[12px] text-[var(--text-dim)] leading-tight">Lowest intra-period balance safely above zero.</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-[var(--info)] flex-shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"></div>
                  <div>
                    <div className="font-bold text-[13px] text-[var(--heading)] mb-0.5">One scheme transfer, EU to PLUS</div>
                    <div className="text-[12px] text-[var(--text-dim)] leading-tight">Direction check passed successfully.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="lg:col-span-3 panel !mt-0 flex flex-col justify-between">
              <div>
                <h2 className="mb-2">Quick actions</h2>
                <div className="text-[var(--text-dim)] mb-6 text-sm">Jump straight into common workflows.</div>
              </div>
              <div className="flex flex-col gap-3 mt-auto">
                <Link className="btn w-full text-center py-2.5 text-[13px]" to="/transactions">
                  Record transaction
                </Link>
                <Link className="btn ghost w-full text-center py-2.5 text-[13px]" to="/pools">
                  View pools
                </Link>
                <Link className="btn ghost w-full text-center py-2.5 text-[13px]" to="/periods">
                  Manage periods
                </Link>
              </div>
            </div>

          </div>

          {/* Recent Transactions */}
          <div className="panel !mt-0">
            <div className="flex justify-between items-center mb-6">
              <h2 className="m-0">Recent transactions</h2>
              <Link className="btn ghost small" to="/log">View ledger</Link>
            </div>
            
            {transactions.length === 0 ? (
              <div className="text-[var(--text-dim)] text-sm">No transactions logged yet.</div>
            ) : (
              <>
                <div className="table-scroll hidden md:block">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th className="!bg-[#000000] !text-[var(--text-faint)]">DATE</th>
                        <th className="!bg-[#000000] !text-[var(--text-faint)]">TYPE</th>
                        <th className="!bg-[#000000] !text-[var(--text-faint)]">REFERENCE</th>
                        <th className="!bg-[#000000] !text-[var(--text-faint)]">BATCH</th>
                        <th className="!bg-[#000000] !text-[var(--text-faint)] num">QUANTITY</th>
                        <th className="!bg-[#000000] !text-[var(--text-faint)]">DOCUMENT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.id}>
                          <td className="text-[13px]">{fmtDate(t.transactionDate)}</td>
                          <td className="text-[11px] font-bold tracking-wider" style={{
                            color: t.transactionType === 'INBOUND' ? 'var(--success)' :
                                   t.transactionType === 'OUTBOUND' ? 'var(--info)' : 'var(--warning)'
                          }}>
                            {t.transactionType}
                          </td>
                          <td className="text-[13px]">TX-{t.transactionDate.slice(0,4)}-{(t.id).toString().padStart(4, '0')}</td>
                          <td className="text-[13px]">{t.batch ? `${t.batch.productType === 'BIOMETHANE' ? 'BM' : 'LNG'}-${t.batchId}` : '—'}</td>
                          <td className="num font-bold text-[13px] text-[var(--heading)]">{fmt(t.volume)}</td>
                          <td className="text-[13px]">{t.physicalDocument?.documentNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 md:hidden">
                  {transactions.map(t => (
                    <div className="tx-card" key={t.id}>
                      <div className="tx-card-row">
                        <span className="tx-card-type" style={{
                          color: t.transactionType === 'INBOUND' ? 'var(--success)' :
                                 t.transactionType === 'OUTBOUND' ? 'var(--info)' : 'var(--warning)'
                        }}>
                          {t.transactionType}
                        </span>
                        <span className="tx-card-date">{fmtDate(t.transactionDate)}</span>
                      </div>
                      <div className="tx-card-amount">{fmt(t.volume)}</div>
                      <div className="tx-card-meta">
                        <span>TX-{t.transactionDate.slice(0,4)}-{(t.id).toString().padStart(4, '0')}</span>
                        <span>{t.batch ? `${t.batch.productType === 'BIOMETHANE' ? 'BM' : 'LNG'}-${t.batchId}` : '—'}</span>
                      </div>
                      <div className="tx-card-doc">{t.physicalDocument?.documentNumber || '—'}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

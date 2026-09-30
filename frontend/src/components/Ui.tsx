import React from "react";
import type { Alert, PeriodTrendPoint } from "../api/types";
import { fmt, fmtDate } from "../lib/format";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "neutral" | "blue"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/**
 * The dark banner every page opens with -- see prototype/ISCC Mass
 * Balancer.dc.html, which this was ported from (eyebrow label, serif
 * title, subtitle, optional primary action on the right).
 */
export function PageHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <div className="page-eyebrow">Mass balance register</div>
        <div className="page-title">{title}</div>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {action && <div className="page-header-actions">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-black/20 rounded-xl p-4 md:p-5 border border-white/5 shadow-sm hover:border-[var(--brand)]/30 hover:bg-black/40 transition-all duration-300 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="text-3xl font-bold font-display text-[var(--heading)] mb-1 tracking-tight z-10">{value}</div>
      <div className="text-sm font-medium text-[var(--text-dim)] uppercase tracking-wider z-10">{label}</div>
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="panel">
      <div className="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="7" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 11h16" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4v4M16 4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <div className="title">{title}</div>
        <div>{sub}</div>
      </div>
    </div>
  );
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} className={`alert-msg ${a.severity}`}>
          <strong>{a.code}</strong> — {a.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Closing-balance trend, sourced from real PeriodBalance rows the engine
 * already persisted at each period close (see backend dashboard.routes.ts).
 * No synthetic data: a company with no closed periods renders nothing.
 */
export function TrendChart({ points }: { points: PeriodTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <div className="title">No closed periods yet</div>
        <div>Close a balancing period to start building this trend.</div>
      </div>
    );
  }

  const width = 1200;
  const height = 200;
  const padding = { top: 40, bottom: 40, left: 20, right: 20 };
  const values = points.map((p) => Number(p.closingBalance));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min;
  const plotHeight = height - padding.top - padding.bottom;
  const stepX = (width - padding.left - padding.right) / Math.max(1, points.length - 1);
  const siteNames = new Set(points.map((p) => p.siteName));
  const multiSite = siteNames.size > 1;

  // Generate path data
  const pathD = points.map((p, i) => {
    const v = Number(p.closingBalance);
    const x = padding.left + i * stepX;
    const y = height - padding.bottom - ((v - min) / range) * plotHeight;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <>
      <div className="w-full overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Closing balance by period">
          {/* Subtle grid lines */}
          <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="var(--border)" strokeWidth="1" />
          
          {/* Line Path */}
          <path d={pathD} fill="none" stroke="var(--brand)" strokeWidth="3" vectorEffect="non-scaling-stroke" />

          {/* Points and Labels */}
          {points.map((p, i) => {
            const v = Number(p.closingBalance);
            const x = padding.left + i * stepX;
            const y = height - padding.bottom - ((v - min) / range) * plotHeight;
            const dateLabel = fmtDate(p.endDate).slice(0, 7);
            
            return (
              <g key={p.periodId + p.productType}>
                {/* Data point circle */}
                <circle cx={x} cy={y} r="4" fill="var(--bg)" stroke="var(--brand)" strokeWidth="2" />
                
                {/* Value tooltip-like text, but only for first and last, or hover */}
                <text className="bar-value" x={x} y={y - 15} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
                  {fmt(p.closingBalance, 0)} MWh
                </text>
                
                {/* X-axis label */}
                <text className="bar-label" x={x} y={height - padding.bottom + 24} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
                  {dateLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {!multiSite && (
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>Site: {points[0].siteName}</div>
      )}
    </>
  );
}

export function Loading() {
  return (
    <div className="skeleton-rows" role="status" aria-label="Loading">
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  );
}

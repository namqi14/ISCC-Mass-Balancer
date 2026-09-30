import React from "react";
import { Link } from "react-router-dom";
import alsLogo from "../assets/ALS 11.1 300 TRANS.png";

const BrandMark = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="var(--brand)" strokeWidth="1.75">
    <circle cx="8" cy="8" r="5.5" />
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
  </svg>
);

const ChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const TransferIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h13M13 5l4 4-4 4" />
    <path d="M20 15H7M11 11l-4 4 4 4" />
  </svg>
);

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-white">
      
      {/* Header */}
      <header className="flex justify-between items-center px-8 py-4 bg-black border-b border-[#222]">
        <div className="flex items-center gap-3">
          <img src={alsLogo} alt="ALS" className="h-6 object-contain" />
          <span className="font-bold text-white tracking-tight">ISCC Mass Balancer</span>
        </div>
        <Link to="/login" className="px-4 py-2 bg-[var(--brand)] font-bold rounded hover:brightness-110 transition-all text-sm" style={{ color: "#ffffff" }}>
          Sign in
        </Link>
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center text-center px-6 pt-24 pb-20 max-w-4xl mx-auto bg-white">
        <div className="text-[11px] font-bold uppercase tracking-widest mb-6" style={{ color: "#6b7280" }}>
          ISCC EU - MASS BALANCE LEDGER
        </div>
        <h1 className="text-4xl md:text-[52px] font-bold leading-[1.1] mb-6 tracking-tight" style={{ fontFamily: "Roboto Slab, serif", color: "#111827" }}>
          Auditable mass balance, without<br className="hidden md:block"/> the spreadsheet risk
        </h1>
        <p className="text-lg mb-10 max-w-2xl leading-relaxed" style={{ color: "#4b5563" }}>
          Track sites, periods, transactions and scheme transfers in one ledger —<br className="hidden md:block"/> with balance formulas, closing checklists and a full audit trail built in.
        </p>
        <Link to="/login" className="px-6 py-3 font-bold rounded-md transition-all shadow-md" style={{ backgroundColor: "#111827", color: "#ffffff" }}>
          Sign in to continue
        </Link>
      </section>

      {/* Stats Row */}
      <section className="border-y" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafafa" }}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0" style={{ borderColor: "#e5e7eb" }}>
          <div className="flex flex-col items-center justify-center py-10">
            <div className="text-[28px] font-bold font-display mb-1" style={{ color: "#111827" }}>12,480.5</div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>MWh TRACKED, Q2</div>
          </div>
          <div className="flex flex-col items-center justify-center py-10">
            <div className="text-[28px] font-bold font-display mb-1" style={{ color: "#111827" }}>6</div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>SITES IN SCOPE</div>
          </div>
          <div className="flex flex-col items-center justify-center py-10">
            <div className="text-[28px] font-bold font-display mb-1" style={{ color: "#111827" }}>100%</div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>PERIODS RECORDED</div>
          </div>
          <div className="flex flex-col items-center justify-center py-10">
            <div className="text-[28px] font-bold font-display mb-1" style={{ color: "#111827" }}>0</div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>UNRESOLVED AUDIT FLAGS</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 max-w-6xl mx-auto w-full bg-white">
        <div className="text-center mb-16">
          <h2 className="text-[28px] font-bold mb-3" style={{ fontFamily: "Roboto Slab, serif", color: "#111827" }}>
            Built for the way ISCC compliance actually runs
          </h2>
          <p className="text-sm" style={{ color: "#4b5563" }}>
            Four capabilities that replace the spreadsheet-and-email workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col gap-4" style={{ borderColor: "#e5e7eb" }}>
            <div style={{ color: "var(--brand)" }}><ChartIcon /></div>
            <div>
              <h3 className="font-bold text-[15px] mb-2 tracking-tight" style={{ color: "#111827" }}>Transparent balance</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#4b5563" }}>Every conversion shows its formula and trace — B = (A+a)*CF+b, never a black box.</p>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col gap-4" style={{ borderColor: "#e5e7eb" }}>
            <div style={{ color: "var(--brand)" }}><LockIcon /></div>
            <div>
              <h3 className="font-bold text-[15px] mb-2 tracking-tight" style={{ color: "#111827" }}>Period discipline</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#4b5563" }}>Pre-close checklists lock periods and carry balances forward safely.</p>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col gap-4" style={{ borderColor: "#e5e7eb" }}>
            <div style={{ color: "var(--brand)" }}><ClockIcon /></div>
            <div>
              <h3 className="font-bold text-[15px] mb-2 tracking-tight" style={{ color: "#111827" }}>Full audit trail</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#4b5563" }}>Before/after values logged on every change, ready for review.</p>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col gap-4" style={{ borderColor: "#e5e7eb" }}>
            <div style={{ color: "var(--brand)" }}><TransferIcon /></div>
            <div>
              <h3 className="font-bold text-[15px] mb-2 tracking-tight" style={{ color: "#111827" }}>Scheme transfer</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#4b5563" }}>Move volume between schemes without breaking the chain of custody.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Process / Footer Section */}
      <section className="bg-black text-white pt-24 pb-12 mt-auto">
        <div className="max-w-6xl mx-auto px-6">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 border-b border-[#333] pb-24">
            <div className="flex gap-4 items-start">
              <span className="font-display font-bold text-xl" style={{ color: "var(--brand)" }}>01</span>
              <div>
                <h4 className="font-bold text-[15px] mb-2" style={{ color: "#ffffff" }}>Log transactions</h4>
                <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>Inbound and outbound volumes per site, validated against pool rules as you enter them.</p>
              </div>
            </div>
            
            <div className="flex gap-4 items-start">
              <span className="font-display font-bold text-xl" style={{ color: "var(--brand)" }}>02</span>
              <div>
                <h4 className="font-bold text-[15px] mb-2" style={{ color: "#ffffff" }}>Reconcile & close</h4>
                <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>Run the pre-submit checklist, resolve flags, then lock the period.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <span className="font-display font-bold text-xl" style={{ color: "var(--brand)" }}>03</span>
              <div>
                <h4 className="font-bold text-[15px] mb-2" style={{ color: "#ffffff" }}>Prove it later</h4>
                <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>Every change is timestamped with before/after values for the next audit.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center text-center py-20 border-b border-[#333]">
            <h2 className="text-[22px] font-bold font-display mb-6" style={{ fontFamily: "Roboto Slab, serif", color: "#ffffff" }}>Ready to see your ledger?</h2>
            <Link to="/login" className="px-6 py-3 font-bold rounded-md transition-all" style={{ backgroundColor: "#ffffff", color: "#111827" }}>
              Sign in to continue
            </Link>
          </div>

          <div className="flex justify-between items-center pt-8 text-[10px]" style={{ color: "#6b7280" }}>
            <div>ISCC Mass Balancer v1.0 - single tenant</div>
            <div>Role-based access - SUPER_ADMIN</div>
          </div>

        </div>
      </section>
      
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import alsLogo from "../assets/ALS 11.1 300 TRANS.png";

// Brand mark: a dial/gauge glyph -- ported from prototype/ISCC Mass
// Balancer.dc.html, used consistently on the sidebar and the login screen.
const BrandMark = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#ffffff" strokeWidth="1.75">
    <circle cx="8" cy="8" r="5.5" />
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
  </svg>
);

// Minimal, consistent 16px stroke icon set (1.75px stroke, currentColor) so
// each nav item is distinguishable at a glance instead of every row sharing
// the single leaf mark that used to be the app's only icon. See DESIGN.md
// "Navigation (Sidebar)".
const iconProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
const s = { stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const DashboardIcon = () => (
  <svg {...iconProps}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" {...s} />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" {...s} />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" {...s} />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" {...s} />
  </svg>
);

const RecordIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="8.5" {...s} />
    <path d="M12 8v8M8 12h8" {...s} />
  </svg>
);

const PoolsIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3c3 3.6 5 6.4 5 9a5 5 0 0 1-10 0c0-2.6 2-5.4 5-9Z" {...s} />
  </svg>
);

const LogIcon = () => (
  <svg {...iconProps}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" {...s} />
    <path d="M8 8h8M8 12h8M8 16h5" {...s} />
  </svg>
);

const PeriodsIcon = () => (
  <svg {...iconProps}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="1.8" {...s} />
    <path d="M3.5 9.5h17M8 3v3M16 3v3" {...s} />
    <path d="M9 14.5l2 2 4-4" {...s} />
  </svg>
);

const ConversionsIcon = () => (
  <svg {...iconProps}>
    <path d="M4.5 8.5h11l-3-3M19.5 15.5h-11l3 3" {...s} />
  </svg>
);

const TransferIcon = () => (
  <svg {...iconProps}>
    <path d="M4 9h13M13 5l4 4-4 4" {...s} />
    <path d="M20 15H7M11 11l-4 4 4 4" {...s} />
  </svg>
);

const StockIcon = () => (
  <svg {...iconProps}>
    <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" {...s} />
    <path d="M3.5 8v8L12 20l8.5-4V8M12 12v8" {...s} />
  </svg>
);

const CompanyIcon = () => (
  <svg {...iconProps}>
    <rect x="4.5" y="3.5" width="10" height="17" rx="1.3" {...s} />
    <path d="M8 7.5h3M8 11h3M8 14.5h3" {...s} />
    <path d="M14.5 10.5H18a1.3 1.3 0 0 1 1.3 1.3V19a1.3 1.3 0 0 1-1.3 1.3h-3.5" {...s} />
  </svg>
);

const AuditIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3.5 19 6v6c0 5-3.2 7.7-7 8.5-3.8-.8-7-3.5-7-8.5V6l7-2.5Z" {...s} />
    <path d="M9 12l2 2 4-4" {...s} />
  </svg>
);

const LogoutIcon = () => (
  <svg {...iconProps}>
    <path d="M9 4H5.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1H9" {...s} />
    <path d="M15 15.5l4-3.5-4-3.5M19 12H9" {...s} />
  </svg>
);

const UsersIcon = () => (
  <svg {...iconProps}>
    <circle cx="9" cy="8.5" r="3" {...s} />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" {...s} />
    <path d="M16 4.5c1.7.3 3 1.8 3 3.6 0 1.7-1.3 3.2-3 3.5M20.5 19c0-2.5-1.8-4.4-4-4.9" {...s} />
  </svg>
);

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const primaryNav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <DashboardIcon /> },
  { to: "/transactions", label: "Record Transaction", icon: <RecordIcon /> },
  { to: "/pools", label: "Pools & Balances", icon: <PoolsIcon /> },
  { to: "/log", label: "Transaction Log", icon: <LogIcon /> },
];

const balancingNav: NavItem[] = [
  { to: "/periods", label: "Periods & Close", icon: <PeriodsIcon /> },
  { to: "/conversions", label: "Conversions", icon: <ConversionsIcon /> },
  { to: "/scheme-transfers", label: "Scheme Transfers", icon: <TransferIcon /> },
  { to: "/stock-readings", label: "Physical Stock", icon: <StockIcon /> },
];

const adminNav: NavItem[] = [
  { to: "/company-profile", label: "Company Profile", icon: <CompanyIcon /> },
  { to: "/audit-log", label: "Audit Log", icon: <AuditIcon /> },
];

export function Layout() {
  const { user, logout, isCompanyAdmin } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu when navigating
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[var(--sidebar-bg)] border-b border-[var(--border)] sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-lg bg-white/5 p-1 border border-white/10">
            <img src={alsLogo} alt="ALS Logo" className="w-full h-full object-contain" />
          </div>
          <div className="font-bold text-[var(--heading)] tracking-tight">ISCC Mass Balance</div>
        </div>
        <button className="p-2 text-[var(--text-dim)] hover:text-white transition-colors" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isMobileMenuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </>
            ) : (
              <>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Overlay for mobile when sidebar is open */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-30 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`sidebar fixed md:sticky top-0 z-40 h-[100dvh] overflow-y-auto transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="sidebar-brand">
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl bg-white/5 p-1 border border-white/10">
            <img src={alsLogo} alt="ALS Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="sidebar-title">ISCC Mass Balance</div>
            <div className="sidebar-subtitle">Ledger &amp; Compliance</div>
          </div>
        </div>

        <div className="nav-section-label">Operations</div>
        {primaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        <div className="nav-section-label">Balancing</div>
        {balancingNav.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        <div className="nav-section-label">Administration</div>
        {adminNav.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            {item.icon}
            {item.label}
          </NavLink>
        ))}
        {isCompanyAdmin && (
          <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <UsersIcon />
            Users
          </NavLink>
        )}

        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="name">{user?.name}</span>
            <span className="role">{user?.role}</span>
          </div>
          <button className="nav-link" onClick={logout}>
            <LogoutIcon />
            Log out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

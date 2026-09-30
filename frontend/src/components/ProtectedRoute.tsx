import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isCompanyAdmin } = useAuth();
  if (!isCompanyAdmin) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="title">Company admin access required</div>
          <div>Your role does not have access to this page.</div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

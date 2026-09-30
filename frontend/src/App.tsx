import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute, AdminOnly } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CompanyProfilePage } from "./pages/CompanyProfilePage";
import { PeriodsPage } from "./pages/PeriodsPage";
import { BatchesPage } from "./pages/BatchesPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { TransactionLogPage } from "./pages/TransactionLogPage";
import { ConversionsPage } from "./pages/ConversionsPage";
import { SchemeTransfersPage } from "./pages/SchemeTransfersPage";
import { StockReadingsPage } from "./pages/StockReadingsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { UsersPage } from "./pages/UsersPage";
import { LandingPage } from "./pages/LandingPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/pools" element={<BatchesPage />} />
            <Route path="/log" element={<TransactionLogPage />} />
            <Route path="/periods" element={<PeriodsPage />} />
            <Route path="/conversions" element={<ConversionsPage />} />
            <Route path="/scheme-transfers" element={<SchemeTransfersPage />} />
            <Route path="/stock-readings" element={<StockReadingsPage />} />
            <Route
              path="/company-profile"
              element={
                <AdminOnly>
                  <CompanyProfilePage />
                </AdminOnly>
              }
            />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route
              path="/users"
              element={
                <AdminOnly>
                  <UsersPage />
                </AdminOnly>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

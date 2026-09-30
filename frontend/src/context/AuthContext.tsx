import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, apiErrorMessage, clearToken, getToken, setToken } from "../api/client";
import type { AuthUser } from "../api/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** All three roles in the schema (SUPER_ADMIN, COMPANY_ADMIN, COMPANY_USER)
   * can write -- there is no read-only role. Kept as a named flag rather
   * than inlining `!!user` everywhere so a future read-only role (or
   * COMPANY_USER's "specific sites" scoping from the role's own note in
   * Database Schema.pdf, not yet enforced) has one place to plug into. */
  canWrite: boolean;
  /** SUPER_ADMIN or COMPANY_ADMIN -- gates user management and period close. */
  isCompanyAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // A token arriving via SSO: the backend's OAuth2 callback redirects
    // here as `#token=<jwt>` (a URL fragment, never sent to any server or
    // logged, unlike a query param). Pick it up once, then fall through to
    // the same bootstrap a normal page load already does below.
    if (window.location.hash.startsWith("#token=")) {
      const ssoToken = window.location.hash.slice("#token=".length);
      setToken(ssoToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      setToken(res.data.token);
      setUser(res.data.user);
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    canWrite: !!user,
    isCompanyAdmin: user?.role === "SUPER_ADMIN" || user?.role === "COMPANY_ADMIN",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

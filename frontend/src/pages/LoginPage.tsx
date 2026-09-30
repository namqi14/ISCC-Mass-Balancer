import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/ALS 11.1 300 TRANS.png";
import photo from "../assets/login_photo.png";

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand-text">
          ISCC Mass Balance Ledger
        </div>
        
        <div className="login-hero-graphics">
          <div className="login-hero-stripes"></div>
          <img src={photo} alt="Plantation" className="login-hero-img" />
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-wrapper">
          <img src={logo} alt="Company Logo" className="login-company-logo" />
          <h2 className="login-heading">Login</h2>
          
          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <div className="login-input-group">
              <label>Email Address *</label>
              <input type="email" placeholder="Enter email address" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            
            <div className="login-input-group">
              <label>Password *</label>
              <input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <div className="login-options">
              <label className="remember-me">
                <input type="checkbox" /> Remember me
              </label>
              <a href="#" className="forgot-password">Forgot Password?</a>
            </div>

            {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

            <button className="login-submit-btn" type="submit" disabled={busy}>
              {busy ? "Logging In…" : "Log In"}
            </button>

            {/* Real browser navigation, not a fetch call -- the backend
               redirects to the identity provider from here. Returns a
               clean 501 today (no OIDC_ISSUER_URL/OIDC_CLIENT_ID configured
               yet); the link itself is always present. */}
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <a href={`${(import.meta.env.VITE_API_URL || "http://localhost:4000/api")}/auth/oauth/login`}>
                Log in with SSO
              </a>
            </div>

            <div className="login-demo-text">
              Demo accounts (seeded, password <code>ChangeMe123!</code>):<br />
              admin@demo.local (Company Admin)<br />
              entry@demo.local (Company User)<br />
              superadmin@demo.local (Super Admin)
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

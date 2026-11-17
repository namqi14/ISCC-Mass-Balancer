import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { NOTICE_INTRO, NOTICE_SECTIONS, NOTICE_TITLE } from "../lib/pdpaNotice";

/**
 * The PDPA notice, shown over everything until the signed-in user has accepted
 * it. The "Understand, I Agree" button stays disabled until they have scrolled to
 * the end of the notice. It cannot be dismissed; the only other way out is to
 * decline, which logs them out (consent has to be a free choice).
 */
export function PdpaModal() {
  const { acceptPdpa, logout } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const checkEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A few pixels of tolerance: scrollTop is fractional on zoomed screens.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setReachedEnd(true);
  }, []);

  useEffect(() => {
    checkEnd(); // a very tall screen may show the whole notice without any scrolling
    window.addEventListener("resize", checkEnd);
    return () => window.removeEventListener("resize", checkEnd);
  }, [checkEnd]);

  async function handleAgree() {
    setError("");
    setBusy(true);
    try {
      await acceptPdpa();
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pdpa-title" aria-describedby="pdpa-intro">
      <div className="modal-content" style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 12 }}>
        <div id="pdpa-title" className="modal-title" style={{ marginBottom: 0 }}>
          {NOTICE_TITLE}
        </div>
        <div id="pdpa-intro" style={{ fontSize: 14, color: "var(--text-dim)" }}>
          {NOTICE_INTRO}
        </div>

        <div
          ref={scrollRef}
          onScroll={checkEnd}
          tabIndex={0}
          aria-label="Notice text, scroll to read all of it"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            maxHeight: "min(46vh, 420px)",
            overflowY: "auto",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          {NOTICE_SECTIONS.map((section) => (
            <div key={section.heading} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--heading)" }}>{section.heading}</div>
              {section.paragraphs?.map((p) => (
                <p key={p} style={{ margin: "0 0 6px" }}>
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul style={{ margin: "0 0 6px", paddingLeft: 20 }}>
                  {section.bullets.map((b) => (
                    <li key={b} style={{ marginBottom: 2 }}>
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: reachedEnd ? "var(--success)" : "var(--text-dim)" }} aria-live="polite">
          {reachedEnd ? "You have reached the end of the notice." : "Scroll to the end of the notice to enable the button."}
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="modal-actions" style={{ marginTop: 4, gap: 8 }}>
          <button type="button" className="btn ghost" onClick={logout} disabled={busy}>
            Decline and log out
          </button>
          <button type="button" className="btn" onClick={handleAgree} disabled={!reachedEnd || busy}>
            {busy ? "Saving…" : "Understand, I Agree"}
          </button>
        </div>
      </div>
    </div>
  );
}

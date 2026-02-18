"use client";

import { useMemo, useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => username.trim() && password, [username, password]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Login failed");
      }

      // After cookie is set, go to the tool
      window.location.replace("/");
    } catch (e2) {
      setErr(e2?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.logo} aria-hidden />
          <div>
            <div style={styles.title}>SR Tool</div>
            <div style={styles.sub}>Sign in to access the internal dashboard</div>
          </div>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              style={styles.input}
              placeholder="Enter username"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              style={styles.input}
              placeholder="Enter password"
            />
          </label>

          {err ? <div style={styles.error}>{err}</div> : null}

          <button type="submit" disabled={!canSubmit || busy} style={{ ...styles.btn, ...(busy ? styles.btnBusy : null) }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div style={styles.hint}>
            Tip: set <code>BASIC_AUTH_USER</code> and <code>BASIC_AUTH_PASS</code> in Vercel Environment Variables.
          </div>
        </form>
      </div>

      <div style={styles.footer}>
        Protected by a server-side session cookie (HttpOnly/Secure/SameSite).
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "linear-gradient(135deg, #0b1020 0%, #0f172a 50%, #111827 100%)",
    color: "white",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
  },
  brandRow: { display: "flex", gap: 14, alignItems: "center", marginBottom: 14 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)",
  },
  title: { fontSize: 22, fontWeight: 700, lineHeight: 1.2 },
  sub: { fontSize: 13, opacity: 0.85, marginTop: 2 },
  form: { display: "grid", gap: 12, marginTop: 14 },
  label: { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 },
  input: {
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    padding: "0 12px",
    outline: "none",
  },
  btn: {
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.14)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 6,
  },
  btnBusy: { opacity: 0.75, cursor: "not-allowed" },
  error: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(239,68,68,0.18)",
    border: "1px solid rgba(239,68,68,0.35)",
    fontSize: 13,
  },
  hint: { fontSize: 12, opacity: 0.8, marginTop: 8, lineHeight: 1.4 },
  footer: { marginTop: 18, fontSize: 12, opacity: 0.7, textAlign: "center" },
};

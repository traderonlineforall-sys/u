"use client";

import { useState } from "react";

const DEVICE_SECRET_KEY = "sr_tool_device_instance_secret_v1";
const PRESENTATION_KEYS = ["sr_tool_user_id", "sr_tool_user_name", "sr_trusted_device_identity_learned_v1"];

function clearPresentationState({ forgetDevice = false } = {}) {
  const keys = forgetDevice ? [DEVICE_SECRET_KEY, ...PRESENTATION_KEYS] : PRESENTATION_KEYS;
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }
}

async function post(path) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default function DeviceSettingsPage() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function logout() {
    setBusy("logout");
    setError("");
    try {
      const { response, data } = await post("/api/logout");
      clearPresentationState();
      if (!response.ok && !data?.local_logout) throw new Error(data?.error || "تعذر تسجيل الخروج.");
      location.assign("/login");
    } catch (err) {
      setError(String(err?.message || err || "تعذر تسجيل الخروج."));
      setBusy("");
    }
  }

  async function forgetDevice() {
    setBusy("forget");
    setError("");
    try {
      const { response, data } = await post("/api/forget-device");
      if (!response.ok && !data?.device_forgotten) throw new Error(data?.error || "تعذر نسيان الجهاز.");
      clearPresentationState({ forgetDevice: true });
      location.assign("/login");
    } catch (err) {
      setError(String(err?.message || err || "تعذر نسيان الجهاز."));
      setBusy("");
    }
  }

  return (
    <main style={styles.main} dir="rtl">
      <section style={styles.card}>
        <h1 style={styles.title}>إعدادات الجلسة والجهاز</h1>
        <p style={styles.text}>
          تسجيل الخروج ينهي الجلسة الحالية فقط، ويحتفظ بهوية الجهاز لتسجيل الدخول التالي بعد كتابة بيانات الدخول العامة.
        </p>
        <button type="button" style={styles.primary} disabled={!!busy} onClick={logout}>
          {busy === "logout" ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}
        </button>
        <hr style={styles.divider} />
        <p style={styles.text}>
          نسيان الجهاز يلغي بيانات اعتماده الخادمية ويمسح مفتاح الجهاز من هذا المتصفح. سيحتاج الجهاز إلى Enrollment جديد.
        </p>
        <button type="button" style={styles.danger} disabled={!!busy} onClick={forgetDevice}>
          {busy === "forget" ? "جارٍ نسيان الجهاز…" : "نسيان هذا الجهاز"}
        </button>
        {error ? <p role="alert" style={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "#0b1020",
    color: "#f8fafc",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    width: "min(520px, 100%)",
    padding: 28,
    borderRadius: 18,
    background: "#151c32",
    boxShadow: "0 18px 60px rgba(0,0,0,.35)",
  },
  title: { margin: "0 0 16px", fontSize: 26 },
  text: { lineHeight: 1.8, color: "#cbd5e1" },
  primary: {
    width: "100%",
    border: 0,
    borderRadius: 12,
    padding: "12px 16px",
    cursor: "pointer",
    background: "#2563eb",
    color: "white",
    fontWeight: 700,
  },
  danger: {
    width: "100%",
    border: "1px solid #ef4444",
    borderRadius: 12,
    padding: "12px 16px",
    cursor: "pointer",
    background: "transparent",
    color: "#fecaca",
    fontWeight: 700,
  },
  divider: { margin: "26px 0", border: 0, borderTop: "1px solid #334155" },
  error: { marginTop: 16, color: "#fca5a5" },
};

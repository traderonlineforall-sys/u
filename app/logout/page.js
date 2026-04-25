"use client";

export default function LogoutPage() {
  async function doLogout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Logging out…</div>
        <button onClick={doLogout} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc" }}>
          Continue
        </button>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `(${doLogout.toString()})();` }} />
    </div>
  );
}

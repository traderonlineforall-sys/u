export const dynamic = "force-static";

export default function Home() {
  // Render the static tool while keeping the URL as "/"
  return (
    <iframe
      src="/index.html?v=20260525-v9-hard-stable-cache-reset"
      title="SR Tool"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "0",
      }}
    />
  );
}

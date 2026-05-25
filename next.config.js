/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep CI/local builds stable on small containers; avoids hangs during output file tracing.
  experimental: { cpus: 1 },
  async rewrites() {
    return {
      beforeFiles: [
        // Serve the legacy static tool directly at / instead of booting a Next page + iframe.
        { source: "/", destination: "/index.html" },
        { source: "/tags", destination: "/Tags.html" }
      ]
    };
  }
};

module.exports = nextConfig;

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Serve the original static tool (public/index.html) on the root path
      { source: "/", destination: "/index.html" },
      // Optional friendly route for Tags
      { source: "/tags", destination: "/Tags.html" }
    ];
  }
};

module.exports = nextConfig;

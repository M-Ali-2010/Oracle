/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  typescript: {
    ignoreBuildErrors: true,
  },

  transpilePackages: [
    "@ledgerhq/errors",
    "@ledgerhq/hw-transport",
  ],

  turbopack: {},

  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    return [
      {
        source: "/api/binance/:path*",
        destination: `${backendUrl}/api/binance/:path*`,
      },
      {
        source: "/api/trading/:path*",
        destination: `${backendUrl}/api/trading/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
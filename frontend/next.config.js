const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    '@ledgerhq/errors',
    '@ledgerhq/hw-transport',
    '@solana/wallet-adapter-ledger',
    '@solana/wallet-adapter-wallets',
    '@solana/wallet-adapter-base',
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-react-ui',
    '@metaplex-foundation/mpl-token-metadata',
  ],
  // Use this app as workspace root (avoid picking ~/package-lock.json and breaking Turbopack cache).
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      { source: '/api/binance/:path*', destination: `${backendUrl}/api/binance/:path*` },
      { source: '/api/trading/:path*', destination: `${backendUrl}/api/trading/:path*` },
    ];
  },
};
module.exports = nextConfig;
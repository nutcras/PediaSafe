/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* to the Hono backend. INTERNAL_API_URL is set in .env.local
  // for dev (http://localhost:3000) and overridden at runtime in Docker.
  async rewrites() {
    const target = process.env.INTERNAL_API_URL ?? 'http://localhost:3000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;

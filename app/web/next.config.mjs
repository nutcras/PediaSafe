/** @type {import('next').NextConfig} */

// Where the Next.js server reaches the Hono API on Docker's internal network.
// e.g. http://pediasafe-api-server:3000 in Docker, http://localhost:3000 in dev.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL;

const nextConfig = {
  // Proxy browser requests to /api/* through the Next.js server to the API
  // container. The browser never needs to resolve Docker container names — it
  // just hits the same origin and Next forwards it over the internal network.
  //
  // NOTE: rewrites() is evaluated when the build/server reads next.config, so
  // INTERNAL_API_URL must be present at `next build` time (passed as a build arg
  // in Dockerfile.web) as well as at runtime.
  async rewrites() {
    if (!INTERNAL_API_URL) {
      console.warn(
        '[next.config] INTERNAL_API_URL is not set — /api proxy disabled. ' +
          'Client-side calls to /api/* will 404.',
      );
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: `${INTERNAL_API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

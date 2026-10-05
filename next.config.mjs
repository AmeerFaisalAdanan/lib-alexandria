/** @type {import('next').NextConfig} */

// The browser only talks to this origin. /api/* is proxied to the Go backend, so there is one origin
// for Cloudflare Access to protect and no CORS. Rewrites are baked in at build time (see Dockerfile ARG).
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:8081';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;

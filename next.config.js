/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker test image (docker/Dockerfile).
  // Vercel ignores this setting.
  output: 'standalone',
  swcMinify: true,
};

module.exports = nextConfig;

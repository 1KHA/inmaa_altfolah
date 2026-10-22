/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker test image (docker/Dockerfile).
  // Vercel ignores this setting.
  output: 'standalone',
  swcMinify: true,
  // `import text from "./file.md"` gives the file's text as a string (the
  // terms page and the register form's terms dialog read terms.md this way).
  webpack: (config) => {
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' });
    return config;
  },
};

module.exports = nextConfig;

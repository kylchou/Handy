/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared contracts package ships TypeScript source, so Next compiles it.
  transpilePackages: ["@handy/contracts"],
};

module.exports = nextConfig;

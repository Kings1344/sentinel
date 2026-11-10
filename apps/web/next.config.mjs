/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sentinel/engine"],
  serverExternalPackages: ["near-api-js"],
  reactStrictMode: true,
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@skipruntime/wasm",
    "@skipruntime/server",
    "@skip-adapter/postgres",
  ],
};

export default nextConfig;

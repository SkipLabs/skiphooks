/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  serverExternalPackages: [
    "@skipruntime/wasm",
    "@skipruntime/server",
    "@skip-adapter/postgres",
  ],
};

export default nextConfig;

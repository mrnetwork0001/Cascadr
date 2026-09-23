/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits a self-contained server bundle so the Docker image does not need
  // node_modules at runtime.
  output: "standalone",
};

export default nextConfig;

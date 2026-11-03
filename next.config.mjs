/** @type {import('next').NextConfig} */
const nextConfig = {
  // unpdf and mammoth ship their own bundles; keep them external to the
  // server bundle so file extraction works reliably in serverless routes.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;

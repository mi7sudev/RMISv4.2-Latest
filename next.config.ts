import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Keep native/node-only packages unbundled so they load via require() with
  // fs access intact (SheetJS readFile, mammoth, unpdf workers, bcrypt).
  serverExternalPackages: ["xlsx", "mammoth", "unpdf", "bcryptjs"],
};

export default nextConfig;

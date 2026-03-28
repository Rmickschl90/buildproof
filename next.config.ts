import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Next expects host patterns here (no protocol)
  allowedDevOrigins: [
    "app.buildproof.app",
    "localhost",
    "localhost:5000",
    "192.168.1.119",
    "192.168.1.119:5000",
    "172.20.10.4",
    "172.20.10.4:5000",
  ],
};

export default nextConfig;

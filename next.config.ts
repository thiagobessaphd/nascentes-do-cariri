import "./src/config/env";
import type { NextConfig } from "next";
import { getSecurityHeaders } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return getSecurityHeaders();
  },
};

export default nextConfig;

import "./src/config/env";
import type { NextConfig } from "next";
import os from "node:os";
import { getSecurityHeaders } from "./src/config/security-headers";

function getLocalDevOrigins(): string[] {
  const origins = new Set<string>(["localhost:3000", "127.0.0.1:3000"]);
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] ?? []) {
        if (net.family === "IPv4" && !net.internal) {
          origins.add(net.address);
          origins.add(`${net.address}:3000`);
        }
      }
    }
  } catch {
    // Fallback gracioso se leitura de interfaces de rede falhar
  }
  return Array.from(origins);
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb"],
  poweredByHeader: false,
  allowedDevOrigins: getLocalDevOrigins(),
  async headers() {
    return getSecurityHeaders();
  },
};

export default nextConfig;

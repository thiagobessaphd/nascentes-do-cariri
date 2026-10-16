export interface SecurityHeaderEntry {
  key: string;
  value: string;
}

export interface SecurityRouteRule {
  source: string;
  headers: SecurityHeaderEntry[];
}

export const SECURITY_ORIGINS = {
  SELF: "'self'",
  UFCA_INSTITUTIONAL: "https://nascentesdocariri.ufca.edu.br",
} as const;

export const FRAMING_POLICIES = {
  MAPA_PUBLIC: `frame-ancestors ${SECURITY_ORIGINS.SELF} ${SECURITY_ORIGINS.UFCA_INSTITUTIONAL}`,
  RESTRICTED_NONE: "frame-ancestors 'none'",
} as const;

export const SECURITY_HEADER_NAMES = {
  CSP: "Content-Security-Policy",
  X_FRAME_OPTIONS: "X-Frame-Options",
  REFERRER_POLICY: "Referrer-Policy",
  X_CONTENT_TYPE_OPTIONS: "X-Content-Type-Options",
  HSTS: "Strict-Transport-Security",
  PERMISSIONS_POLICY: "Permissions-Policy",
  X_DNS_PREFETCH_CONTROL: "X-DNS-Prefetch-Control",
} as const;

export const HSTS_POLICY = "max-age=63072000; includeSubDomains; preload" as const;
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()" as const;

export const COMMON_SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  { key: SECURITY_HEADER_NAMES.REFERRER_POLICY, value: "strict-origin-when-cross-origin" },
  { key: SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS, value: "nosniff" },
  { key: SECURITY_HEADER_NAMES.PERMISSIONS_POLICY, value: PERMISSIONS_POLICY },
  { key: SECURITY_HEADER_NAMES.X_DNS_PREFETCH_CONTROL, value: "off" },
] as const;

export const MAPA_SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  { key: SECURITY_HEADER_NAMES.CSP, value: FRAMING_POLICIES.MAPA_PUBLIC },
  ...COMMON_SECURITY_HEADERS,
] as const;

export const RESTRICTED_SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  { key: SECURITY_HEADER_NAMES.CSP, value: FRAMING_POLICIES.RESTRICTED_NONE },
  { key: SECURITY_HEADER_NAMES.X_FRAME_OPTIONS, value: "DENY" },
  ...COMMON_SECURITY_HEADERS,
] as const;

export interface SecurityHeadersOptions {
  isProduction?: boolean;
}

export function buildSecurityHeaders(options?: SecurityHeadersOptions): {
  mapaHeaders: SecurityHeaderEntry[];
  restrictedHeaders: SecurityHeaderEntry[];
} {
  const isProduction = options?.isProduction ?? process.env.NODE_ENV === "production";

  const productionHeaders: SecurityHeaderEntry[] = isProduction
    ? [{ key: SECURITY_HEADER_NAMES.HSTS, value: HSTS_POLICY }]
    : [];

  return {
    mapaHeaders: [
      { key: SECURITY_HEADER_NAMES.CSP, value: FRAMING_POLICIES.MAPA_PUBLIC },
      ...COMMON_SECURITY_HEADERS,
      ...productionHeaders,
    ],
    restrictedHeaders: [
      { key: SECURITY_HEADER_NAMES.CSP, value: FRAMING_POLICIES.RESTRICTED_NONE },
      { key: SECURITY_HEADER_NAMES.X_FRAME_OPTIONS, value: "DENY" },
      ...COMMON_SECURITY_HEADERS,
      ...productionHeaders,
    ],
  };
}

export function getSecurityHeaders(options?: SecurityHeadersOptions): SecurityRouteRule[] {
  const { mapaHeaders, restrictedHeaders } = buildSecurityHeaders(options);

  return [
    {
      source: "/mapa/:path*",
      headers: mapaHeaders,
    },
    {
      source: "/admin/:path*",
      headers: restrictedHeaders,
    },
    {
      source: "/api/admin/:path*",
      headers: restrictedHeaders,
    },
    {
      source: "/",
      headers: restrictedHeaders,
    },
  ];
}

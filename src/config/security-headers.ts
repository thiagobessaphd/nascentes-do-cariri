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
} as const;

export const MAPA_SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  { key: SECURITY_HEADER_NAMES.CSP, value: FRAMING_POLICIES.MAPA_PUBLIC },
  { key: SECURITY_HEADER_NAMES.REFERRER_POLICY, value: "strict-origin-when-cross-origin" },
  { key: SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS, value: "nosniff" },
] as const;

export const RESTRICTED_SECURITY_HEADERS: readonly SecurityHeaderEntry[] = [
  { key: SECURITY_HEADER_NAMES.CSP, value: FRAMING_POLICIES.RESTRICTED_NONE },
  { key: SECURITY_HEADER_NAMES.X_FRAME_OPTIONS, value: "DENY" },
  { key: SECURITY_HEADER_NAMES.REFERRER_POLICY, value: "strict-origin-when-cross-origin" },
  { key: SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS, value: "nosniff" },
] as const;

export function getSecurityHeaders(): SecurityRouteRule[] {
  return [
    {
      source: "/mapa/:path*",
      headers: [...MAPA_SECURITY_HEADERS],
    },
    {
      source: "/admin/:path*",
      headers: [...RESTRICTED_SECURITY_HEADERS],
    },
    {
      source: "/api/admin/:path*",
      headers: [...RESTRICTED_SECURITY_HEADERS],
    },
    {
      source: "/",
      headers: [...RESTRICTED_SECURITY_HEADERS],
    },
  ];
}

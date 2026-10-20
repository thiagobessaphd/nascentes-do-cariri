import { z } from "zod";
import { CARIRI_BOUNDS } from "@/lib/domain/nascente";

/**
 * Delimitação retangular padrão (Bounding Box) da macrorregião do Cariri para o mapa.
 * Formato compatível com LatLngBoundsExpression do Leaflet: [[minLat, minLng], [maxLat, maxLng]].
 */
export const DEFAULT_CARIRI_BOUNDS = [
  [CARIRI_BOUNDS.MIN_LAT, CARIRI_BOUNDS.MIN_LNG],
  [CARIRI_BOUNDS.MAX_LAT, CARIRI_BOUNDS.MAX_LNG],
] as const;

const clientMapSchema = z.object({
  tileUrl: z.string().url().default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  attribution: z
    .string()
    .min(1)
    .default("&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"),
  minZoom: z.number().int().nonnegative().default(6),
  maxZoom: z.number().int().positive().default(19),
  defaultLat: z.number().min(-90).max(90).default(-7.23456789),
  defaultLng: z.number().min(-180).max(180).default(-39.12345678),
  defaultZoom: z.number().int().positive().default(10),
})
  .refine((data) => data.minZoom <= data.maxZoom, {
    message: "minZoom deve ser menor ou igual a maxZoom",
  });

export type MapConfig = z.infer<typeof clientMapSchema> & {
  readonly caririBounds: typeof DEFAULT_CARIRI_BOUNDS;
};

const DEFAULT_MAP_CONFIG: MapConfig = {
  tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
  minZoom: 6,
  maxZoom: 19,
  defaultLat: -7.23456789,
  defaultLng: -39.12345678,
  defaultZoom: 10,
  caririBounds: DEFAULT_CARIRI_BOUNDS,
};

const parsedConfig = clientMapSchema.safeParse({
  tileUrl: process.env.NEXT_PUBLIC_TILE_URL,
  attribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION,
  minZoom: process.env.NEXT_PUBLIC_TILE_MIN_ZOOM ? Number(process.env.NEXT_PUBLIC_TILE_MIN_ZOOM) : undefined,
  maxZoom: process.env.NEXT_PUBLIC_TILE_MAX_ZOOM ? Number(process.env.NEXT_PUBLIC_TILE_MAX_ZOOM) : undefined,
  defaultLat: process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ? Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT) : undefined,
  defaultLng: process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ? Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG) : undefined,
  defaultZoom: process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM ? Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM) : undefined,
});

export const mapConfig: MapConfig = parsedConfig.success
  ? {
    ...parsedConfig.data,
    caririBounds: DEFAULT_CARIRI_BOUNDS,
  }
  : DEFAULT_MAP_CONFIG;

import { z } from "zod";

const clientMapSchema = z.object({
  tileUrl: z.string().url().default("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
  attribution: z.string().min(1).default("&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"),
  maxZoom: z.number().int().positive().default(19),
  defaultLat: z.number().min(-90).max(90).default(-7.23456789),
  defaultLng: z.number().min(-180).max(180).default(-39.12345678),
  defaultZoom: z.number().int().positive().default(10),
});

export type MapConfig = z.infer<typeof clientMapSchema>;

const parsedConfig = clientMapSchema.safeParse({
  tileUrl: process.env.NEXT_PUBLIC_TILE_URL,
  attribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION,
  maxZoom: process.env.NEXT_PUBLIC_TILE_MAX_ZOOM ? Number(process.env.NEXT_PUBLIC_TILE_MAX_ZOOM) : undefined,
  defaultLat: process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ? Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT) : undefined,
  defaultLng: process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ? Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG) : undefined,
  defaultZoom: process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM ? Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM) : undefined,
});

export const mapConfig: MapConfig = parsedConfig.success
  ? parsedConfig.data
  : {
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    maxZoom: 19,
    defaultLat: -7.23456789,
    defaultLng: -39.12345678,
    defaultZoom: 10,
  };

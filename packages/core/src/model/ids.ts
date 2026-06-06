import { z } from "zod";

/** Server/universe identifier, e.g. `"s1-en"` (matches OGLight DBName suffix). */
export const universeIdSchema = z.string().min(1);
export type UniverseId = z.infer<typeof universeIdSchema>;

/** `{ universeId, playerId }` — playerId is the OGame internal player id (string). */
export const accountIdSchema = z.object({
  universeId: universeIdSchema,
  playerId: z.string().min(1),
});
export type AccountId = z.infer<typeof accountIdSchema>;

export const celestialTypeSchema = z.enum(["planet", "moon"]);
export type CelestialType = z.infer<typeof celestialTypeSchema>;

/** `{ accountId, ogameId, type }` — ogameId is the OGame internal planet/moon id. */
export const celestialIdSchema = z.object({
  accountId: accountIdSchema,
  ogameId: z.string().min(1),
  type: celestialTypeSchema,
});
export type CelestialId = z.infer<typeof celestialIdSchema>;

/** Coordinates are a *mutable attribute*, never identity. */
export const coordinatesSchema = z.object({
  galaxy: z.number().int(),
  system: z.number().int(),
  position: z.number().int(),
  type: celestialTypeSchema,
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

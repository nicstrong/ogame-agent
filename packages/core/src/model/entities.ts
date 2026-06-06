import { z } from "zod";
import { celestialTypeSchema, coordinatesSchema } from "./ids.js";

/**
 * Read-model (merged projection) schemas. These describe the *shape* the fold engine
 * hydrates into from fact paths; every field is optional because **absence = unknown**.
 */

export const resourceSchema = z.object({
  amount: z.number().optional(),
  storage: z.number().optional(),
  production: z.number().optional(),
});
export type Resource = z.infer<typeof resourceSchema>;

export const resourcesSchema = z.object({
  metal: resourceSchema.optional(),
  crystal: resourceSchema.optional(),
  deuterium: resourceSchema.optional(),
  energy: resourceSchema.optional(),
  food: resourceSchema.optional(),
  population: resourceSchema.optional(),
});
export type Resources = z.infer<typeof resourcesSchema>;

/** level/count keyed by canonical key (see catalog). */
export const levelMapSchema = z.record(z.number());
export type LevelMap = z.infer<typeof levelMapSchema>;

export const fieldsSchema = z.object({
  used: z.number().optional(),
  max: z.number().optional(),
});

export const celestialSchema = z.object({
  type: celestialTypeSchema.optional(),
  name: z.string().optional(),
  coordinates: coordinatesSchema.optional(),
  temperature: z.unknown().optional(),
  fields: fieldsSchema.optional(),
  diameter: z.number().optional(),
  lifeform: z.union([z.number(), z.string()]).optional(),
  /** OGame id of the linked moon, when this is a planet. */
  moonId: z.string().optional(),
  resources: resourcesSchema.optional(),
  buildings: levelMapSchema.optional(),
  ships: levelMapSchema.optional(),
  defense: levelMapSchema.optional(),
  /** per-celestial observation time (ms epoch) from OGLight lastRefresh, if present. */
  lastRefresh: z.number().optional(),
});
export type Celestial = z.infer<typeof celestialSchema>;

export const accountSchema = z.object({
  playerId: z.string().optional(),
  name: z.string().optional(),
  class: z.union([z.number(), z.string()]).optional(),
  rank: z.number().optional(),
  research: levelMapSchema.optional(),
});
export type Account = z.infer<typeof accountSchema>;

export const universeSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  lang: z.string().optional(),
  speeds: z
    .object({
      economy: z.number().optional(),
      research: z.number().optional(),
      peacefulFleet: z.number().optional(),
      holdingFleet: z.number().optional(),
      warFleet: z.number().optional(),
    })
    .optional(),
  debrisFactor: z.number().optional(),
  galaxies: z.number().optional(),
  systems: z.number().optional(),
});
export type Universe = z.infer<typeof universeSchema>;

/**
 * The top-level merged projection produced by {@link foldImports}.
 * `celestial` is keyed by OGame celestial id.
 */
export const projectionSchema = z.object({
  account: accountSchema.optional(),
  celestial: z.record(celestialSchema).optional(),
});
export type Projection = z.infer<typeof projectionSchema>;

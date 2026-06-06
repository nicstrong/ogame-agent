import type { Import } from "../model/import.js";
import type { Adapter, ParseOptions } from "./types.js";

/**
 * InfoCompte adapter — deferred in v1 (OGLight covers the own-empire economy).
 * The seam exists so the registry can route to it later; structural detection only.
 */
function matches(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  const player = obj.player as Record<string, unknown> | undefined;
  return Boolean(player && typeof player === "object" && "positions" in player);
}

function parse(_raw: string, _options?: ParseOptions): Import {
  throw new Error("InfoCompte adapter is not implemented in v1 (deferred — see architecture §8)");
}

export const infocompleteAdapter: Adapter = { source: "infocomplete", matches, parse };

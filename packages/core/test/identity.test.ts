import { describe, expect, it } from "vite-plus/test";
import { buildUniverseId, formatCoords, parseCoords, parseDBName } from "../src/identity/index.js";

describe("identity", () => {
  it("parses an OGLight DBName into playerId + universeId", () => {
    expect(parseDBName("100000-s1-en")).toEqual({ playerId: "100000", universeId: "s1-en" });
  });

  it("throws on a malformed DBName", () => {
    expect(() => parseDBName("nodash")).toThrow();
  });

  it("builds a universe id from a server header", () => {
    expect(buildUniverseId({ id: 1, lang: "en" })).toBe("s1-en");
  });

  it("round-trips coordinates with an explicit celestial type", () => {
    const coords = parseCoords("1:200:8", "moon");
    expect(coords).toEqual({ galaxy: 1, system: 200, position: 8, type: "moon" });
    expect(formatCoords(coords)).toBe("1:200:8");
  });

  it("rejects malformed coordinates", () => {
    expect(() => parseCoords("1:200", "planet")).toThrow();
  });
});

import { describe, expect, it } from "vite-plus/test";
import { setFact, tombstoneFact } from "../src/model/fact.js";
import type { Projection } from "../src/model/entities.js";
import { isMeaningfulImport } from "../src/suppression/index.js";

const state: Projection = {
  account: { research: { energyTechnology: 14 } },
  celestial: {
    "1": {
      type: "planet",
      lastRefresh: 1_000_000,
      buildings: { metalMine: 30 },
      resources: {
        metal: { amount: 100_000, production: 10 }, // 10/sec
      },
    },
  },
};

describe("isMeaningfulImport (§3a suppression)", () => {
  it("suppresses a save that only bumps lastRefresh", () => {
    expect(isMeaningfulImport(state, [setFact("celestial/1/lastRefresh", 1_000_060)])).toBe(false);
  });

  it("suppresses routine resource ticking within prediction", () => {
    // 60s later at 10/sec -> +600 -> 100600 exactly predicted
    const facts = [
      setFact("celestial/1/lastRefresh", 1_000_060),
      setFact("celestial/1/resources/metal/amount", 100_600),
      setFact("celestial/1/resources/metal/production", 10),
    ];
    expect(isMeaningfulImport(state, facts)).toBe(false);
  });

  it("suppresses re-asserting an unchanged building level", () => {
    expect(isMeaningfulImport(state, [setFact("celestial/1/buildings/metalMine", 30)])).toBe(false);
  });

  it("admits a building level change", () => {
    expect(isMeaningfulImport(state, [setFact("celestial/1/buildings/metalMine", 31)])).toBe(true);
  });

  it("admits a production-rate change", () => {
    const facts = [
      setFact("celestial/1/lastRefresh", 1_000_060),
      setFact("celestial/1/resources/metal/amount", 100_600),
      setFact("celestial/1/resources/metal/production", 12),
    ];
    expect(isMeaningfulImport(state, facts)).toBe(true);
  });

  it("admits a raid-sized resource drop (deviation beyond tolerance)", () => {
    const facts = [
      setFact("celestial/1/lastRefresh", 1_000_060),
      setFact("celestial/1/resources/metal/amount", 5_000), // predicted ~100600, far below
      setFact("celestial/1/resources/metal/production", 10),
    ];
    expect(isMeaningfulImport(state, facts)).toBe(true);
  });

  it("admits new information (resource not previously known)", () => {
    expect(isMeaningfulImport(state, [setFact("celestial/1/resources/crystal/amount", 50)])).toBe(
      true,
    );
  });

  it("always admits a tombstone", () => {
    expect(isMeaningfulImport(state, [tombstoneFact("celestial/1")])).toBe(true);
  });

  it("admits an account research change", () => {
    expect(isMeaningfulImport(state, [setFact("account/research/energyTechnology", 15)])).toBe(
      true,
    );
  });
});

import { describe, expect, it } from "vite-plus/test";
import { celestialMsu, DEFAULT_MSU_RATIO, empireMsu, msuWeights } from "../src/value/msu.js";
import type { Projection } from "../src/model/entities.js";

describe("MSU valuation", () => {
  it("weights metal/crystal/deut by the trade ratio (3:2:1 -> 1, 1.5, 3)", () => {
    const w = msuWeights(DEFAULT_MSU_RATIO);
    expect(w.metal).toBe(1);
    expect(w.crystal).toBe(1.5);
    expect(w.deuterium).toBe(3);
  });

  it("reproduces the agreed empire total (149.7M) at 3:2:1", () => {
    // 77.5M metal + 31.9M crystal + 8.1M deut, stored amounts.
    const projection: Projection = {
      celestial: {
        "1": {
          resources: {
            metal: { amount: 77_500_000 },
            crystal: { amount: 31_900_000 },
            deuterium: { amount: 8_100_000 },
          },
        },
      },
    };
    const { total } = empireMsu(projection);
    // 77.5 + 1.5*31.9 + 3*8.1 = 149.65M
    expect(total).toBeCloseTo(149_650_000, 0);
  });

  it("perHour reads production; perDay multiplies by 24", () => {
    const c = {
      resources: {
        metal: { amount: 1000, production: 10 },
        crystal: { amount: 0, production: 2 },
        deuterium: { amount: 0, production: 1 },
      },
    };
    // perHour: 10*1 + 2*1.5 + 1*3 = 16
    expect(celestialMsu(c, DEFAULT_MSU_RATIO, "perHour").total).toBe(16);
    expect(celestialMsu(c, DEFAULT_MSU_RATIO, "perDay").total).toBe(16 * 24);
    // value mode ignores production
    expect(celestialMsu(c, DEFAULT_MSU_RATIO, "value").total).toBe(1000);
  });

  it("treats missing resources as zero, not unknown-throwing", () => {
    expect(empireMsu({}).total).toBe(0);
    expect(celestialMsu({}, DEFAULT_MSU_RATIO, "value").total).toBe(0);
  });

  it("honors a custom ratio", () => {
    // 2:1:1 -> weights 1, 2, 2
    const w = msuWeights({ metal: 2, crystal: 1, deuterium: 1 });
    expect(w).toEqual({ metal: 1, crystal: 2, deuterium: 2 });
  });
});

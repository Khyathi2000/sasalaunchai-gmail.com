import { describe, it, expect } from "vitest";
import {
  COST_CATALOG,
  estimateProviderCost,
  getCostRange,
} from "../cost-catalog.js";

describe("cost-catalog", () => {
  it("returns ranges for known services", () => {
    const r = getCostRange("ecs");
    expect(r.low).toBeGreaterThanOrEqual(0);
    expect(r.typical).toBeGreaterThan(r.low);
    expect(r.high).toBeGreaterThan(r.typical);
  });

  it("falls back to a tiny range for unknown services", () => {
    const r = getCostRange("imaginary-service");
    expect(r.low).toBe(0);
    expect(r.typical).toBe(0.1);
    expect(r.high).toBe(1.0);
  });

  it("estimateProviderCost sums ranges", () => {
    const est = estimateProviderCost(["ecs", "rds", "s3"]);
    expect(est.serviceCount).toBe(3);
    expect(est.byService).toHaveLength(3);
    const expectedTypical =
      COST_CATALOG.ecs.typical + COST_CATALOG.rds.typical + COST_CATALOG.s3.typical;
    expect(est.totalTypical).toBeCloseTo(expectedTypical, 2);
    expect(est.totalLow).toBeLessThanOrEqual(est.totalTypical);
    expect(est.totalHigh).toBeGreaterThanOrEqual(est.totalTypical);
  });

  it("handles empty service list", () => {
    const est = estimateProviderCost([]);
    expect(est).toEqual({
      serviceCount: 0,
      totalLow: 0,
      totalTypical: 0,
      totalHigh: 0,
      byService: [],
    });
  });

  it("invariant: low <= typical <= high for every catalog entry", () => {
    for (const [id, range] of Object.entries(COST_CATALOG)) {
      expect(range.low, `${id}.low`).toBeLessThanOrEqual(range.typical);
      expect(range.typical, `${id}.typical`).toBeLessThanOrEqual(range.high);
    }
  });
});

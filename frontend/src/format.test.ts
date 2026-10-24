import { describe, expect, it } from "vitest";
import { fmtGWh, fmtSigned, niceTicks, shiftDay, tickK, toCsv } from "./format";

describe("format", () => {
  it("formats energy in GWh", () => {
    expect(fmtGWh(278630)).toBe("279 GWh");
    expect(fmtGWh(null)).toBe("–");
  });

  it("signs values with a true minus", () => {
    expect(fmtSigned(-1748)).toBe("−1.7 GW");
    expect(fmtSigned(500)).toBe("+0.5 GW");
  });

  it("compacts axis ticks", () => {
    expect(tickK(12000)).toBe("12k");
    expect(tickK(500)).toBe("500");
  });

  it("shifts days across month boundaries", () => {
    expect(shiftDay("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDay("2026-01-02", -1)).toBe("2026-01-01");
  });

  it("builds nice axis ticks that cover the data", () => {
    expect(niceTicks(0, 2400)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(niceTicks(1700, 2200, 4)).toEqual([1600, 1800, 2000, 2200]);
    const t = niceTicks(0, 17665);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(17665);
  });

  it("quotes CSV fields that need it", () => {
    expect(toCsv([{ a: 1, b: "x,y" }])).toBe('a,b\n1,"x,y"');
  });
});

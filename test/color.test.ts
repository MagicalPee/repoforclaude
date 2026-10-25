import { describe, expect, it } from "vitest";
import {
  adjustForContrast,
  contrastRatio,
  deltaE,
  hueFamily,
  oklchToHex,
  parseColor,
  readableOn,
  toHex,
  toOklch,
  wcagLevel,
} from "../src/analysis/color.js";

describe("color parsing", () => {
  it.each([
    ["#fff", "#ffffff"],
    ["#0F766E", "#0f766e"],
    ["rgb(15, 118, 110)", "#0f766e"],
    ["rgb(15 118 110 / 100%)", "#0f766e"],
    ["hsl(210 50% 40%)", "#336699"],
    ["hsla(210, 50%, 40%, 1)", "#336699"],
    ["rebeccapurple", "#663399"],
    ["oklch(62.8% 0.2577 29.23)", "#ff0000"],
    ["hwb(0 0% 0%)", "#ff0000"],
  ])("parses %s", (input, expected) => {
    expect(toHex(input)).toBe(expected);
  });

  it("composites translucent colors over white and drops fully transparent ones", () => {
    expect(toHex("rgba(0, 0, 0, 0.5)")).toBe("#808080");
    expect(toHex("transparent")).toBeNull();
  });

  it("rejects variables and garbage", () => {
    expect(parseColor("var(--x)")).toBeNull();
    expect(parseColor("rgb(var(--r) 0 0)")).toBeNull();
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("#12")).toBeNull();
  });
});

describe("WCAG contrast", () => {
  it("matches reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
  });

  it("maps ratios to levels", () => {
    expect(wcagLevel(7.1)).toBe("AAA");
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(3.2)).toBe("AA-large");
    expect(wcagLevel(2)).toBe("fail");
  });

  it("adjustForContrast reaches the requested ratio without changing hue family", () => {
    const fixed = adjustForContrast("#f59e0b", "#ffffff", 4.5);
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(hueFamily(toOklch(fixed)!)).toBe(hueFamily(toOklch("#f59e0b")!));
    const onDark = adjustForContrast("#1d4ed8", "#111111", 4.5);
    expect(contrastRatio(onDark, "#111111")).toBeGreaterThanOrEqual(4.5);
  });

  it("picks the more readable text color", () => {
    expect(readableOn("#facc15")).not.toBe("#ffffff");
    expect(readableOn("#1e3a8a")).toBe("#ffffff");
  });
});

describe("OKLCH", () => {
  it("round-trips sRGB colors", () => {
    for (const hex of ["#0f766e", "#c2410c", "#4338ca", "#f7f1e3", "#111111"]) {
      const c = toOklch(hex)!;
      expect(deltaE(oklchToHex(c), hex)).toBeLessThan(0.005);
    }
  });

  it("gamut-maps out-of-range chroma instead of clipping hue", () => {
    const hex = oklchToHex({ l: 0.6, c: 0.5, h: 150 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hueFamily(toOklch(hex)!)).toBe("green");
  });

  it("classifies hue families", () => {
    expect(hueFamily(toOklch("#dc2626")!)).toBe("red");
    expect(hueFamily(toOklch("#f97316")!)).toBe("orange");
    expect(hueFamily(toOklch("#2563eb")!)).toBe("blue");
    expect(hueFamily(toOklch("#7c3aed")!)).toBe("violet");
    expect(hueFamily(toOklch("#14b8a6")!)).toBe("teal");
    expect(hueFamily(toOklch("#6b7280")!)).toBe("neutral");
  });
});

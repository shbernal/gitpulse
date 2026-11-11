import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { ansiToSvg, stripAnsi, visibleLineLengths } from "../scripts/ansi-to-svg";
import { visualOutputCases } from "../scripts/visual-fixtures";

describe("visual output harness", () => {
  test("renders every visual fixture as ANSI with a provenance block", () => {
    const cases = visualOutputCases();

    for (const outputCase of cases) {
      expect(outputCase.ansi).toContain("\u001b[");
      expect(stripAnsi(outputCase.ansi)).toBe(stripVTControlCharacters(outputCase.ansi));
      expect(stripAnsi(outputCase.ansi)).toContain("Data Provenance");
    }
  });

  test("renders ANSI fixtures to SVG with visible terminal styling", () => {
    const outputCase = visualOutputCases()[0];
    const svg = ansiToSvg(outputCase.ansi, { columns: outputCase.columns, title: outputCase.title });

    expect(svg).toContain("<svg");
    expect(svg).toContain("<title>Single repository report</title>");
    expect(svg).toContain('font-weight="700"');
    expect(svg).not.toContain('text-decoration="underline"');
    expect(svg).toContain('opacity="0.62"');
    expect(svg).toContain("Terminal-first project health snapshots");
    expect(svg).toContain('stroke-dasharray="4 5"');
    expect(Number(svg.match(/width="(\d+)"/)?.[1])).toBeGreaterThan(0);
    expect(Number(svg.match(/height="(\d+)"/)?.[1])).toBeGreaterThan(0);
  });

  test("standard review cases fit inside the configured terminal column guide", () => {
    for (const outputCase of visualOutputCases()) {
      if (outputCase.allowOverflow) {
        continue;
      }

      const maxLineLength = Math.max(...visibleLineLengths(outputCase.ansi));
      expect(maxLineLength).toBeLessThanOrEqual(outputCase.columns);
    }
  });
});

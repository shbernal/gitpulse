import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { ansiToSvg, stripAnsi, visibleLineLengths } from "../scripts/ansi-to-svg";
import { visualOutputCases } from "../scripts/visual-fixtures";

describe("visual output harness", () => {
  test("keeps generated visual fixtures deterministic and ANSI-backed", () => {
    const cases = visualOutputCases();

    expect(cases.map((outputCase) => outputCase.id)).toEqual([
      "repo-strong",
      "repo-warning",
      "repo-explain",
      "compare-mixed",
      "docs",
      "user",
      "repo-long-content",
      "theme-tokyo-night",
      "theme-catppuccin-mocha",
      "theme-nord",
      "theme-gruvbox-dark",
      "theme-dracula",
    ]);

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
    expect(svg).toContain("font-weight=\"700\"");
    expect(svg).not.toContain("text-decoration=\"underline\"");
    expect(svg).toContain("opacity=\"0.62\"");
    expect(svg).toContain("Terminal-first project health snapshots");
    expect(svg).toContain("stroke-dasharray=\"4 5\"");
    expect(Number(svg.match(/width=\"(\d+)\"/)?.[1])).toBeGreaterThan(0);
    expect(Number(svg.match(/height=\"(\d+)\"/)?.[1])).toBeGreaterThan(0);
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

  test("includes an intentional overflow case for fixed-width pressure review", () => {
    const outputCase = visualOutputCases().find((candidate) => candidate.id === "repo-long-content");
    const explainCase = visualOutputCases().find((candidate) => candidate.id === "repo-explain");

    expect(outputCase).toBeDefined();
    expect(outputCase?.allowOverflow).toBe(true);
    expect(Math.max(...visibleLineLengths(outputCase?.ansi ?? ""))).toBeGreaterThan(outputCase?.columns ?? 0);
    expect(explainCase?.allowOverflow).toBe(true);
  });
});

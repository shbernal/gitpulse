import pc from "picocolors";
import { stripVTControlCharacters } from "node:util";
import { getLanguageColor, type Rgb } from "./language-colors";
import { defaultThemeName, getPalette, type ThemeName, type ThemePalette } from "./palettes";

export type RenderOptions = {
  color?: boolean;
  theme?: ThemeName;
};

export const COLOR_MODES = ["auto", "always", "never"] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

type Tone = "bad" | "good" | "info" | "muted" | "warn";

type Env = Record<string, string | undefined>;
type ColorStream = {
  isTTY?: boolean;
};

export function shouldUseColor(
  mode: ColorMode = "auto",
  env: Env = process.env,
  stream: ColorStream = process.stdout,
): boolean {
  if (mode === "never") {
    return false;
  }

  if (mode === "always") {
    return true;
  }

  if (env.NO_COLOR !== undefined || env.FORCE_COLOR === "0") {
    return false;
  }

  if (env.FORCE_COLOR !== undefined) {
    return true;
  }

  return Boolean(stream.isTTY);
}

export function createTheme(options: RenderOptions = {}) {
  const color = Boolean(options.color);
  const colors = pc.createColors(color);
  const palette = getPalette(options.theme ?? defaultThemeName);
  const paintForeground = (value: string, foreground: Rgb) =>
    color ? `\u001b[38;2;${foreground.red};${foreground.green};${foreground.blue}m${value}\u001b[39m` : value;
  const paintBlock = (value: string, background: Rgb) => {
    if (!color) {
      return value;
    }

    const foreground = readableForeground(background);
    return [
      `\u001b[48;2;${background.red};${background.green};${background.blue}m`,
      `\u001b[38;2;${foreground.red};${foreground.green};${foreground.blue}m`,
      value,
      "\u001b[39m",
      "\u001b[49m",
    ].join("");
  };
  const paletteTone = (tone: Tone): Rgb => {
    switch (tone) {
      case "bad":
        return palette.bad;
      case "good":
        return palette.good;
      case "info":
        return palette.info;
      case "muted":
        return palette.muted;
      case "warn":
        return palette.warn;
    }
  };
  const applyTone = (value: string, tone: Tone) => {
    const painted = paintForeground(value, paletteTone(tone));
    return tone === "muted" ? colors.dim(painted) : colors.bold(painted);
  };
  const applyBadgeTone = (value: string, tone: Tone) => {
    return paintBlock(colors.bold(value), paletteTone(tone));
  };

  return {
    palette(): ThemePalette {
      return palette;
    },
    badge(label: string, tone: Tone = "muted"): string {
      return applyBadgeTone(`[${label}]`, tone);
    },
    bar(score: number): string {
      const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
      const fill = applyTone("#".repeat(filled), scoreTone(score));
      const empty = colors.dim("-".repeat(10 - filled));
      return `[${fill}${empty}]`;
    },
    bold(value: string): string {
      return colors.bold(value);
    },
    error(value: string): string {
      return applyTone(value, "bad");
    },
    missing(value = "n/a"): string {
      return applyTone(value, "muted");
    },
    muted(value: string): string {
      return applyTone(value, "muted");
    },
    label(value: string): string {
      return colors.dim(paintForeground(value, palette.label));
    },
    language(value: string): string {
      const languageColor = getLanguageColor(value);
      return colors.bold(paintForeground(value, languageColor ?? palette.value));
    },
    languageBadge(value: string): string {
      const languageColor = getLanguageColor(value);
      return languageColor
        ? paintBlock(colors.bold(`[${value}]`), languageColor)
        : applyBadgeTone(`[${value}]`, "info");
    },
    repo(value: string): string {
      return colors.bold(paintForeground(value, palette.repo));
    },
    section(value: string): string {
      return colors.bold(paintForeground(value, palette.section));
    },
    footer(value: string): string {
      return colors.dim(paintForeground(value, palette.footer));
    },
    tone(value: string, tone: Tone): string {
      return applyTone(value, tone);
    },
    value(value: string): string {
      return colors.bold(paintForeground(value, palette.value));
    },
    warning(value: string): string {
      return colors.bold(paintForeground(value, palette.warn));
    },
  };
}

export function scoreTone(score: number): Tone {
  if (score >= 75) {
    return "good";
  }

  if (score >= 50) {
    return "info";
  }

  if (score >= 25) {
    return "warn";
  }

  return "bad";
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const zeroWidthPattern = /^[\p{Mark}\p{Default_Ignorable_Code_Point}\p{Control}]+$/u;
const emojiPresentationPattern = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

// East Asian Wide and Fullwidth blocks that occur in real repository names and descriptions.
const wideRanges: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

function isWideCodePoint(codePoint: number): boolean {
  return wideRanges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function graphemeWidth(grapheme: string): number {
  if (zeroWidthPattern.test(grapheme)) {
    return 0;
  }

  if (emojiPresentationPattern.test(grapheme) || isWideCodePoint(grapheme.codePointAt(0) ?? 0)) {
    return 2;
  }

  return 1;
}

/** Terminal display columns of `value`, ignoring escape sequences. */
export function visibleLength(value: string): number {
  const text = stripVTControlCharacters(value);

  if (/^[\x20-\x7e]*$/.test(text)) {
    return text.length;
  }

  let width = 0;
  for (const { segment } of graphemes.segment(text)) {
    width += graphemeWidth(segment);
  }

  return width;
}

/** Cuts `value` to at most `maxWidth` display columns on grapheme boundaries, ending in "..." when cut. */
export function truncateVisible(value: string, maxWidth: number): string {
  if (visibleLength(value) <= maxWidth) {
    return value;
  }

  const ellipsis = maxWidth > 3 ? "..." : "";
  const budget = maxWidth - ellipsis.length;
  let width = 0;
  let kept = "";
  for (const { segment } of graphemes.segment(value)) {
    width += graphemeWidth(segment);
    if (width > budget) {
      break;
    }
    kept += segment;
  }

  return `${kept}${ellipsis}`;
}

export function padVisibleEnd(value: string, width: number): string {
  const padding = width - visibleLength(value);
  return padding > 0 ? `${value}${" ".repeat(padding)}` : value;
}

function readableForeground(background: Rgb): Rgb {
  const brightness = (background.red * 299 + background.green * 587 + background.blue * 114) / 1000;
  return brightness >= 140 ? { red: 0, green: 0, blue: 0 } : { red: 255, green: 255, blue: 255 };
}

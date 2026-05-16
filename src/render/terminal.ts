import pc from "picocolors";
import { stripVTControlCharacters } from "node:util";
import { getLanguageColor, type Rgb } from "./language-colors";

export type RenderOptions = {
  color?: boolean;
};

export type ColorMode = "always" | "auto" | "never";

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
  const applyTone = (value: string, tone: Tone) => {
    switch (tone) {
      case "bad":
        return colors.bold(colors.red(value));
      case "good":
        return colors.bold(colors.green(value));
      case "info":
        return colors.bold(colors.cyan(value));
      case "muted":
        return colors.dim(value);
      case "warn":
        return colors.bold(colors.yellow(value));
    }
  };
  const applyBadgeTone = (value: string, tone: Tone) => {
    switch (tone) {
      case "bad":
        return colors.bgRed(colors.white(colors.bold(value)));
      case "good":
        return colors.bgGreen(colors.black(colors.bold(value)));
      case "info":
        return colors.bgCyan(colors.black(colors.bold(value)));
      case "muted":
        return colors.inverse(colors.dim(value));
      case "warn":
        return colors.bgYellow(colors.black(colors.bold(value)));
    }
  };

  return {
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
      return colors.blue(value);
    },
    language(value: string): string {
      const languageColor = getLanguageColor(value);
      return languageColor ? colors.bold(paintForeground(value, languageColor)) : colors.bold(colors.white(value));
    },
    languageBadge(value: string): string {
      const languageColor = getLanguageColor(value);
      return languageColor ? paintBlock(colors.bold(`[${value}]`), languageColor) : applyBadgeTone(`[${value}]`, "info");
    },
    repo(value: string): string {
      return colors.bold(colors.cyan(value));
    },
    section(value: string): string {
      return colors.bold(colors.underline(colors.magenta(value)));
    },
    tone(value: string, tone: Tone): string {
      return applyTone(value, tone);
    },
    value(value: string): string {
      return colors.bold(colors.white(value));
    },
    warning(value: string): string {
      return applyTone(value, "warn");
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

export function visibleLength(value: string): number {
  return stripVTControlCharacters(value).length;
}

export function padVisibleEnd(value: string, width: number): string {
  const padding = width - visibleLength(value);
  return padding > 0 ? `${value}${" ".repeat(padding)}` : value;
}

function readableForeground(background: Rgb): Rgb {
  const brightness = (background.red * 299 + background.green * 587 + background.blue * 114) / 1000;
  return brightness >= 140 ? { red: 0, green: 0, blue: 0 } : { red: 255, green: 255, blue: 255 };
}

export type RenderOptions = {
  color?: boolean;
};

type Tone = "bad" | "good" | "info" | "muted" | "warn";

const ansi = {
  bad: "31",
  bold: "1",
  good: "32",
  info: "36",
  muted: "90",
  reset: "0",
  warn: "33",
};

export function shouldUseColor(env = process.env, stream = process.stdout): boolean {
  if (env.NO_COLOR !== undefined) {
    return false;
  }

  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") {
    return true;
  }

  return Boolean(stream.isTTY);
}

export function createTheme(options: RenderOptions = {}) {
  const color = Boolean(options.color);
  const paint = (code: string, value: string) => (color ? `\u001b[${code}m${value}\u001b[${ansi.reset}m` : value);
  const toneCode = (tone: Tone) => ansi[tone];

  return {
    badge(label: string, tone: Tone = "muted"): string {
      return paint(toneCode(tone), `[${label}]`);
    },
    bar(score: number): string {
      const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
      const bar = `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`;
      return paint(toneCode(scoreTone(score)), bar);
    },
    bold(value: string): string {
      return paint(ansi.bold, value);
    },
    muted(value: string): string {
      return paint(ansi.muted, value);
    },
    section(value: string): string {
      return paint(ansi.bold, value);
    },
    tone(value: string, tone: Tone): string {
      return paint(toneCode(tone), value);
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


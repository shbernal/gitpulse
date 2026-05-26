export type AnsiToSvgOptions = {
  columns?: number;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  title?: string;
};

type AnsiStyle = {
  background: string | null;
  bold: boolean;
  dim: boolean;
  foreground: string;
  inverse: boolean;
  underline: boolean;
};

type TextSegment = {
  column: number;
  style: AnsiStyle;
  text: string;
  width: number;
};

const defaultForeground = "#d1d5db";
const defaultBackground = "#111827";

const defaultStyle: AnsiStyle = {
  background: null,
  bold: false,
  dim: false,
  foreground: defaultForeground,
  inverse: false,
  underline: false,
};

const foregroundPalette: Record<number, string> = {
  30: "#111827",
  31: "#ef4444",
  32: "#22c55e",
  33: "#eab308",
  34: "#3b82f6",
  35: "#d946ef",
  36: "#06b6d4",
  37: "#f9fafb",
  90: "#6b7280",
  91: "#f87171",
  92: "#4ade80",
  93: "#facc15",
  94: "#60a5fa",
  95: "#e879f9",
  96: "#22d3ee",
  97: "#ffffff",
};

const backgroundPalette: Record<number, string | null> = {
  40: "#111827",
  41: "#dc2626",
  42: "#16a34a",
  43: "#ca8a04",
  44: "#2563eb",
  45: "#c026d3",
  46: "#0891b2",
  47: "#f9fafb",
  49: null,
  100: "#374151",
  101: "#f87171",
  102: "#4ade80",
  103: "#facc15",
  104: "#60a5fa",
  105: "#e879f9",
  106: "#22d3ee",
  107: "#ffffff",
};

const sgrPattern = /\x1b\[([0-9;]*)m/g;

export function ansiToSvg(input: string, options: AnsiToSvgOptions = {}): string {
  const columns = options.columns ?? 100;
  const fontSize = options.fontSize ?? 14;
  const lineHeight = options.lineHeight ?? 21;
  const paddingX = options.paddingX ?? 18;
  const paddingY = options.paddingY ?? 18;
  const fontFamily =
    options.fontFamily ?? "JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace";
  const normalized = input.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const lines = normalized.length > 0 ? normalized.split("\n") : [""];
  const parsedLines = lines.map(parseAnsiLine);
  const lineLengths = lines.map((line) => visibleLength(line));
  const maxLineLength = Math.max(columns, ...lineLengths);
  const charWidth = fontSize * 0.62;
  const width = Math.ceil(maxLineLength * charWidth + paddingX * 2);
  const height = Math.ceil(lines.length * lineHeight + paddingY * 2);
  const overflow = lineLengths.some((length) => length > columns);
  const columnGuideX = paddingX + columns * charWidth;

  const body = parsedLines
    .map((segments, lineIndex) => renderLine(segments, { charWidth, fontSize, lineHeight, lineIndex, paddingX, paddingY }))
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    options.title ? `  <title>${escapeXml(options.title)}</title>` : null,
    `  <rect width="100%" height="100%" rx="8" fill="${defaultBackground}"/>`,
    `  <line x1="${formatNumber(columnGuideX)}" y1="${paddingY / 2}" x2="${formatNumber(columnGuideX)}" y2="${height - paddingY / 2}" stroke="${overflow ? "#f59e0b" : "#263244"}" stroke-width="1" stroke-dasharray="4 5" opacity="${overflow ? "0.9" : "0.45"}"/>`,
    `  <g font-family="${escapeXml(fontFamily)}" font-size="${fontSize}">`,
    body,
    "  </g>",
    "</svg>",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function stripAnsi(input: string): string {
  return input.replace(sgrPattern, "");
}

export function visibleLineLengths(input: string): number[] {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => visibleLength(line));
}

export function visibleLength(input: string): number {
  return Array.from(stripAnsi(input)).length;
}

function parseAnsiLine(line: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let style = { ...defaultStyle };
  let cursor = 0;
  let column = 0;

  for (const match of line.matchAll(sgrPattern)) {
    if (match.index > cursor) {
      const text = line.slice(cursor, match.index);
      const width = Array.from(text).length;
      segments.push({ column, style: { ...style }, text, width });
      column += width;
    }

    style = applySgr(style, match[1]);
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    const text = line.slice(cursor);
    const width = Array.from(text).length;
    segments.push({ column, style: { ...style }, text, width });
  }

  return segments;
}

function applySgr(style: AnsiStyle, paramsText: string): AnsiStyle {
  const params = paramsText === "" ? [0] : paramsText.split(";").map((value) => Number(value));
  let next = { ...style };

  for (let index = 0; index < params.length; index += 1) {
    const code = params[index];

    if (code === 0) {
      next = { ...defaultStyle };
    } else if (code === 1) {
      next.bold = true;
    } else if (code === 2) {
      next.dim = true;
    } else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 4) {
      next.underline = true;
    } else if (code === 24) {
      next.underline = false;
    } else if (code === 7) {
      next.inverse = true;
    } else if (code === 27) {
      next.inverse = false;
    } else if (code === 39) {
      next.foreground = defaultForeground;
    } else if (code === 49) {
      next.background = null;
    } else if (Object.hasOwn(foregroundPalette, code)) {
      next.foreground = foregroundPalette[code];
    } else if (Object.hasOwn(backgroundPalette, code)) {
      next.background = backgroundPalette[code];
    } else if ((code === 38 || code === 48) && params[index + 1] === 2) {
      const color = `rgb(${params[index + 2]}, ${params[index + 3]}, ${params[index + 4]})`;
      if (code === 38) {
        next.foreground = color;
      } else {
        next.background = color;
      }
      index += 4;
    }
  }

  return next;
}

function renderLine(
  segments: TextSegment[],
  layout: {
    charWidth: number;
    fontSize: number;
    lineHeight: number;
    lineIndex: number;
    paddingX: number;
    paddingY: number;
  },
): string {
  const y = layout.paddingY + layout.fontSize + layout.lineIndex * layout.lineHeight;
  const backgrounds = segments
    .map((segment) => {
      const style = effectiveStyle(segment.style);
      if (!style.background || segment.width === 0) {
        return null;
      }

      return `    <rect x="${formatNumber(layout.paddingX + segment.column * layout.charWidth)}" y="${formatNumber(
        y - layout.fontSize - 3,
      )}" width="${formatNumber(segment.width * layout.charWidth)}" height="${layout.lineHeight}" fill="${escapeXml(style.background)}" rx="2"/>`;
    })
    .filter((line): line is string => Boolean(line));
  const spans = segments
    .map((segment) => {
      if (segment.text.length === 0) {
        return "";
      }

      const style = effectiveStyle(segment.style);
      const attributes = [
        `fill="${escapeXml(style.foreground)}"`,
        style.bold ? 'font-weight="700"' : null,
        style.dim ? 'opacity="0.62"' : null,
        style.underline ? 'text-decoration="underline"' : null,
      ]
        .filter((attribute): attribute is string => Boolean(attribute))
        .join(" ");

      return `<tspan ${attributes}>${escapeXml(segment.text)}</tspan>`;
    })
    .join("");

  return [...backgrounds, `    <text x="${layout.paddingX}" y="${y}" xml:space="preserve">${spans}</text>`].join("\n");
}

function effectiveStyle(style: AnsiStyle): AnsiStyle {
  if (!style.inverse) {
    return style;
  }

  return {
    ...style,
    background: style.foreground,
    foreground: style.background ?? defaultBackground,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

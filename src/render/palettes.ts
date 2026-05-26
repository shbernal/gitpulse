export type Rgb = {
  red: number;
  green: number;
  blue: number;
};

export type ThemePalette = {
  background: Rgb;
  text: Rgb;
  muted: Rgb;
  label: Rgb;
  section: Rgb;
  repo: Rgb;
  good: Rgb;
  warn: Rgb;
  bad: Rgb;
  info: Rgb;
  value: Rgb;
  footer: Rgb;
};

export const THEME_NAMES = ["tokyo-night", "catppuccin-mocha", "nord", "gruvbox-dark", "dracula"] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const defaultThemeName: ThemeName = "tokyo-night";

const palettes: Record<ThemeName, ThemePalette> = {
  "tokyo-night": {
    background: hex("24283b"),
    text: hex("c0caf5"),
    muted: hex("565f89"),
    label: hex("7aa2f7"),
    section: hex("bb9af7"),
    repo: hex("7dcfff"),
    good: hex("9ece6a"),
    warn: hex("e0af68"),
    bad: hex("f7768e"),
    info: hex("2ac3de"),
    value: hex("c0caf5"),
    footer: hex("565f89"),
  },
  "catppuccin-mocha": {
    background: hex("1e1e2e"),
    text: hex("cdd6f4"),
    muted: hex("7f849c"),
    label: hex("89b4fa"),
    section: hex("cba6f7"),
    repo: hex("89dceb"),
    good: hex("a6e3a1"),
    warn: hex("f9e2af"),
    bad: hex("f38ba8"),
    info: hex("94e2d5"),
    value: hex("cdd6f4"),
    footer: hex("7f849c"),
  },
  nord: {
    background: hex("2e3440"),
    text: hex("d8dee9"),
    muted: hex("4c566a"),
    label: hex("81a1c1"),
    section: hex("88c0d0"),
    repo: hex("8fbcbb"),
    good: hex("a3be8c"),
    warn: hex("ebcb8b"),
    bad: hex("bf616a"),
    info: hex("5e81ac"),
    value: hex("d8dee9"),
    footer: hex("4c566a"),
  },
  "gruvbox-dark": {
    background: hex("282828"),
    text: hex("ebdbb2"),
    muted: hex("928374"),
    label: hex("83a598"),
    section: hex("d3869b"),
    repo: hex("8ec07c"),
    good: hex("b8bb26"),
    warn: hex("fabd2f"),
    bad: hex("fb4934"),
    info: hex("458588"),
    value: hex("ebdbb2"),
    footer: hex("928374"),
  },
  dracula: {
    background: hex("282a36"),
    text: hex("f8f8f2"),
    muted: hex("6272a4"),
    label: hex("8be9fd"),
    section: hex("bd93f9"),
    repo: hex("8be9fd"),
    good: hex("50fa7b"),
    warn: hex("f1fa8c"),
    bad: hex("ff5555"),
    info: hex("bd93f9"),
    value: hex("f8f8f2"),
    footer: hex("6272a4"),
  },
};

export function getPalette(theme: ThemeName = defaultThemeName): ThemePalette {
  return palettes[theme];
}

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && THEME_NAMES.includes(value as ThemeName);
}

export function rgbToCss(color: Rgb): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function hex(value: string): Rgb {
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

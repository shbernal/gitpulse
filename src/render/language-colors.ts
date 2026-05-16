export type Rgb = {
  red: number;
  green: number;
  blue: number;
};

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  Java: "#b07219",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  PHP: "#4f5d95",
  Ruby: "#701516",
  Go: "#00add8",
  Rust: "#f74c00",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Scala: "#c22d40",
} as const;

type LanguageName = keyof typeof LANGUAGE_COLORS;

const LANGUAGE_ALIASES: Record<string, LanguageName> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TypeScript",
  py: "Python",
  python: "Python",
  java: "Java",
  cs: "C#",
  "c#": "C#",
  csharp: "C#",
  cpp: "C++",
  "c++": "C++",
  cxx: "C++",
  c: "C",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  go: "Go",
  golang: "Go",
  rs: "Rust",
  rust: "Rust",
  swift: "Swift",
  kt: "Kotlin",
  kotlin: "Kotlin",
  dart: "Dart",
  sh: "Shell",
  bash: "Shell",
  shell: "Shell",
  html: "HTML",
  css: "CSS",
  vue: "Vue",
  svelte: "Svelte",
  scala: "Scala",
};

export function getLanguageColor(language: string): Rgb | null {
  const canonical = LANGUAGE_ALIASES[normalizeLanguageName(language)];
  if (!canonical) {
    return null;
  }

  return hexToRgb(LANGUAGE_COLORS[canonical]);
}

function normalizeLanguageName(language: string): string {
  return language.trim().toLowerCase();
}

function hexToRgb(hex: string): Rgb {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

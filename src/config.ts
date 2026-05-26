import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { defaultThemeName, isThemeName, type ThemeName } from "./render/palettes";
import { COLOR_MODES, type ColorMode } from "./render/terminal";

type Env = Record<string, string | undefined>;

export type GitpulseConfig = {
  cache: {
    enabled: boolean;
    maxCacheHours: number;
    staleIfError: boolean;
  };
  contributors: {
    fetchLimit: number;
  };
  output: {
    color: ColorMode;
    theme: ThemeName;
  };
};

export const defaultConfig: GitpulseConfig = {
  cache: {
    enabled: true,
    maxCacheHours: 168,
    staleIfError: true,
  },
  contributors: {
    fetchLimit: 100,
  },
  output: {
    color: "auto",
    theme: defaultThemeName,
  },
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(env: Env = process.env): Promise<GitpulseConfig> {
  const filePath = configPath(env);

  try {
    const raw = await readFile(filePath, "utf8");
    return parseConfig(JSON.parse(raw));
  } catch (error) {
    if (isNotFound(error)) {
      return parseConfig({});
    }

    if (error instanceof SyntaxError) {
      throw new ConfigError(`Could not parse config file at ${filePath}.`);
    }

    throw error;
  }
}

export function configPath(env: Env = process.env): string {
  return path.join(xdgConfigDir(env), "gitpulse", "config.json");
}

export async function resetConfig(env: Env = process.env): Promise<string> {
  const filePath = configPath(env);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
  return filePath;
}

export function parseConfig(value: unknown): GitpulseConfig {
  if (!isRecord(value)) {
    throw new ConfigError("Config file must contain a JSON object.");
  }

  const config: GitpulseConfig = {
    cache: {
      ...defaultConfig.cache,
    },
    contributors: {
      ...defaultConfig.contributors,
    },
    output: {
      ...defaultConfig.output,
    },
  };

  if (value.cache !== undefined) {
    if (!isRecord(value.cache)) {
      throw new ConfigError("Config field cache must be an object.");
    }

    if (value.cache.enabled !== undefined) {
      if (typeof value.cache.enabled !== "boolean") {
        throw new ConfigError("Config field cache.enabled must be a boolean.");
      }

      config.cache.enabled = value.cache.enabled;
    }

    if (value.cache.maxCacheHours !== undefined) {
      if (!isNonNegativeNumber(value.cache.maxCacheHours)) {
        throw new ConfigError("Config field cache.maxCacheHours must be a non-negative number.");
      }

      config.cache.maxCacheHours = value.cache.maxCacheHours;
    }

    if (value.cache.staleIfError !== undefined) {
      if (typeof value.cache.staleIfError !== "boolean") {
        throw new ConfigError("Config field cache.staleIfError must be a boolean.");
      }

      config.cache.staleIfError = value.cache.staleIfError;
    }
  }

  if (value.contributors !== undefined) {
    if (!isRecord(value.contributors)) {
      throw new ConfigError("Config field contributors must be an object.");
    }

    if (value.contributors.fetchLimit !== undefined) {
      if (!isPositiveInteger(value.contributors.fetchLimit)) {
        throw new ConfigError("Config field contributors.fetchLimit must be a positive integer.");
      }

      config.contributors.fetchLimit = value.contributors.fetchLimit;
    }
  }

  if (value.output !== undefined) {
    if (!isRecord(value.output)) {
      throw new ConfigError("Config field output must be an object.");
    }

    if (value.output.color !== undefined) {
      if (!isColorMode(value.output.color)) {
        throw new ConfigError("Config field output.color must be one of: auto, always, never.");
      }

      config.output.color = value.output.color;
    }

    if (value.output.theme !== undefined) {
      if (!isThemeName(value.output.theme)) {
        throw new ConfigError("Config field output.theme must be one of: tokyo-night, catppuccin-mocha, nord, gruvbox-dark, dracula.");
      }

      config.output.theme = value.output.theme;
    }
  }

  return config;
}

function xdgConfigDir(env: Env): string {
  return env.XDG_CONFIG_HOME || path.join(env.HOME || homedir(), ".config");
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isColorMode(value: unknown): value is ColorMode {
  return typeof value === "string" && COLOR_MODES.includes(value as ColorMode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

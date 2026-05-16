import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type Env = Record<string, string | undefined>;

export type GitpulseConfig = {
  cache: {
    enabled: boolean;
    maxCacheHours: number;
    staleIfError: boolean;
  };
};

export const defaultConfig: GitpulseConfig = {
  cache: {
    enabled: true,
    maxCacheHours: 168,
    staleIfError: true,
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

export function parseConfig(value: unknown): GitpulseConfig {
  if (!isRecord(value)) {
    throw new ConfigError("Config file must contain a JSON object.");
  }

  const config: GitpulseConfig = {
    cache: {
      ...defaultConfig.cache,
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

  return config;
}

function xdgConfigDir(env: Env): string {
  return env.XDG_CONFIG_HOME || path.join(env.HOME || homedir(), ".config");
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

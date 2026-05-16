import { Command, InvalidArgumentError, Option } from "commander";
import { appendHistoryEvent, buildHistoryEvent, readHistoryEvents } from "./cache/history";
import { type CacheMode } from "./cache/policy";
import { resolveSnapshot } from "./cache/resolve";
import { ConfigError, loadConfig } from "./config";
import { GitHubClient } from "./github/client";
import { renderHistory } from "./render/history";
import { renderComparisonJson, renderRepoJson } from "./render/json";
import { renderComparison, renderRepo } from "./render/table";
import { shouldUseColor, type ColorMode, type RenderOptions } from "./render/terminal";
import type { SnapshotWithSource } from "./types";

type CommandOptions = {
  color?: ColorMode;
  contributorFetchLimit?: number;
  json?: boolean;
  maxCacheHours?: number;
  offline?: boolean;
  refresh?: boolean;
};

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();

  addSharedOptions(
    program
      .name("gitpulse")
      .description("Take the pulse of GitHub repositories from the terminal.")
      .version("0.1.0"),
  )
    .argument("[repo]", "repository reference in owner/repo form")
    .action(async (repo: string | undefined, options: CommandOptions) => {
      if (!repo) {
        program.help({ error: true });
        return;
      }

      await runRepo(repo, options);
    });

  addSharedOptions(
    program
      .command("repo")
      .description("Show a repository pulse report")
      .argument("<repo>", "repository reference in owner/repo form"),
  )
    .action(async (repo: string, _options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runRepo(repo, options);
    });

  addSharedOptions(
    program
      .command("compare")
      .description("Compare two or more repositories side by side")
      .argument("<repos...>", "repository references in owner/repo form"),
  )
    .action(async (repos: string[], _options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runCompare(repos, options);
    });

  program
    .command("history")
    .description("Show recently consulted repositories")
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .action(async (_options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runHistory(Boolean(options.json), options.color ?? "auto");
    });

  await program.parseAsync(argv);
}

function addSharedOptions(command: Command): Command {
  return command
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .option("--refresh", "bypass the cache and refresh from the GitHub API")
    .option("--offline", "use the local cache only, even when cached data is stale")
    .addOption(contributorFetchLimitOption())
    .addOption(maxCacheHoursOption());
}

function colorOption(): Option {
  return new Option("--color <mode>", "color output: auto, always, never").choices(["auto", "always", "never"]);
}

function maxCacheHoursOption(): Option {
  return new Option("--max-cache-hours <hours>", "override cache freshness in hours").argParser(parseMaxCacheHours);
}

function contributorFetchLimitOption(): Option {
  return new Option("--contributor-fetch-limit <count>", "override how many contributors are fetched for concentration metrics").argParser(
    parsePositiveInteger,
  );
}

function parseMaxCacheHours(value: string): number {
  const hours = Number(value);

  if (!Number.isFinite(hours) || hours < 0) {
    throw new InvalidArgumentError("Expected a non-negative number of hours.");
  }

  return hours;
}

function parsePositiveInteger(value: string): number {
  const count = Number(value);

  if (!Number.isInteger(count) || count <= 0) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }

  return count;
}

async function runRepo(repo: string, options: CommandOptions): Promise<void> {
  const runtime = await loadRuntimeOptions(options);

  if (!runtime.ok) {
    console.error(`gitpulse: ${runtime.message}`);
    process.exitCode = 1;
    return;
  }

  const client = new GitHubClient();
  const now = new Date();
  const snapshot = await resolveSnapshot(client, repo, {
    ...runtime.value.cache,
    contributorFetchLimit: runtime.value.contributorFetchLimit,
    now,
  });
  const result = snapshot.result;

  await recordHistory("repo", [repo], [snapshot], now);

  if (runtime.value.json) {
    console.log(renderRepoJson(result, snapshot.source));
  } else if (result.ok) {
    console.log(renderRepo(result.snapshot, runtime.value.renderOptions, snapshot.source));
  } else {
    console.error(`gitpulse: ${result.error.message}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runCompare(repos: string[], options: CommandOptions): Promise<void> {
  if (repos.length < 2) {
    console.error("gitpulse: compare requires at least two repositories.");
    process.exitCode = 1;
    return;
  }

  const runtime = await loadRuntimeOptions(options);

  if (!runtime.ok) {
    console.error(`gitpulse: ${runtime.message}`);
    process.exitCode = 1;
    return;
  }

  const client = new GitHubClient();
  const now = new Date();
  const snapshots = await Promise.all(
    repos.map((repo) =>
      resolveSnapshot(client, repo, {
        ...runtime.value.cache,
        contributorFetchLimit: runtime.value.contributorFetchLimit,
        now,
      }),
    ),
  );
  const results = snapshots.map((snapshot) => snapshot.result);
  const sources = snapshots.map((snapshot) => snapshot.source);

  await recordHistory("compare", repos, snapshots, now);

  if (runtime.value.json) {
    console.log(renderComparisonJson(results, sources));
  } else {
    console.log(renderComparison(results, runtime.value.renderOptions, sources));
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

async function runHistory(json: boolean, colorMode: ColorMode): Promise<void> {
  try {
    const events = await readHistoryEvents();

    if (json) {
      console.log(JSON.stringify({ schemaVersion: 2, command: "history", events }, null, 2));
    } else {
      console.log(renderHistory(events, { color: shouldUseColor(colorMode) }));
    }
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

type RuntimeOptions = {
  cache: {
    cacheEnabled: boolean;
    maxCacheHours: number;
    staleIfError: boolean;
    mode: CacheMode;
  };
  contributorFetchLimit: number;
  json: boolean;
  renderOptions: RenderOptions;
};

type RuntimeOptionsResult =
  | {
      ok: true;
      value: RuntimeOptions;
    }
  | {
      ok: false;
      message: string;
    };

async function loadRuntimeOptions(options: CommandOptions): Promise<RuntimeOptionsResult> {
  if (options.refresh && options.offline) {
    return {
      ok: false,
      message: "--refresh and --offline cannot be used together.",
    };
  }

  try {
    const config = await loadConfig();
    const mode: CacheMode = options.refresh ? "refresh" : options.offline ? "offline" : "default";

    return {
      ok: true,
      value: {
        cache: {
          cacheEnabled: config.cache.enabled,
          maxCacheHours: options.maxCacheHours ?? config.cache.maxCacheHours,
          staleIfError: config.cache.staleIfError,
          mode,
        },
        contributorFetchLimit: options.contributorFetchLimit ?? config.contributors.fetchLimit,
        json: Boolean(options.json),
        renderOptions: {
          color: shouldUseColor(options.color ?? "auto"),
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ConfigError ? error.message : errorMessage(error),
    };
  }
}

async function recordHistory(
  command: "repo" | "compare",
  inputs: string[],
  snapshots: SnapshotWithSource[],
  now: Date,
): Promise<void> {
  try {
    await appendHistoryEvent(buildHistoryEvent(command, inputs, snapshots, now));
  } catch {
    // History is useful state, but a failed history write should not hide a report.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

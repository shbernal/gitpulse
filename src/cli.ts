import { Command, InvalidArgumentError, Option } from "commander";
import { githubRepoUrl, githubUserUrl, openUrlInBrowser, type UrlOpener } from "./browser";
import { renderBashCompletionScript } from "./completions";
import { appendHistoryEvent, buildHistoryEvent, clearHistory, readHistoryEvents } from "./cache/history";
import { completeKnownRepos, readKnownRepos, resolveKnownRepoShorthand } from "./cache/known-repos";
import { completeKnownUsers, readKnownUsers } from "./cache/known-users";
import { clearCache } from "./cache/maintenance";
import { type CacheMode } from "./cache/policy";
import { resolveSnapshot } from "./cache/resolve";
import { resolveUserProfileSnapshot } from "./cache/resolve-user";
import { ConfigError, configPath, loadConfig, resetConfig } from "./config";
import { GitHubClient } from "./github/client";
import { renderHistory } from "./render/history";
import { renderComparisonJson, renderDocsJson, renderRepoJson, renderUserProfileJson } from "./render/json";
import { renderComparison, renderDocs, renderRepo, renderUserProfile } from "./render/table";
import { shouldUseColor, type ColorMode, type RenderOptions } from "./render/terminal";
import type { SnapshotWithSource, UserProfileWithSource } from "./types";

type CommandOptions = {
  color?: ColorMode;
  contributorFetchLimit?: number;
  explain?: boolean;
  json?: boolean;
  maxCacheHours?: number;
  offline?: boolean;
  refresh?: boolean;
};

type CliDependencies = {
  openUrl?: UrlOpener;
};

export async function main(argv = process.argv, dependencies: CliDependencies = {}): Promise<void> {
  const program = new Command();
  const openUrl = dependencies.openUrl ?? openUrlInBrowser;

  addSharedOptions(
    program
      .name("gitpulse")
      .description("Take the pulse of GitHub repositories from the terminal.")
      .version("0.1.0"),
  )
    .argument("[repos...]", "repository references in owner/repo form or exact local shorthand")
    .option("--explain", "show composite score contribution breakdowns for a single repository")
    .action(async (repos: string[] | undefined, options: CommandOptions) => {
      const values = repos ?? [];

      if (values.length === 0) {
        program.help({ error: true });
        return;
      }

      if (values.length === 1) {
        await runRepo(values[0], options);
      } else {
        if (rejectExplainForNonRepoReport(options)) {
          return;
        }

        await runCompare(values, options);
      }
    });

  addSharedOptions(
    program
      .command("docs")
      .description("Show repository documentation signals")
      .argument("<repo>", "repository reference in owner/repo form or exact local shorthand"),
  ).action(async (repo: string, _options: CommandOptions, command: Command) => {
    const options = command.optsWithGlobals<CommandOptions>();
    await runDocs(repo, options);
  });

  program
    .command("web")
    .description("Open a GitHub repository in the browser")
    .argument("<repo>", "repository reference in owner/repo form or exact local shorthand")
    .action(async (repo: string) => {
      await runRepoWeb(repo, openUrl);
    });

  const userCommand = addCacheOptions(
    program
      .command("user")
      .description("Show GitHub user profile signals")
      .argument("<login>", "GitHub user or organization login"),
  ).action(async (login: string, _options: CommandOptions, command: Command) => {
    const options = command.optsWithGlobals<CommandOptions>();
    await runUser(login, options);
  });

  userCommand
    .command("web")
    .description("Open a GitHub user or organization profile in the browser")
    .argument("<login>", "GitHub user or organization login")
    .action(async (login: string) => {
      await runUserWeb(login, openUrl);
    });

  const historyCommand = program
    .command("history")
    .description("Show recently consulted targets")
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .action(async (_options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runHistory(Boolean(options.json), options.color ?? "auto");
    });

  historyCommand
    .command("clear")
    .description("Clear local consultation history")
    .action(async () => {
      await runHistoryClear();
    });

  const cacheCommand = program.command("cache").description("Manage local cache files");

  cacheCommand
    .command("clear")
    .description("Clear cached repository snapshots")
    .action(async () => {
      await runCacheClear();
    });

  const configCommand = program.command("config").description("Manage local configuration");

  configCommand
    .command("path")
    .description("Print the local config file path")
    .action(() => {
      runConfigPath();
    });

  configCommand
    .command("reset")
    .description("Reset the local config file to defaults")
    .action(async () => {
      await runConfigReset();
    });

  const completionsCommand = program.command("completions").description("Generate shell completion scripts");

  completionsCommand
    .command("bash")
    .description("Print a Bash completion script")
    .action(() => {
      runCompletionsBash();
    });

  const completeCommand = program.command("__complete", { hidden: true });

  completeCommand
    .command("repos", { hidden: true })
    .requiredOption("--current <token>", "current completion token")
    .action(async (options: { current: string }) => {
      await runCompleteRepos(options.current);
    });

  completeCommand
    .command("users", { hidden: true })
    .requiredOption("--current <token>", "current completion token")
    .action(async (options: { current: string }) => {
      await runCompleteUsers(options.current);
    });

  await program.parseAsync(argv);
}

function addSharedOptions(command: Command): Command {
  return addCacheOptions(command)
    .addOption(contributorFetchLimitOption());
}

function addCacheOptions(command: Command): Command {
  return command
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .option("--refresh", "bypass the cache and refresh from the GitHub API")
    .option("--offline", "use the local cache only, even when cached data is stale")
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

  const resolved = await resolveRepositoryInputs([repo]);

  if (!resolved.ok) {
    console.error(`gitpulse: ${resolved.message}`);
    process.exitCode = 1;
    return;
  }

  const client = new GitHubClient();
  const now = new Date();
  const snapshot = await resolveSnapshot(client, resolved.values[0], {
    ...runtime.value.cache,
    contributorFetchLimit: runtime.value.contributorFetchLimit,
    now,
  });
  const result = snapshot.result;

  await recordHistory("repo", [repo], [snapshot], now);

  if (runtime.value.json) {
    console.log(renderRepoJson(result, snapshot.source, { explainScores: runtime.value.explain }));
  } else if (result.ok) {
    console.log(renderRepo(result.snapshot, { ...runtime.value.renderOptions, explainScores: runtime.value.explain }, snapshot.source));
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
  const resolved = await resolveRepositoryInputs(repos);

  if (!resolved.ok) {
    console.error(`gitpulse: ${resolved.message}`);
    process.exitCode = 1;
    return;
  }

  const snapshots = await Promise.all(
    resolved.values.map((repo) =>
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

async function runDocs(repo: string, options: CommandOptions): Promise<void> {
  if (rejectExplainForNonRepoReport(options)) {
    return;
  }

  const runtime = await loadRuntimeOptions(options);

  if (!runtime.ok) {
    console.error(`gitpulse: ${runtime.message}`);
    process.exitCode = 1;
    return;
  }

  const resolved = await resolveRepositoryInputs([repo]);

  if (!resolved.ok) {
    console.error(`gitpulse: ${resolved.message}`);
    process.exitCode = 1;
    return;
  }

  const client = new GitHubClient();
  const now = new Date();
  const snapshot = await resolveSnapshot(client, resolved.values[0], {
    ...runtime.value.cache,
    contributorFetchLimit: runtime.value.contributorFetchLimit,
    now,
  });
  const result = snapshot.result;

  await recordHistory("docs", [repo], [snapshot], now);

  if (runtime.value.json) {
    console.log(renderDocsJson(result, snapshot.source));
  } else if (result.ok) {
    console.log(renderDocs(result.snapshot, runtime.value.renderOptions, snapshot.source));
  } else {
    console.error(`gitpulse: ${result.error.message}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runRepoWeb(repo: string, openUrl: UrlOpener): Promise<void> {
  const resolved = await resolveRepositoryInputs([repo]);

  if (!resolved.ok) {
    console.error(`gitpulse: ${resolved.message}`);
    process.exitCode = 1;
    return;
  }

  let url;

  try {
    url = githubRepoUrl(resolved.values[0]);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  try {
    await openUrl(url);
    console.log(`Opened ${url}`);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

async function runUser(login: string, options: CommandOptions): Promise<void> {
  if (rejectExplainForNonRepoReport(options)) {
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
  const snapshot = await resolveUserProfileSnapshot(client, login, {
    ...runtime.value.cache,
    now,
  });
  const result = snapshot.result;

  await recordHistory("user", [login], [snapshot], now);

  if (runtime.value.json) {
    console.log(renderUserProfileJson(result, snapshot.source));
  } else if (result.ok) {
    console.log(renderUserProfile(result.snapshot, runtime.value.renderOptions, snapshot.source));
  } else {
    console.error(`gitpulse: ${result.error.message}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runUserWeb(login: string, openUrl: UrlOpener): Promise<void> {
  let url;

  try {
    url = githubUserUrl(login);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  try {
    await openUrl(url);
    console.log(`Opened ${url}`);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

async function runHistory(json: boolean, colorMode: ColorMode): Promise<void> {
  try {
    const events = await readHistoryEvents();

    if (json) {
      console.log(JSON.stringify({ schemaVersion: 3, command: "history", events }, null, 2));
    } else {
      console.log(renderHistory(events, { color: shouldUseColor(colorMode) }));
    }
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

async function runCacheClear(): Promise<void> {
  try {
    const directory = await clearCache();
    console.log(`Cleared cache: ${directory}`);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

async function runHistoryClear(): Promise<void> {
  try {
    const filePath = await clearHistory();
    console.log(`Cleared history: ${filePath}`);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

function runConfigPath(): void {
  console.log(configPath());
}

async function runConfigReset(): Promise<void> {
  try {
    const filePath = await resetConfig();
    console.log(`Reset config: ${filePath}`);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

function runCompletionsBash(): void {
  console.log(renderBashCompletionScript().trimEnd());
}

function rejectExplainForNonRepoReport(options: CommandOptions): boolean {
  if (!options.explain) {
    return false;
  }

  console.error("gitpulse: --explain is only supported for single repository reports.");
  process.exitCode = 1;
  return true;
}

async function runCompleteRepos(current: string): Promise<void> {
  const candidates = completeKnownRepos(current, await readKnownRepos());

  if (candidates.length > 0) {
    console.log(candidates.join("\n"));
  }
}

async function runCompleteUsers(current: string): Promise<void> {
  const candidates = completeKnownUsers(current, await readKnownUsers());

  if (candidates.length > 0) {
    console.log(candidates.join("\n"));
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
  explain: boolean;
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
        explain: Boolean(options.explain),
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

async function resolveRepositoryInputs(inputs: string[]): Promise<{ ok: true; values: string[] } | { ok: false; message: string }> {
  if (inputs.every((input) => input.includes("/"))) {
    return { ok: true, values: inputs };
  }

  const knownRepos = await readKnownRepos();

  try {
    return {
      ok: true,
      values: inputs.map((input) => resolveKnownRepoShorthand(input, knownRepos)),
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

async function recordHistory(
  command: "repo" | "compare" | "docs" | "user",
  inputs: string[],
  snapshots: Array<SnapshotWithSource | UserProfileWithSource>,
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

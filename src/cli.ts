import { Command, InvalidArgumentError, Option } from "commander";
import { version as packageVersion } from "../package.json";
import { githubRepoUrl, githubUserUrl, openUrlInBrowser, type UrlOpener } from "./browser";
import { renderBashCompletionScript } from "./completions";
import { appendHistoryEvent, buildHistoryEvent, clearHistory, readHistoryEvents } from "./cache/history";
import { completeKnownRepos, readKnownRepos, resolveKnownRepoShorthand } from "./cache/known-repos";
import { completeKnownUsers, readKnownUsers } from "./cache/known-users";
import { clearCache } from "./cache/maintenance";
import { type CacheMode } from "./cache/policy";
import { resolveSearchRepositories } from "./cache/resolve-search";
import { resolveSnapshot } from "./cache/resolve";
import { recordViewerStarMutation, resolveViewerStar } from "./cache/resolve-viewer-star";
import { resolveStarredRepositories } from "./cache/resolve-starred";
import { resolveUserProfileSnapshot } from "./cache/resolve-user";
import { ConfigError, configPath, loadConfig, resetConfig } from "./config";
import { GitHubApiError, GitHubClient } from "./github/client";
import { collectMostStarredForks } from "./metrics/forks";
import { renderHistory } from "./render/history";
import {
  renderComparisonJson,
  renderDocsJson,
  renderForksJson,
  renderRepoJson,
  renderSearchRepositoriesJson,
  renderStarMutationJson,
  renderStarredRepositoriesJson,
  renderUserProfileJson,
} from "./render/json";
import { renderComparison, renderDocs, renderForks, renderRepo, renderUserProfile } from "./render/table";
import { THEME_NAMES, type ThemeName } from "./render/palettes";
import { COLOR_MODES, shouldUseColor, type ColorMode, type RenderOptions } from "./render/terminal";
import { formatInferenceFailure, inferRepositoryFromGitRemotes } from "./util/git-remotes";
import { parseRepoRef } from "./util/repo-ref";
import {
  selectSearchRepository,
  selectStarredRepository,
  type SearchRepositorySelector,
  type StarredRepositorySelector,
} from "./repository-selector";
import type {
  SearchRepositoryOrder,
  SearchRepositorySort,
  SnapshotWithSource,
  StarAction,
  StarMutation,
  StarredRepositoryDirection,
  StarredRepositorySort,
  UserProfileWithSource,
} from "./types";

type CommandOptions = {
  color?: ColorMode;
  contributorFetchLimit?: number;
  explain?: boolean;
  json?: boolean;
  maxCacheHours?: number;
  offline?: boolean;
  refresh?: boolean;
  theme?: ThemeName;
};

type StarredCommandOptions = CommandOptions & {
  direction?: StarredRepositoryDirection;
  list?: boolean;
  sort?: StarredRepositorySort;
};

type StarCommandOptions = {
  json?: boolean;
};

type ForksCommandOptions = {
  color?: ColorMode;
  json?: boolean;
  limit?: number;
  theme?: ThemeName;
};

type SearchCommandOptions = CommandOptions & {
  limit?: number;
  list?: boolean;
  lucky?: boolean;
  order?: SearchRepositoryOrder;
  sort?: SearchRepositorySort;
};

type CliDependencies = {
  openUrl?: UrlOpener;
  selectSearchRepository?: SearchRepositorySelector;
  selectStarredRepository?: StarredRepositorySelector;
};

export async function main(argv = process.argv, dependencies: CliDependencies = {}): Promise<void> {
  const program = new Command();
  const openUrl = dependencies.openUrl ?? openUrlInBrowser;
  const starredSelector = dependencies.selectStarredRepository ?? selectStarredRepository;
  const searchSelector = dependencies.selectSearchRepository ?? selectSearchRepository;

  addSharedOptions(
    program
      .name("gitpulse")
      .description("Take the pulse of GitHub repositories from the terminal.")
      .version(packageVersion),
  )
    .argument(
      "[owner/repo...]",
      "one repository to report on, or several to compare; exact local shorthand works, and inside a Git checkout the argument may be omitted",
    )
    .option("--explain", "show composite score contribution breakdowns for a single repository")
    .action(async (repos: string[] | undefined, options: CommandOptions) => {
      const values = repos ?? [];

      if (values.length === 0) {
        const inferred = await inferRepositoryFromGitRemotes();

        if (inferred.kind === "outside-checkout") {
          program.help({ error: true });
          return;
        }

        if (inferred.kind !== "inferred") {
          console.error(`gitpulse: ${formatInferenceFailure(inferred)}`);
          process.exitCode = 1;
          return;
        }

        console.error(`gitpulse: inferred ${inferred.fullName} from git remote "${inferred.remote}".`);

        if (inferred.upstreamFullName) {
          console.error(
            `gitpulse: upstream remote points at ${inferred.upstreamFullName}; pass it explicitly to report on it.`,
          );
        }

        await runRepo(inferred.fullName, options);
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

  addCacheOptions(program.command("starred").description("Pick one of your starred repositories to inspect"))
    .option("--list", "print starred repository names instead of opening a selector")
    .addOption(starredSortOption())
    .addOption(starredDirectionOption())
    .action(async (_options: StarredCommandOptions, command: Command) => {
      const options = command.optsWithGlobals<StarredCommandOptions>();
      await runStarred(options, starredSelector);
    });

  program
    .command("star")
    .description("Star a repository as the authenticated user")
    .argument(
      "[repo]",
      "repository reference in owner/repo form or exact local shorthand; omitted inside a Git checkout",
    )
    .option("--json", "emit JSON output")
    .action(async (repo: string | undefined, _options: StarCommandOptions, command: Command) => {
      await runStarMutation("star", repo, command.optsWithGlobals<StarCommandOptions>());
    });

  program
    .command("unstar")
    .description("Remove your star from a repository")
    .argument(
      "[repo]",
      "repository reference in owner/repo form or exact local shorthand; omitted inside a Git checkout",
    )
    .option("--json", "emit JSON output")
    .action(async (repo: string | undefined, _options: StarCommandOptions, command: Command) => {
      await runStarMutation("unstar", repo, command.optsWithGlobals<StarCommandOptions>());
    });

  program
    .command("forks")
    .description("Show the most starred forks of a repository")
    .argument(
      "[repo]",
      "repository reference in owner/repo form or exact local shorthand; omitted inside a Git checkout",
    )
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .addOption(themeOption())
    .addOption(forksLimitOption())
    .action(async (repo: string | undefined, _options: ForksCommandOptions, command: Command) => {
      await runForks(repo, command.optsWithGlobals<ForksCommandOptions>());
    });

  addSearchOptions(
    program
      .command("search")
      .description("Search GitHub repositories and inspect a selected result")
      .argument("<query...>", "GitHub repository search query"),
  ).action(async (queryParts: string[], _options: SearchCommandOptions, command: Command) => {
    const options = command.optsWithGlobals<SearchCommandOptions>();
    await runSearch(queryParts, options, searchSelector);
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
    .addOption(themeOption())
    .action(async (_options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runHistory(Boolean(options.json), options);
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
    .addOption(themeOption())
    .option("--refresh", "bypass the cache and refresh from the GitHub API")
    .option("--offline", "use the local cache only, even when cached data is stale")
    .addOption(maxCacheHoursOption());
}

function addSearchOptions(command: Command): Command {
  return addCacheOptions(command)
    .option("--list", "print search result repository names instead of opening a selector")
    .option("--lucky", "inspect the first search result without opening a selector")
    .addOption(searchSortOption())
    .addOption(searchOrderOption())
    .addOption(searchLimitOption());
}

function colorOption(): Option {
  return new Option("--color <mode>", "color output: auto, always, never").choices([...COLOR_MODES]);
}

function themeOption(): Option {
  return new Option("--theme <name>", "terminal theme").choices([...THEME_NAMES]);
}

function maxCacheHoursOption(): Option {
  return new Option("--max-cache-hours <hours>", "override cache freshness in hours").argParser(parseMaxCacheHours);
}

function contributorFetchLimitOption(): Option {
  return new Option("--contributor-fetch-limit <count>", "override how many contributors are fetched for concentration metrics").argParser(
    parsePositiveInteger,
  );
}

function starredSortOption(): Option {
  return new Option("--sort <field>", "starred repository sort: created, updated")
    .choices(["created", "updated"])
    .default("created");
}

function starredDirectionOption(): Option {
  return new Option("--direction <direction>", "starred repository direction: asc, desc")
    .choices(["asc", "desc"])
    .default("desc");
}

function searchSortOption(): Option {
  return new Option("--sort <field>", "repository search sort: best-match, stars, forks, help-wanted-issues, updated")
    .choices(["best-match", "stars", "forks", "help-wanted-issues", "updated"])
    .default("best-match");
}

function searchOrderOption(): Option {
  return new Option("--order <order>", "repository search order: asc, desc")
    .choices(["asc", "desc"])
    .default("desc");
}

function searchLimitOption(): Option {
  return new Option("--limit <count>", "maximum repository search results to fetch")
    .argParser(parsePageLimit)
    .default(20);
}

function forksLimitOption(): Option {
  return new Option("--limit <count>", "forks to show, up to one API page")
    .argParser(parsePageLimit)
    .default(10);
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

function parsePageLimit(value: string): number {
  const count = parsePositiveInteger(value);

  if (count > 100) {
    throw new InvalidArgumentError("Expected an integer between 1 and 100.");
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
  // Star state is resolved against the snapshot's own ref so it tracks the repository the API
  // actually returned, and stays outside the snapshot cache entry.
  const viewerStar = result.ok
    ? await resolveViewerStar(client, result.snapshot.ref, {
        cacheEnabled: runtime.value.cache.cacheEnabled,
        freshnessHours: runtime.value.starredFreshnessHours,
        mode: runtime.value.cache.mode,
        now,
      })
    : undefined;

  await recordHistory("repo", [repo], [snapshot], now);

  if (runtime.value.json) {
    console.log(renderRepoJson(result, snapshot.source, { explainScores: runtime.value.explain, viewerStar }));
  } else if (result.ok) {
    console.log(
      renderRepo(
        result.snapshot,
        { ...runtime.value.renderOptions, explainScores: runtime.value.explain, viewerStar },
        snapshot.source,
      ),
    );
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

async function runStarred(options: StarredCommandOptions, selector: StarredRepositorySelector): Promise<void> {
  const runtime = await loadRuntimeOptions(options);

  if (!runtime.ok) {
    console.error(`gitpulse: ${runtime.message}`);
    process.exitCode = 1;
    return;
  }

  const client = new GitHubClient();
  const now = new Date();
  const starred = await resolveStarredRepositories(client, {
    ...runtime.value.cache,
    sort: options.sort ?? "created",
    direction: options.direction ?? "desc",
    now,
  });
  const result = starred.result;

  if (!result.ok) {
    if (runtime.value.json) {
      console.log(renderStarredRepositoriesJson(result, starred.source));
    } else {
      console.error(`gitpulse: ${result.error.message}`);
    }

    process.exitCode = 1;
    return;
  }

  if (options.list) {
    if (runtime.value.json) {
      console.log(renderStarredRepositoriesJson(result, starred.source));
    } else {
      const repositoryNames = result.list.repositories.map((repository) => repository.fullName);

      if (repositoryNames.length > 0) {
        console.log(repositoryNames.join("\n"));
      }
    }

    return;
  }

  if (result.list.repositories.length === 0) {
    console.error("gitpulse: No starred repositories found.");
    process.exitCode = 1;
    return;
  }

  let selected;

  try {
    selected = await selector(result.list.repositories);
  } catch (error) {
    console.error(`gitpulse: ${errorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  if (!selected) {
    process.exitCode = 130;
    return;
  }

  await runRepo(selected, options);
}

/**
 * The only command that writes to GitHub. It probes first so the report distinguishes a real change
 * from a no-op, then hands the outcome to the local star caches, which the probe alone cannot fix.
 */
async function runStarMutation(
  action: StarAction,
  repo: string | undefined,
  options: StarCommandOptions,
): Promise<void> {
  const json = Boolean(options.json);
  const fail = (message: string, code = "star_error"): void => {
    if (json) {
      console.log(renderStarMutationJson(action, { ok: false, error: { message, code } }));
    } else {
      console.error(`gitpulse: ${message}`);
    }

    process.exitCode = 1;
  };

  let cacheEnabled: boolean;

  try {
    cacheEnabled = (await loadConfig()).cache.enabled;
  } catch (error) {
    fail(error instanceof ConfigError ? error.message : errorMessage(error), "config_error");
    return;
  }

  const target = await resolveCommandTarget(action, repo, json);

  if (!target.ok) {
    fail(target.message, target.code);
    return;
  }

  const client = new GitHubClient();

  if (!client.authenticated) {
    fail(`gitpulse ${action} needs a GitHub token. Set GITHUB_TOKEN.`, "unauthenticated");
    return;
  }

  const desired = action === "star";
  const now = new Date();

  try {
    const ref = parseRepoRef(target.fullName);
    const changed = (await client.isRepositoryStarredByAuthenticatedUser(ref)) !== desired;

    if (changed) {
      if (desired) {
        await client.starRepositoryForAuthenticatedUser(ref);
      } else {
        await client.unstarRepositoryForAuthenticatedUser(ref);
      }
    }

    await recordViewerStarMutation(ref, desired, { cacheEnabled, changed, now });

    const mutation: StarMutation = {
      action,
      repository: target.fullName,
      starred: desired,
      changed,
      mutatedAt: now.toISOString(),
    };

    if (json) {
      console.log(renderStarMutationJson(action, { ok: true, mutation }));
    } else {
      console.log(formatStarMutation(mutation));
    }
  } catch (error) {
    fail(errorMessage(error), error instanceof GitHubApiError ? error.code : "unknown");
  }
}

function formatStarMutation(mutation: StarMutation): string {
  if (!mutation.changed) {
    return mutation.starred
      ? `${mutation.repository} was already starred`
      : `${mutation.repository} was not starred`;
  }

  return mutation.starred ? `Starred ${mutation.repository}` : `Unstarred ${mutation.repository}`;
}

async function resolveCommandTarget(
  command: string,
  repo: string | undefined,
  json: boolean,
): Promise<{ ok: true; fullName: string } | { ok: false; message: string; code: string }> {
  if (repo) {
    const resolved = await resolveRepositoryInputs([repo]);

    return resolved.ok
      ? { ok: true, fullName: resolved.values[0] }
      : { ok: false, message: resolved.message, code: "unknown_repository" };
  }

  const inferred = await inferRepositoryFromGitRemotes();

  if (inferred.kind === "outside-checkout") {
    return { ok: false, message: `gitpulse ${command} needs owner/name outside a Git checkout.`, code: "no_target" };
  }

  if (inferred.kind !== "inferred") {
    return { ok: false, message: formatInferenceFailure(inferred), code: "no_target" };
  }

  if (!json) {
    console.error(`gitpulse: inferred ${inferred.fullName} from git remote "${inferred.remote}".`);
  }

  return { ok: true, fullName: inferred.fullName };
}

async function runForks(repo: string | undefined, options: ForksCommandOptions): Promise<void> {
  const json = Boolean(options.json);
  const renderOptions = await loadRenderOptions(options);

  if (!renderOptions.ok) {
    console.error(`gitpulse: ${renderOptions.message}`);
    process.exitCode = 1;
    return;
  }

  const target = await resolveCommandTarget("forks", repo, json);

  if (!target.ok) {
    console.error(`gitpulse: ${target.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await collectMostStarredForks(new GitHubClient(), parseRepoRef(target.fullName), {
    limit: options.limit ?? 10,
  });

  if (!result.ok) {
    if (json) {
      console.log(renderForksJson(result));
    } else {
      console.error(`gitpulse: ${result.error.message}`);
    }

    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(renderForksJson(result));
    return;
  }

  console.log(renderForks(result.list, renderOptions.value));
}

async function runSearch(
  queryParts: string[],
  options: SearchCommandOptions,
  selector: SearchRepositorySelector,
): Promise<void> {
  if (options.list && options.lucky) {
    console.error("gitpulse: --list and --lucky cannot be used together.");
    process.exitCode = 1;
    return;
  }

  const query = queryParts.join(" ").trim();

  if (!query) {
    console.error("gitpulse: search requires a non-empty query.");
    process.exitCode = 1;
    return;
  }

  const runtime = await loadRuntimeOptions(options);

  if (!runtime.ok) {
    console.error(`gitpulse: ${runtime.message}`);
    process.exitCode = 1;
    return;
  }

  const searchOptions = {
    query,
    sort: options.sort ?? "best-match",
    order: options.order ?? "desc",
    limit: options.limit ?? 20,
  } satisfies {
    query: string;
    sort: SearchRepositorySort;
    order: SearchRepositoryOrder;
    limit: number;
  };
  const client = new GitHubClient();
  const now = new Date();
  const search = await resolveSearchRepositories(client, {
    ...runtime.value.cache,
    ...searchOptions,
    now,
  });
  const result = search.result;

  if (!result.ok) {
    if (runtime.value.json) {
      console.log(renderSearchRepositoriesJson(result, search.source));
    } else {
      console.error(`gitpulse: ${result.error.message}`);
    }

    process.exitCode = 1;
    return;
  }

  if (options.list) {
    if (runtime.value.json) {
      console.log(renderSearchRepositoriesJson(result, search.source));
    } else {
      const repositoryNames = result.list.repositories.map((repository) => repository.fullName);

      if (repositoryNames.length > 0) {
        console.log(repositoryNames.join("\n"));
      }
    }

    return;
  }

  if (result.list.repositories.length === 0) {
    console.error(`gitpulse: No repositories found for "${query}".`);
    process.exitCode = 1;
    return;
  }

  let selected;

  if (options.lucky) {
    selected = result.list.repositories[0].fullName;
  } else {
    try {
      selected = await selector(result.list.repositories);
    } catch (error) {
      console.error(`gitpulse: ${errorMessage(error)}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!selected) {
    process.exitCode = 130;
    return;
  }

  await runRepo(selected, options);
}

async function runHistory(json: boolean, options: CommandOptions): Promise<void> {
  try {
    const events = await readHistoryEvents();
    const renderOptions = await loadRenderOptions(options);

    if (!renderOptions.ok) {
      console.error(`gitpulse: ${renderOptions.message}`);
      process.exitCode = 1;
      return;
    }

    if (json) {
      console.log(JSON.stringify({ schemaVersion: 5, command: "history", events }, null, 2));
    } else {
      console.log(renderHistory(events, renderOptions.value));
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
  starredFreshnessHours: number;
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

type RenderOptionsResult =
  | {
      ok: true;
      value: RenderOptions;
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
    const renderOptions = resolveRenderOptions(config, options);

    return {
      ok: true,
      value: {
        cache: {
          cacheEnabled: config.cache.enabled,
          maxCacheHours: options.maxCacheHours ?? config.cache.maxCacheHours,
          staleIfError: config.cache.staleIfError,
          mode,
        },
        starredFreshnessHours: config.cache.starredFreshnessHours,
        contributorFetchLimit: options.contributorFetchLimit ?? config.contributors.fetchLimit,
        explain: Boolean(options.explain),
        json: Boolean(options.json),
        renderOptions,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ConfigError ? error.message : errorMessage(error),
    };
  }
}

async function loadRenderOptions(options: CommandOptions): Promise<RenderOptionsResult> {
  try {
    return {
      ok: true,
      value: resolveRenderOptions(await loadConfig(), options),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ConfigError ? error.message : errorMessage(error),
    };
  }
}

function resolveRenderOptions(config: Awaited<ReturnType<typeof loadConfig>>, options: CommandOptions): RenderOptions {
  return {
    color: shouldUseColor(options.color ?? config.output.color),
    theme: options.theme ?? config.output.theme,
  };
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

# Phase 1 Spec

## Goal

Migrate Gitpulse from a Bash prototype to a TypeScript CLI that can fetch richer GitHub repository data, display a useful single-repository report, and compare multiple repositories side by side.

Phase 1 should establish the architecture and command shape for future work while staying deterministic. No AI or natural-language content analysis should be included in this phase.

## Current Starting Point

The current `gitpulse` Bash script accepts one `owner/repo` argument, calls:

```text
https://api.github.com/repos/:owner/:repo
```

It displays:

- Creation date.
- Stars.
- Primary language.
- Forks.
- Open issues.

This validates the core idea but should be replaced by a maintainable TypeScript implementation.

## Command Scope

### Single Repository

```bash
gitpulse repo owner/repo
```

The CLI may also accept the current shorthand during migration:

```bash
gitpulse owner/repo
```

Expected behavior:

- Use fresh cached repository data by default when available.
- Fetch repository metadata from GitHub when cached data is missing, stale, or explicitly refreshed.
- Fetch selected supporting endpoints where useful.
- Render a readable terminal report.
- Exit non-zero for invalid input, missing repository, rate-limit failure, or network failure when no usable cached snapshot can be shown.
- Show actionable error messages.

### Comparison

```bash
gitpulse compare owner/a owner/b [owner/c...]
```

Expected behavior:

- Accept at least two repositories.
- Use the same cache policy for each compared repository.
- Fetch the same core metrics for each repository when cached data is missing, stale, or explicitly refreshed.
- Render a compact scoreboard plus side-by-side details.
- In human-readable comparison labels, use the repository name alone unless multiple compared repositories share that name, in which case show `owner/repo` for those labels.
- Highlight missing data and warning states such as archived repositories.

The comparison view should group metrics by practical lens where possible:

- Adoption.
- Activity.
- Maintenance.
- Documentation.
- Repository facts.

### JSON Output

```bash
gitpulse repo owner/repo --json
gitpulse compare owner/a owner/b --json
```

Expected behavior:

- Emit structured JSON without terminal colors.
- Include a `schemaVersion` and `command` envelope.
- Include source metadata showing whether data came from the API, fresh cache, or stale cache.
- Include raw key fields and computed metrics.
- Include fetch errors per repository for comparison commands when partial data is available.

### Terminal Color

```bash
gitpulse repo owner/repo --color auto
gitpulse compare owner/a owner/b --color never
gitpulse repo owner/repo --color always
```

Expected behavior:

- Default to `--color auto`.
- Use terminal color only for human-readable output.
- Never emit terminal color in JSON output.
- Honor `NO_COLOR` and `FORCE_COLOR` in automatic color mode.
- Use color semantically for state, score bands, activity recency, documentation presence, warnings, fetch errors, and common programming languages.

### Cache, Config, and History

Gitpulse should be cache-first by default because the tool favors long-term project-health signals over minute-level freshness.

Default behavior:

- Read config from `${XDG_CONFIG_HOME:-~/.config}/gitpulse/config.json`.
- Use a cached snapshot when it exists and is no older than `cache.maxCacheHours`.
- Default `cache.maxCacheHours` to `168`, expressed in hours.
- Refresh from the GitHub API when the cache is missing or stale.
- Write successful refreshes to `${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/github/`.
- Append consulted repositories to `${XDG_STATE_HOME:-~/.local/state}/gitpulse/history.jsonl`.
- Show data source and cache age in human-readable output.

Default config:

```json
{
  "cache": {
    "enabled": true,
    "maxCacheHours": 168,
    "staleIfError": true
  },
  "contributors": {
    "fetchLimit": 100
  }
}
```

Cache control flags:

```bash
gitpulse repo owner/repo --refresh
gitpulse repo owner/repo --offline
gitpulse repo owner/repo --max-cache-hours 24
gitpulse repo owner/repo --contributor-fetch-limit 250
gitpulse compare owner/a owner/b --max-cache-hours 24
```

Local file commands:

```bash
gitpulse history
gitpulse cache clear
gitpulse history clear
gitpulse config path
gitpulse config reset
```

Expected behavior:

- `--refresh` bypasses cache reads, fetches from GitHub, and updates the cache.
- `--offline` never calls the API and uses cache even when stale.
- `--max-cache-hours <hours>` overrides the configured freshness window for one invocation.
- `--contributor-fetch-limit <count>` overrides the configured contributor fetch limit for one invocation.
- Fresh cache entries collected with a different contributor fetch limit should refresh unless `--offline` is used.
- `--refresh` and `--offline` are mutually exclusive.
- If stale cache exists and refresh fails while `cache.staleIfError` is true, render the stale cache with a visible refresh warning.
- If no cache exists and refresh fails, keep the normal non-zero failure behavior.
- `gitpulse history` shows recently consulted repositories.
- `gitpulse cache clear` removes only the Gitpulse cache directory.
- `gitpulse history clear` removes only the consultation history file.
- `gitpulse config path` prints the resolved config file path.
- `gitpulse config reset` creates or overwrites the config file with the default config.

## GitHub Data Sources

Phase 1 should start with the GitHub REST API.

Core endpoint:

```text
GET /repos/{owner}/{repo}
```

Useful supporting endpoints:

```text
GET /repos/{owner}/{repo}/languages
GET /repos/{owner}/{repo}/contributors
GET /repos/{owner}/{repo}/releases
GET /repos/{owner}/{repo}/commits
GET /repos/{owner}/{repo}/contents/README.md
GET /repos/{owner}/{repo}/contents/CHANGELOG.md
GET /repos/{owner}/{repo}/contents/CONTRIBUTING.md
GET /repos/{owner}/{repo}/contents/CODE_OF_CONDUCT.md
GET /repos/{owner}/{repo}/contents/SECURITY.md
```

Implementation should account for common filename variants later. The first pass may use a small case-sensitive candidate list per file type.

The languages endpoint reports byte counts by language, not lines of code. Phase 1 may use it for language distribution, but it should not present that data as LOC. See [Future LOC Analysis](FUTURE_LOC_ANALYSIS.md) for the deferred source-inspection version.

## Authentication

Unauthenticated requests should work for basic public repository checks.

If `GITHUB_TOKEN` is present, Gitpulse should use it:

```text
Authorization: Bearer $GITHUB_TOKEN
```

The CLI should expose rate-limit errors clearly and should avoid excessive endpoint calls.

## Phase 1 Metrics

### Direct Metrics

Collect and display:

- Repository full name.
- Description.
- URL.
- Created date.
- Last pushed date.
- Last updated date.
- Default branch.
- Primary language.
- Language distribution.
- License identifier.
- Stars.
- Forks.
- Watchers, sourced from GitHub REST `subscribers_count`.
- Open issues.
- Repository topics.
- Archived status.
- Fork status.
- Repository size.

### Activity Metrics

Compute:

- Repository age in days.
- Days since last push.
- Days since latest release, when a release exists.
- Days since latest commit on the default branch, when available.
- Release count from the fetched release page.
- Total commits reachable from the default branch, inferred from GitHub REST pagination when available.

### Documentation Presence

Detect:

- README.
- Changelog.
- Contributing guide.
- Code of conduct.
- Security policy.

Use presence detection only. Do not summarize contents in phase 1.

### Contributor Metrics

Collect:

- Contributor count from the fetched contributor page.
- Total contributor count inferred from GitHub REST pagination with `anon=true` when available.
- Top contributor contribution count.
- Top contributor share of fetched contributions.
- Configurable contributor fetch limit, defaulting to 100 and overridable by config or flag.

Document that GitHub contributor endpoints are paginated and cached by GitHub. Total contributor counts should include anonymous contributor identities via `anon=true` and should be treated as GitHub API-reported counts rather than perfect counts of unique humans.

## Composite Metrics

Phase 1 may include small explainable derived metrics if they are useful.

Suggested examples:

- Activity freshness: based on recent push, latest release, and default-branch commit dates.
- Community footprint: based on stars, forks, watchers, and contributor count.
- Maintenance visibility: based on release presence and documentation file presence.

If implemented, each composite metric must expose its inputs. Avoid a single final "winner" score in phase 1.

## Data Model

The implementation should separate raw API data from normalized report data.

Suggested internal types:

```ts
type RepoRef = {
  owner: string;
  name: string;
};

type RepoSnapshot = {
  ref: RepoRef;
  fetchedAt: string;
  repository: RepositoryFacts;
  activity: ActivityMetrics;
  documentation: DocumentationSignals;
  contributors: ContributorSignals;
  warnings: string[];
};
```

Raw GitHub responses should be mapped into these internal types before rendering.

## Architecture

Suggested module layout:

```text
src/
  cli.ts
  github/
    client.ts
    types.ts
  cache/
    history.ts
    paths.ts
    policy.ts
    resolve.ts
    store.ts
  config.ts
  metrics/
    snapshot.ts
    compare.ts
  render/
    table.ts
    json.ts
  util/
    dates.ts
    format.ts
```

Responsibilities:

- `cli.ts`: argument parsing and command dispatch.
- `config.ts`: config loading and validation.
- `cache/*`: XDG paths, snapshot cache storage, freshness policy, cache/API resolution, and consultation history.
- `github/client.ts`: HTTP calls, headers, error handling, pagination helpers.
- `metrics/snapshot.ts`: convert API responses into `RepoSnapshot`.
- `metrics/compare.ts`: align snapshots for side-by-side comparison.
- `render/table.ts`: terminal output.
- `render/json.ts`: machine-readable output.
- `util/dates.ts`: age and freshness calculations.
- `util/format.ts`: number and text formatting.

## Suggested Dependencies

Keep dependencies modest.

Candidates:

- TypeScript for implementation.
- `tsx` for local development.
- `commander` or `yargs` for CLI parsing.
- `undici` or built-in `fetch` depending on the supported Node.js version.
- A small table-rendering library, or a local renderer if that remains simple.
- A test runner such as `vitest`.

The project should choose a current supported Node.js LTS baseline.

## Error Handling

Handle:

- Invalid repo references.
- GitHub 404 responses.
- GitHub rate limits.
- Network failures.
- Cache read failures.
- Missing optional endpoints.
- Archived repositories.
- Empty release lists.
- Empty contributor lists.

Comparison commands should try to return partial results when one repository fails, while making the failure visible.

## Acceptance Criteria

Phase 1 is complete when:

- The CLI is implemented in TypeScript.
- `gitpulse repo owner/repo` returns a richer repository report than the Bash prototype.
- `gitpulse compare owner/a owner/b` renders a side-by-side comparison.
- `--json` works for both commands.
- Repository and comparison commands are cache-first by default with a one-week freshness window.
- `--refresh`, `--offline`, and `--max-cache-hours` work for repository and comparison commands.
- Output shows data source and cache age when cache metadata is available.
- `gitpulse history` shows recently consulted repositories.
- The GitHub token path is supported through `GITHUB_TOKEN`.
- Errors are clear and exit codes are meaningful.
- Basic tests cover repo reference parsing, date/number formatting, metric normalization, and comparison alignment.
- The README documents install, usage, authentication, and examples.

## Deferred To Later Phases

- AI summaries of README, changelog, issues, or releases.
- Package registry integrations.
- Historical star growth unless an API or data source is selected.
- TUI mode.
- Configurable scoring profiles.
- Non-GitHub forge support.
- Deep pagination across every endpoint.
- Actual line-of-code analysis. See [Future LOC Analysis](FUTURE_LOC_ANALYSIS.md).

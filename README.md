# gitpulse

Gitpulse is a terminal CLI for taking the pulse of development projects. The first implementation focuses on GitHub repositories: it fetches deterministic repository datapoints and presents them as a compact report for developers evaluating whether to contribute to, depend on, compare, or install a project.

Gitpulse is not a replacement for `gh`. It is a project-health lens: facts first, cautious summaries second, final judgment left to the user.

## Requirements

- Node.js 20 or newer for the published npm CLI.
- Bun 1.3 or newer for development.
- Network access to the GitHub API when cached data is missing or stale.
- Optional: `GITHUB_TOKEN` for higher GitHub API rate limits.

## Install

After the package is published:

```bash
npm install -g gitpulse
```

For local development:

```bash
bun install
```

Run from the working tree:

```bash
./gitpulse owner/repo
./gitpulse owner/a owner/b
```

Or through Bun:

```bash
bun run dev -- owner/repo
```

## Commands

Single repository report:

```bash
gitpulse cli/cli
```

After a repository has appeared in local cache or history, exact bare shorthand
is available when it is unambiguous:

```bash
gitpulse cli
gitpulse docs cli
gitpulse web cli
gitpulse cli gum
```

Bare shorthand is local-only and exact. Gitpulse does not search GitHub for
unknown shorthand, and prefix matching is reserved for shell completion.
Reserved command words such as `docs`, `web`, `history`, `cache`, `config`,
`completions`, and `user` are always treated as commands, not repository
shorthand.

Compare repositories side by side:

```bash
gitpulse Jguer/yay Morganamilo/paru
gitpulse OJ/gobuster ffuf/ffuf
```

Show documentation signals:

```bash
gitpulse docs cli/cli
```

Show GitHub user profile signals:

```bash
gitpulse user octocat
```

Open GitHub pages in the browser:

```bash
gitpulse web cli/cli
gitpulse user web octocat
```

Emit JSON:

```bash
gitpulse cli/cli --json
gitpulse cli/cli charmbracelet/gum --json
gitpulse docs cli/cli --json
gitpulse user octocat --json
```

Refresh and cache controls:

```bash
gitpulse cli/cli --refresh
gitpulse cli/cli --offline
gitpulse docs cli/cli --refresh
gitpulse user octocat --refresh
gitpulse user octocat --offline
gitpulse cli/cli charmbracelet/gum --max-cache-hours 24
```

Manage local files:

```bash
gitpulse history
gitpulse cache clear
gitpulse history clear
gitpulse config path
gitpulse config reset
```

Generate Bash completions:

```bash
gitpulse completions bash
```

Control terminal color:

```bash
gitpulse cli/cli --color auto
gitpulse cli/cli --color always
gitpulse cli/cli --color never
gitpulse cli/cli --theme tokyo-night
gitpulse cli/cli --theme nord
```

## Output

Human-readable output is the default. Repository reports start with a `Repo` section that identifies the repository as `owner/repo` followed by the repository URL on its own muted line, then show explainable composite signals and grouped metric sections. Activity freshness is shown as a score bar; Popularity Score is shown as an open-ended logarithmic score with PU in parentheses. PU means Popularity Units: `stars + 8*forks + 5*watchers`. Documentation presence is shown through `gitpulse docs`, not the default repository report. User profile reports show public profile facts and a repository-footprint summary. Comparison reports start with repository descriptions and a scoreboard. Comparison labels use repository names unless owner prefixes are needed to disambiguate matching names.

Gitpulse uses semantic terminal color for repository state, score bands, activity freshness, documentation presence in docs reports, provenance warnings, fetch errors, and common programming languages. Color defaults to `--color auto`, which enables color for TTY output, disables it for non-TTY output, honors `NO_COLOR`, and honors `FORCE_COLOR`. Use `--color always` to force color or `--color never` to disable it. Use `--theme` to choose a terminal palette; supported themes are documented in [Terminal Themes](docs/THEMES.md).

Repository, docs, user, and comparison reports end with a `Data Provenance` footer. It discloses fetched/source information first, then any warnings as `[warning]` lines. Sources show whether each snapshot came from the GitHub API, a fresh cache entry, or stale cache after a failed refresh.

Use `--json` for scripts and integrations. JSON output is not colorized and includes a stable envelope:

```json
{
  "schemaVersion": 5,
  "command": "repo",
  "source": {
    "kind": "cache",
    "cachedAt": "2026-05-16T12:00:00.000Z",
    "ageHours": 4
  },
  "result": {
    "ok": true
  }
}
```

## Cache and Config

Gitpulse is cache-first by default. It uses a cached snapshot when one exists and is newer than the configured freshness window. If the cache is missing or stale, Gitpulse refreshes from the GitHub API and stores the new snapshot.

`gitpulse docs` reads from the same repository snapshot cache as `gitpulse`.
`gitpulse docs <repo> --refresh` refreshes the full repository snapshot, then
renders only documentation signals.

`gitpulse user` uses a separate GitHub user profile snapshot cache.

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

The config file is read from:

```text
${XDG_CONFIG_HOME:-~/.config}/gitpulse/config.json
```

Snapshots are stored under:

```text
${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/github/
${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/github-users/
```

Consultation history is appended to:

```text
${XDG_STATE_HOME:-~/.local/state}/gitpulse/history.jsonl
```

Local repository completion and exact shorthand are derived from the snapshot
cache and consultation history. Clearing both local stores removes all shorthand
and completion candidates.

Useful overrides:

- `--refresh`: bypass cache reads, fetch from GitHub, and update the cache.
- `--offline`: use local cache only, even if stale; fail when no cache entry exists.
- `--max-cache-hours <hours>`: override `cache.maxCacheHours` for one invocation.
- `--contributor-fetch-limit <count>`: override `contributors.fetchLimit` for one repository/report invocation.

A cached snapshot is reused only when it was collected with the same contributor fetch limit, unless `--offline` is used.

Local file commands:

- `gitpulse cache clear`: remove local cached snapshots.
- `gitpulse history clear`: remove the consultation history file.
- `gitpulse config path`: print the config file path.
- `gitpulse config reset`: create or overwrite the config file with default values.

## Shell Completions

Gitpulse can print a Bash completion script:

```bash
gitpulse completions bash
```

Load it for the current shell:

```bash
eval "$(gitpulse completions bash)"
```

The Bash completion completes top-level and nested Gitpulse commands, shared
flags, `--color` values, repository candidates from local cache/history, and
`--theme` values, repository candidates from local cache/history, and user
profile logins from local user profile cache/history. It includes browser
open commands and does not call GitHub while completing.

## Authentication

You do not need a GitHub token for occasional checks against public repositories:

```bash
gitpulse cli/cli
gitpulse Jguer/yay Morganamilo/paru
```

Gitpulse uses GitHub's unauthenticated public API for refreshes in that case. The tradeoff is that unauthenticated requests have much lower rate limits, and Gitpulse calls several endpoints per repository. For regular use, comparisons, or repeated refreshes, set `GITHUB_TOKEN`:

```bash
export GITHUB_TOKEN=ghp_...
```

Private repositories require a token with access to those repositories. Gitpulse sends the token through Octokit and does not require passing it as a command-line argument.

## Metrics

Phase 1 collects deterministic GitHub API data:

- Repository facts: description, URL, created date, updated date, default branch, primary language, language mix, license, topics, archive/fork/template state, size.
- Adoption signals: stars, forks, watchers, open issues, open pull requests.
- Activity signals: latest push, latest default-branch commit, total default-branch commits, latest release, release count.
- Documentation signals for `gitpulse docs`: README, changelog, contributing guide, code of conduct, security policy.
- Contributor signals: total contributor count, fetched contributor rows for concentration metrics, top contributor, top contributor share.
- User profile signals for `gitpulse user`: public profile facts, account age, follower/following counts, public repo and gist counts, public repository footprint, top repositories, recently pushed repositories, primary languages across fetched public repositories.
- Explainable composite signals: activity freshness, Popularity Score.

Watcher counts are sourced from GitHub REST `subscribers_count`, because GitHub's legacy `watchers_count` mirrors `stargazers_count`.

Popularity Score is an open-ended logarithmic score over weighted adoption signals. PU means Popularity Units: `stars + 8*forks + 5*watchers`. The PU total is shown in parentheses in human-readable output.

Total contributor and total commit counts are inferred from GitHub REST pagination. Contributor collection uses GitHub's `anon=true` contributor mode so anonymous author identities are included. Contributor concentration metrics use the first `contributors.fetchLimit` rows returned by GitHub's contributor endpoint, sorted by contribution count.

Composite signals are evidence grouping helpers, not verdicts. The current
formula details are documented in `docs/COMPOSITE_METRICS.md`.

## Development

```bash
bun test
bun run typecheck
bun run build
```

The npm CLI entrypoint is built from `src/bin.ts` to `dist/cli.js`. `package.json` maps the `gitpulse` binary to that built Node-compatible file.

Build a standalone executable:

```bash
bun run build:bin
install -Dm755 ./dist/gitpulse "$HOME/.local/bin/gitpulse"
```

## Project Docs

- `AGENTS.md`: contributor and agent operating guidance.
- `docs/PROJECT_SPEC.md`: current product scope, users, signals, and non-goals.
- `docs/DOCS_COMMAND.md`: current `gitpulse docs` behavior.
- `docs/COMPOSITE_METRICS.md`: current composite metric formulas and caveats.
- `docs/COMPLETIONS.md`: shell completion and local shorthand behavior.
- `docs/STARRED.md`: authenticated starred-repository picker behavior.
- `docs/THEMES.md`: supported terminal themes and output config.
- `docs/VISUAL_OUTPUT.md`: deterministic visual review workflow.
- `docs/next-features/`: deferred feature proposals and exploratory notes.

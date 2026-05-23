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
./gitpulse repo owner/repo
./gitpulse compare owner/a owner/b
```

Or through Bun:

```bash
bun run dev -- repo owner/repo
```

## Commands

Single repository report:

```bash
gitpulse repo cli/cli
```

The shorthand form is also supported:

```bash
gitpulse cli/cli
```

Compare repositories side by side:

```bash
gitpulse compare Jguer/yay Morganamilo/paru
gitpulse compare OJ/gobuster ffuf/ffuf
```

Emit JSON:

```bash
gitpulse repo cli/cli --json
gitpulse compare cli/cli charmbracelet/gum --json
```

Refresh and cache controls:

```bash
gitpulse repo cli/cli --refresh
gitpulse repo cli/cli --offline
gitpulse compare cli/cli charmbracelet/gum --max-cache-hours 24
```

Manage local files:

```bash
gitpulse history
gitpulse cache clear
gitpulse history clear
gitpulse config path
gitpulse config reset
```

Control terminal color:

```bash
gitpulse repo cli/cli --color auto
gitpulse repo cli/cli --color always
gitpulse repo cli/cli --color never
```

## Output

Human-readable output is the default. Repository reports use a compact status strip, score bars for explainable composite signals, and grouped metric sections. Comparison reports start with a scoreboard, then show side-by-side grouped details. Comparison labels use repository names unless owner prefixes are needed to disambiguate matching names.

Gitpulse uses semantic terminal color for repository state, score bands, activity freshness, documentation presence, warnings, fetch errors, and common programming languages. Color defaults to `--color auto`, which enables color for TTY output, disables it for non-TTY output, honors `NO_COLOR`, and honors `FORCE_COLOR`. Use `--color always` to force color or `--color never` to disable it.

Repository and comparison reports disclose whether each snapshot came from the GitHub API, a fresh cache entry, or stale cache after a failed refresh.

Use `--json` for scripts and integrations. JSON output is not colorized and includes a stable envelope:

```json
{
  "schemaVersion": 2,
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
```

Consultation history is appended to:

```text
${XDG_STATE_HOME:-~/.local/state}/gitpulse/history.jsonl
```

Useful overrides:

- `--refresh`: bypass cache reads, fetch from GitHub, and update the cache.
- `--offline`: use local cache only, even if stale; fail when no cache entry exists.
- `--max-cache-hours <hours>`: override `cache.maxCacheHours` for one invocation.
- `--contributor-fetch-limit <count>`: override `contributors.fetchLimit` for one invocation.

A cached snapshot is reused only when it was collected with the same contributor fetch limit, unless `--offline` is used.

Local file commands:

- `gitpulse cache clear`: remove local cached snapshots.
- `gitpulse history clear`: remove the consultation history file.
- `gitpulse config path`: print the config file path.
- `gitpulse config reset`: create or overwrite the config file with default values.

## Authentication

You do not need a GitHub token for occasional checks against public repositories:

```bash
gitpulse repo cli/cli
gitpulse compare Jguer/yay Morganamilo/paru
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
- Documentation presence: README, changelog, contributing guide, code of conduct, security policy.
- Contributor signals: total contributor count, fetched contributor rows for concentration metrics, top contributor, top contributor share.
- Explainable composite signals: activity freshness, community footprint, maintenance visibility.

Watcher counts are sourced from GitHub REST `subscribers_count`, because GitHub's legacy `watchers_count` mirrors `stargazers_count`.

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
- `docs/PROJECT_SPEC.md`: broader project direction.
- `docs/COMPOSITE_METRICS.md`: current composite metric formulas and caveats.
- `docs/FUTURE_LOC_ANALYSIS.md`: deferred source-inspection plan for line counts.

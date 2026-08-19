# gitpulse

[![weekly downloads](https://img.shields.io/npm/dw/%40shbernal%2Fgitpulse.svg?label=npm%20downloads&logo=npm)](https://www.npmjs.com/package/@shbernal/gitpulse)
[![total downloads](https://img.shields.io/npm/dt/%40shbernal%2Fgitpulse.svg?label=npm%20total%20downloads&logo=npm)](https://www.npmjs.com/package/@shbernal/gitpulse)

Take the pulse of a GitHub project from the terminal. Point Gitpulse at `owner/repo` and it prints one compact report: how recently the project moved, how widely it is used, how concentrated its contributors are, what it has released, and what looks wrong. Point it at two or more and it prints them side by side.

It is built for the moment before you commit to something. Is this dependency still maintained. Is this CLI abandoned or just finished. `yay` or `paru`, `gobuster` or `ffuf`. Gitpulse shows you the evidence and stops there. It will not tell you which one to install.

Gitpulse is not a replacement for `gh`. It does not manage issues, pull requests, or repository settings.

## Install

```bash
npm install -g @shbernal/gitpulse
gitpulse cli/cli
```

Node 20 or newer. No GitHub token needed for occasional checks on public repositories.

## Usage

One repository, or several to compare:

```bash
gitpulse cli/cli
gitpulse cli/cli --explain
gitpulse Jguer/yay Morganamilo/paru
gitpulse OJ/gobuster ffuf/ffuf
```

Documentation signals, kept out of the default report so it stays short:

```bash
gitpulse docs cli/cli
```

Find a repository when you only know roughly what you want:

```bash
gitpulse search ripgrep
gitpulse search terminal fuzzy finder
gitpulse search language:rust parser --sort stars
gitpulse search ripgrep --lucky     # inspect the first result directly
gitpulse search ripgrep --list      # print names instead of opening a selector
```

Pick from your own starred repositories, which needs a token:

```bash
gitpulse starred
gitpulse starred --list
```

Look at the account behind a project:

```bash
gitpulse user octocat
```

Open the GitHub page instead of reporting on it:

```bash
gitpulse web cli/cli
gitpulse user web octocat
```

### Shorthand

Once a repository has been through Gitpulse, its name alone is enough:

```bash
gitpulse cli
gitpulse docs cli
gitpulse cli gum
```

This shorthand is local and exact. It resolves from your own cache and history, never from a GitHub search, and an unknown name is an error asking for `owner/name` rather than a guess. Prefix matching belongs to shell completion. Command words (`docs`, `web`, `starred`, `search`, `user`, `history`, `cache`, `config`, `completions`) are always commands.

### Scripting

Every report has a `--json` form with a stable envelope:

```bash
gitpulse cli/cli --json
gitpulse cli/cli charmbracelet/gum --json
gitpulse docs cli/cli --json
gitpulse search ripgrep --list --json
gitpulse user octocat --json
```

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

JSON output is never colorized.

### Completions

```bash
eval "$(gitpulse completions bash)"
```

Bash completion covers commands, flags, `--color` and `--theme` values, and repository and user candidates from your local cache and history. It never calls GitHub while completing.

## Reading the output

A repository report opens with the repository and its URL, then composite signals, then grouped metric sections. `--explain` breaks down how each composite score was reached.

Activity freshness is drawn as a score bar. The latest release field reports the latest stable release, so drafts and prereleases never inflate it. Separately, the Activity section lists release paths found in a bounded sample of releases, so a project pushing nightly, beta, or release-candidate builds shows that movement with its own counts and recency. Drafts are excluded and disclosed rather than folded in, and a `Sampled` line appears when the sample is narrower than the full release history.

Popularity Score is an open-ended logarithmic score, with the raw total in parentheses as PU. PU means Popularity Units: `stars + 8*forks + 5*watchers`.

Every report ends with a `Data Provenance` footer telling you where each number came from, GitHub API, fresh cache, or stale cache after a failed refresh, followed by any `[warning]` lines. Nothing is quietly filled in.

Color follows `--color auto` by default: on for TTYs, off for pipes, and it honors `NO_COLOR` and `FORCE_COLOR`. Force it with `--color always` or `--color never`. Choose a palette with `--theme tokyo-night` or `--theme nord`, listed in [Terminal Themes](docs/THEMES.md).

## Authentication

Public repository checks work without a token. The catch is that unauthenticated requests share a low rate limit and Gitpulse calls several endpoints per repository, so comparisons and repeated refreshes run out quickly. For regular use, export a token:

```bash
export GITHUB_TOKEN=ghp_...
```

Private repositories need a token with access to them. `gitpulse starred` needs one too. The token is read from the environment, never passed as an argument.

## Cache and config

Gitpulse reads from cache first and refreshes from GitHub when the snapshot is missing or older than the freshness window.

```bash
gitpulse cli/cli --refresh                 # ignore cache, fetch, store
gitpulse cli/cli --offline                 # local cache only, even if stale
gitpulse cli/cli --max-cache-hours 24      # override the window for one run
gitpulse cli/cli --contributor-fetch-limit 200
```

Files live in the usual XDG locations:

```text
${XDG_CONFIG_HOME:-~/.config}/gitpulse/config.json
${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/
${XDG_STATE_HOME:-~/.local/state}/gitpulse/history.jsonl
```

Defaults:

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

Manage them with `gitpulse cache clear`, `gitpulse history`, `gitpulse history clear`, `gitpulse config path`, and `gitpulse config reset`. Clearing the cache and history also clears every shorthand and completion candidate, since both are derived from them.

## What Gitpulse measures

Repository facts, adoption counts, activity and release history, contributor counts and concentration, documentation presence through `gitpulse docs`, and public profile signals through `gitpulse user`. On top of those sit two explainable composites, activity freshness and Popularity Score.

Some numbers deserve a footnote. Watcher counts come from `subscribers_count`, because GitHub's legacy `watchers_count` just mirrors the star count. Total contributors and total commits are inferred from REST pagination. Contributor concentration uses the first `contributors.fetchLimit` rows GitHub returns, sorted by contribution count, with anonymous authors included.

Composites group evidence, they do not rank projects. Formulas and their caveats are in [Composite Metrics](docs/COMPOSITE_METRICS.md).

## Docs

- [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md): scope, users, signals, non-goals
- [docs/COMPOSITE_METRICS.md](docs/COMPOSITE_METRICS.md): composite formulas and caveats
- [docs/DOCS_COMMAND.md](docs/DOCS_COMMAND.md): `gitpulse docs` behavior
- [docs/SEARCH.md](docs/SEARCH.md): repository search
- [docs/STARRED.md](docs/STARRED.md): starred-repository picker
- [docs/COMPLETIONS.md](docs/COMPLETIONS.md): completions and local shorthand
- [docs/THEMES.md](docs/THEMES.md): terminal themes
- [CONTRIBUTING.md](CONTRIBUTING.md): development setup and conventions

## License

MIT. See [LICENSE](LICENSE).

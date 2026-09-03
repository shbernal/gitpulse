# Starred Repository Picker

## Status

`gitpulse starred` is an authenticated convenience command for selecting one
of the current user's starred GitHub repositories and running the normal
repository report for that selection.

It is deterministic after selection: the selected `owner/name` is handed to the
same repository snapshot path used by `gitpulse owner/name`.

## Command Shape

```bash
gitpulse starred
gitpulse starred --list
gitpulse starred --list --json
gitpulse starred --sort updated --direction desc
gitpulse starred --refresh
gitpulse starred --offline
```

Default behavior:

1. Fetch the authenticated user's starred repositories from GitHub.
2. Open a local selector.
3. Run the normal single-repository report for the selected repository.

`--list` skips the selector and prints one `owner/name` per line. With `--json`,
it emits the cached or fetched starred list as structured JSON.

## Authentication

The implementation uses Gitpulse's existing Octokit token model:

```bash
GITHUB_TOKEN=... gitpulse starred
```

No `gh auth` fallback is used.

## GitHub Data Source

The command uses GitHub REST:

```text
GET /user/starred
```

Supported options:

- `--sort created`, the default, orders by when the repository was starred.
- `--sort updated` orders by repository update time.
- `--direction desc`, the default, shows newest first.
- `--direction asc` reverses the order.

Gitpulse stores only the normalized repository list needed for selection and
script output. Full project-health metrics are still collected only for the
repository the user selects.

## Cache Behavior

Starred repository lists use the existing cache policy:

- `--refresh` bypasses the starred-list cache.
- `--offline` reads only the starred-list cache, then the selected repository
  report follows normal offline repository snapshot behavior.
- `--max-cache-hours` controls starred-list freshness.
- `gitpulse cache clear` removes starred-list and viewer star cache entries
  because they live under the normal Gitpulse cache root.

Cache entries are keyed by sort and direction so `created desc` and
`updated desc` can preserve their own ordering.

## Viewer Star State on the Repository Report

`gitpulse owner/name` shows a `Your star` row telling the caller whether they
starred the repository. It is a viewer-relative fact, so it is resolved beside
the snapshot rather than stored inside it, and it never inherits the snapshot
cache lifetime.

State lives in its own store, one entry per repository:

```text
${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/github-viewer-stars/self.json
```

Two writers fill it. A successful `gitpulse starred` list fetch replaces the
whole store with that list's positives and records `listSyncedAt`; any
repository missing from a synced list was not starred at that moment, so the
negative case is cached too. A single-repository probe,
`GET /user/starred/{owner}/{repo}`, writes one entry.

### Freshness Rule

The two cached answers do not carry equal risk, so they do not share a rule.

| Cached state | Fresh | Stale |
| --- | --- | --- |
| starred | trusted | trusted, rendered with its age |
| not starred | trusted | confirmed with one probe |
| absent | — | probe |

A cached "starred" stays true until the user unstars, which is rare. A cached
"not starred" is wrong the moment the user stars the repository, which is
exactly when they look, so it expires after `cache.starredFreshnessHours`
(default 24, separate from the 168-hour snapshot default).

The probe is one request and only fires on the ambiguous branch, so a starred
repository costs nothing after the first answer.

### Unknown Is a Real State

`Your star` is tri-state. An unauthenticated run has no viewer, so the row is
omitted rather than rendered as "not starred". `--offline` with nothing cached,
and a failed probe with nothing cached, render `unknown`. `--refresh` always
probes.

## Selector Behavior

Interactive selection is intentionally a local terminal concern:

- Prefer `fzf` when available.
- Fall back to `gum filter` when available.
- If neither selector exists, fail with a clear message and suggest
  `gitpulse starred --list`.

The selector receives only `owner/name` lines.

## Non-Goals

- Do not shell out to `gh api` for core data collection.
- Do not use `gh auth` as an implicit token source in the first implementation.
- Do not add starred repositories to local shorthand merely because they were
  listed. Only the selected repository should become known through the normal
  report cache/history path.
- Do not make stars a repository search feature. This command is for the
  authenticated user's own starred list.

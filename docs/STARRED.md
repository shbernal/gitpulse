# Stars

## Status

This document covers every star surface: the `gitpulse starred` picker, the
`Your star` row on the repository report, and the `gitpulse star` and
`gitpulse unstar` mutations.

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

## Star and Unstar

`gitpulse star` and `gitpulse unstar` are the only commands that write to GitHub.

```bash
gitpulse star owner/name
gitpulse star                # inside a Git checkout, inferred from local Git remotes
gitpulse unstar gp           # exact local shorthand
gitpulse star owner/name --json
```

Targets resolve exactly as they do for the report commands: `owner/name`, exact local shorthand,
or zero-argument inference from local Git remotes. Neither command searches GitHub for an unknown
word. Neither records history or adds a repository to local shorthand either: starring is not a
consultation, so it does not make a repository known.

### Contract

Each run probes `GET /user/starred/{owner}/{repo}` and then writes
`PUT` or `DELETE /user/starred/{owner}/{repo}` only when the current state differs. The probe costs
one request and makes both commands idempotent, so the output can separate a change from a no-op:

| Command | State on GitHub | Output |
| --- | --- | --- |
| `star` | not starred | `Starred owner/name` |
| `star` | starred | `owner/name was already starred` |
| `unstar` | starred | `Unstarred owner/name` |
| `unstar` | not starred | `owner/name was not starred` |

`--json` emits the same outcome as `{ "command": "star", "result": { "ok": true, "mutation": {
"action", "repository", "starred", "changed", "mutatedAt" } } }`, and carries failures as
`result.error` rather than printing them to stderr.

There are no cache flags. A mutation needs the network by definition, and `--offline` would have
nothing to do.

### Token Scope

Every other command works with a read-only token. Starring does not: it needs the classic
`public_repo` scope, or fine-grained `Starring` write access. GitHub reports the missing permission
as a bare 403 that never names the scope, so the mutation path reports it as `insufficient_scope`
and names it. A 404 here means the repository does not exist or the token cannot see it, which is
not the same message as "not starred".

### Cache Effects

A successful mutation writes the new state into the viewer star store with the current timestamp,
so the next `gitpulse owner/name` shows the change rather than a trusted stale positive.

A real change also drops every cached starred list. Starring changes the list under all sorts and
directions at once, and there is no honest way to patch one ordering, so the next `gitpulse starred`
refetches. A no-op leaves those lists alone because they are still correct.

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
- Do not grow the write surface past the caller's own star. Issues, pull requests, releases and
  repository settings stay with `gh`.

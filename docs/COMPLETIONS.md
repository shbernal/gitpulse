# Shell Completions and Local Repository Shorthand

## Status

This document describes the implemented shell completions and local repository
shorthand behavior.

The feature makes repeated use of cached or previously consulted repositories
faster while preserving Gitpulse's deterministic command behavior.

## Product Goals

- Complete repositories from local Gitpulse state without calling GitHub.
- Complete user profile logins from local Gitpulse state without calling
  GitHub.
- Let users type prefixes such as `deno<Tab>` and complete to known repositories
  such as `denoland/cli`.
- Let users run exact bare shorthand only when it is unambiguous.
- Keep command execution predictable and avoid turning shorthand into GitHub
  search.
- Keep completion behavior compatible with the existing cache and history
  commands.
- Keep user profile lookup explicit. `gitpulse user <login>` should not make
  user logins part of repository shorthand.
- Keep `gitpulse starred` explicit. The starred selector is an authenticated
  command, not a repository completion source.
- Keep `gitpulse search` explicit. Remote repository search is a runtime
  command, not a completion source and not a root shorthand fallback.

## Local State Sources

Known repositories are derived from existing local state:

- Snapshot cache:
  `${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/github/`
- Consultation history:
  `${XDG_STATE_HOME:-~/.local/state}/gitpulse/history.jsonl`

Known user profile logins are derived from:

- User profile snapshot cache:
  `${XDG_CACHE_HOME:-~/.cache}/gitpulse/snapshots/github-users/`
- Successful `gitpulse user <login>` history events in the same history file.

The implementation derives known repositories on demand from these files rather
than maintain a separate persistent index. This keeps behavior simple:

- `gitpulse cache clear` naturally removes cache-derived candidates.
- `gitpulse history clear` naturally removes history-derived candidates.
- If cache and history are cleared, completion has no repository or user
  candidates.

The implementation does not maintain a separate persistent index.

The user profile cache is not a source for repository shorthand or repository
completion. It is used only for `gitpulse user <login>` completion.

## Known Repository Model

Use a small normalized model at the cache/state boundary:

```ts
type KnownRepo = {
  fullName: string;
  owner: string;
  name: string;
  lastSeenAt?: string;
  cachedAt?: string;
  sources: Array<"history" | "cache">;
};
```

Implementation notes:

- Deduplicate case-insensitively by `owner/name`.
- Prefer canonical casing from cached snapshots when available.
- Merge cache and history metadata into one entry when both exist.
- Sort by recency first, then by `owner/name` for stable output.
- Ignore malformed cache entries or history events where possible; completion
  should be best-effort local state, not a reason for normal commands to fail.

## Known User Model

Use a separate normalized model for profile login completion:

```ts
type KnownUser = {
  login: string;
  lastSeenAt?: string;
  cachedAt?: string;
  sources: Array<"history" | "cache">;
};
```

Implementation notes:

- Deduplicate case-insensitively by login.
- Prefer canonical casing from cached profile snapshots when available.
- Merge cache and history metadata into one entry when both exist.
- Sort by recency first, then by login for stable output.
- Ignore malformed cache entries or history events where possible.

## Runtime Shorthand Resolution

Repository shorthand applies to:

```bash
gitpulse owner-or-repo
gitpulse docs owner-or-repo
gitpulse web owner-or-repo
gitpulse owner-or-repo other-owner-or-repo
```

Resolution rules:

1. `owner/name` is already explicit and should be used directly.
2. A bare exact repository name resolves only if exactly one known repository
   has that name.
3. A bare exact owner name resolves only if exactly one known repository has
   that owner.
4. If exact owner and exact repository-name matches both exist and point to the
   same full repository, resolve to that repository.
5. If multiple known repositories match, fail with an ambiguity error listing
   the candidate `owner/name` values.
6. If no known repository matches, fail and ask the user to use `owner/name`
   once so Gitpulse can cache or record it.

Prefix matching must not be used for command execution. For example:

```bash
gitpulse deno
```

should not resolve to `denoland/cli` unless there is an exact known owner or
repository named `deno`. Prefixes belong to shell completion only.

Reserved command words such as `docs`, `web`, `starred`, `history`, `cache`,
`config`, `completions`, `search`, and `user` remain command names rather than
repository shorthand.

## Completion Matching

Completion supports prefix matching over local state.

Examples:

```bash
gitpulse deno<Tab>
# denoland/cli

gitpulse cli<Tab>
# cli/cli
# denoland/cli
# ...

gitpulse denoland/<Tab>
# denoland/cli
# denoland/deno
# ...
```

Candidate generation uses a pure function like:

```ts
completeKnownRepos(current: string, knownRepos: KnownRepo[]): string[]
```

Matching rules:

- If `current` contains `/`, match candidates by `fullName` prefix.
- Otherwise match prefixes against:
  - `owner`
  - `name`
  - `fullName`
- Return canonical `owner/name` values.
- Deduplicate results.
- Prefer higher-quality matches, then more recent repositories, then
  alphabetical order.

Match quality:

1. `fullName` starts with the current token.
2. `owner` starts with the current token.
3. `name` starts with the current token.

The implementation avoids fuzzy matching. Prefix matching is enough and easier
to reason about.

## CLI Surface

Public command:

```bash
gitpulse completions bash
```

It prints a Bash completion script to stdout.

Hidden internal command:

```bash
gitpulse __complete repos --current <token>
gitpulse __complete users --current <token>
```

The hidden command:

- Reads only local cache/history state.
- Never calls GitHub.
- Does not require config loading.
- Prints newline-delimited completion candidates.
- Returns an empty result on missing local state.

## Bash Completion Scope

The generated Bash completion completes:

- Top-level commands:
  - `docs`
  - `web`
  - `starred`
  - `search`
  - `user`
  - `history`
  - `cache`
  - `config`
  - `completions`
- Nested commands:
  - `history clear`
  - `cache clear`
  - `config path`
  - `config reset`
  - `completions bash`
  - `user web`
- Repository arguments for:
  - `gitpulse <repo>` for a single repository report
  - `gitpulse docs <repo>`
  - `gitpulse web <repo>`
  - `gitpulse <repo> <repo> [repo...]` for a comparison report
- User profile arguments for:
  - `gitpulse user <login>`
  - `gitpulse user web <login>`
- No repository argument completion for:
  - `gitpulse starred`
  - `gitpulse search`
- Shared repository flags:
  - `--json`
  - `--color`
  - `--theme`
  - `--refresh`
  - `--offline`
  - `--max-cache-hours`
  - `--contributor-fetch-limit`
- User profile flags:
  - `--json`
  - `--color`
  - `--theme`
  - `--refresh`
  - `--offline`
  - `--max-cache-hours`
- Starred repository flags:
  - `--json`
  - `--color`
  - `--theme`
  - `--refresh`
  - `--offline`
  - `--max-cache-hours`
  - `--list`
  - `--sort`
  - `--direction`
- Search repository flags:
  - `--json`
  - `--color`
  - `--theme`
  - `--refresh`
  - `--offline`
  - `--max-cache-hours`
  - `--list`
  - `--lucky`
  - `--sort`
  - `--order`
  - `--limit`

Flag value completion can stay minimal at first:

- `--color` should complete `auto`, `always`, and `never`.
- `--theme` should complete `tokyo-night`, `catppuccin-mocha`, `nord`,
  `gruvbox-dark`, and `dracula`.
- `--sort` should complete `created` and `updated` for `starred`.
- `--sort` should complete `best-match`, `stars`, `forks`,
  `help-wanted-issues`, and `updated` for `search`.
- `--direction` should complete `asc` and `desc`.
- `--order` should complete `asc` and `desc`.
- Numeric flags do not need value completion.

## Error UX

Ambiguous shorthand should explain what happened and how to proceed:

```text
gitpulse: Ambiguous repository shorthand "cli".

Known matches:
  cli/cli
  denoland/cli

Use owner/name.
```

Unknown shorthand should explain that Gitpulse does not search GitHub:

```text
gitpulse: Unknown repository shorthand "foo".
Use owner/name once to fetch and record it.
```

## Implemented Shape

- `src/cache/known-repos.ts` reads and normalizes known local repositories from
  cache and history.
- Pure helpers cover exact shorthand resolution and prefix completion.
- The root command, `docs`, and each inferred comparison argument resolve exact
  local shorthand before snapshot resolution.
- The `web` command resolves exact local repository shorthand before opening the
  repository page.
- The `user` command does not resolve repository shorthand for its login
  argument.
- `gitpulse __complete repos --current <token>` prints newline-delimited local
  repository candidates for completion scripts.
- `gitpulse __complete users --current <token>` prints newline-delimited local
  user login candidates for completion scripts.
- `gitpulse completions bash` prints the Bash completion script.
- `gitpulse starred` is a reserved top-level command and therefore is not
  treated as repository shorthand.
- `gitpulse search` is a reserved top-level command and therefore is not
  treated as repository shorthand.
- `gitpulse search <query>` is explicit remote search. Root repository
  shorthand does not search GitHub when a word is unknown.
- `README.md` documents installation and use.
- `docs/PROJECT_SPEC.md` states that local shorthand is deterministic and does
  not search remote repositories.

## Test Plan

Add focused tests for:

- Known repository aggregation from cache.
- Known repository aggregation from history.
- Deduplication and canonical casing.
- Exact bare repository-name resolution.
- Exact bare owner-name resolution.
- Ambiguous shorthand errors.
- Unknown shorthand errors.
- Completion by owner prefix.
- Completion by repository-name prefix.
- Completion by full-name prefix.
- Completion after cache/history clear behavior.
- User completion from user profile cache.
- User completion from user history.
- Generated Bash script includes the expected command hooks.

The completion and resolution helpers should be tested as pure functions where
possible. CLI integration tests should cover command wiring, not every matching
case.

## Non-Goals

- Do not call GitHub for completion candidates.
- Do not search GitHub when a shorthand is unknown.
- Do not execute prefix matches directly.
- Do not add fuzzy matching in the first implementation.
- Do not add completion support for every shell in the first implementation.

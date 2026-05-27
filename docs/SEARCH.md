# Repository Search

## Status

`gitpulse search <query>` is the explicit repository discovery surface. It uses
GitHub repository search, lets the user choose a result locally, then runs the
normal single-repository report for the selected `owner/name`.

Search is deliberately not part of the root command. Unknown bare shorthand
still fails instead of searching GitHub.

## Command Shape

```bash
gitpulse search ripgrep
gitpulse search terminal fuzzy finder
gitpulse search language:rust parser --sort stars
gitpulse search ripgrep --lucky
gitpulse search ripgrep --list
gitpulse search ripgrep --list --json
gitpulse search ripgrep --refresh
gitpulse search ripgrep --offline
```

Default behavior:

1. Search GitHub repositories for the query.
2. Open a local selector.
3. Run the normal single-repository report for the selected repository.

`--lucky` skips the selector and runs the normal report for the first search
result. `--list` skips the selector and prints one `owner/name` per line. With
`--list --json`, Gitpulse emits the cached or fetched search result list as
structured JSON.

`--list` and `--lucky` cannot be used together.

## Search Options

Supported options:

- `--sort best-match`, the default, uses GitHub's default result ranking.
- `--sort stars` sorts by star count.
- `--sort forks` sorts by fork count.
- `--sort help-wanted-issues` sorts by matching help-wanted issue count.
- `--sort updated` sorts by repository update time.
- `--order desc`, the default, requests descending order for explicit sorts.
- `--order asc` requests ascending order for explicit sorts.
- `--limit <count>` fetches between `1` and `100` results. The default is `20`.

GitHub search qualifiers can be included directly in the query:

```bash
gitpulse search language:typescript stars:>1000 cli
```

## Cache Behavior

Repository search results use the existing cache policy:

- `--refresh` bypasses the search-result cache.
- `--offline` reads only the search-result cache, then the selected repository
  report follows normal offline repository snapshot behavior.
- `--max-cache-hours` controls search-result freshness.
- `gitpulse cache clear` removes search-result cache entries because they live
  under the normal Gitpulse cache root.

Cache entries are keyed by query, sort, order, and limit.

## Selector Behavior

Interactive selection is intentionally a local terminal concern:

- Prefer `fzf` when available.
- Fall back to `gum filter` when available.
- If neither selector exists, fail with a clear message and suggest
  `gitpulse search <query> --list` or `gitpulse search <query> --lucky`.

Search selector rows include repository name, star count, primary language,
recent push/update date, and description. The selected `owner/name` flows into
the same report path used by `gitpulse owner/name`.

## Root Command Boundary

`gitpulse search` is the only remote repository-search surface.

The root command keeps the deterministic shorthand contract:

- `gitpulse owner/name` runs a direct repository report.
- `gitpulse known-shorthand` resolves exact local shorthand.
- `gitpulse unknownword` fails with an unknown shorthand error.
- `gitpulse a b` renders a comparison.

The root command does not search GitHub for unknown words, with or without
`--lucky`.

## Non-Goals

- Do not use remote search for shell completion.
- Do not add remote search fallback to root shorthand resolution.
- Do not add every search result to local shorthand.
- Do not use search ranking as a project-quality or maintenance verdict.

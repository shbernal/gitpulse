# Forks

## Status

`gitpulse forks` lists the most starred forks of a repository. It answers one
question — which downstream copies attracted an audience — and nothing else.

## Command Shape

```bash
gitpulse forks owner/name
gitpulse forks              # inferred from local Git remotes
gitpulse forks owner/name --limit 25
gitpulse forks owner/name --json
```

The repository argument accepts `owner/name` or an exact local shorthand. When
omitted inside a Git checkout, the target is inferred from local remotes by the
same rules as the root command.

`--limit` defaults to 10 and accepts 1 to 100. The command issues exactly one
API request, so 100 is the ceiling: `GET /repos/{owner}/{repo}/forks` returns at
most one page of 100.

## Ordering

GitHub sorts forks by `newest`, `oldest`, `stargazers`, or `watchers`. Only two
of those are distinct orderings: `newest`/`oldest` sort by fork creation date,
and `watchers` returns the same result as `stargazers` because the fork payload
mirrors `watchers_count` onto the star count.

There is no `pushed` or `updated` sort. Ranking forks by recent activity would
mean paginating the entire fork list and sorting locally, which is unbounded
work on a popular repository. `gitpulse forks` therefore ranks by stars only,
server-side, in one request.

Stars are a global sort, not a per-page one: the first page holds the most
starred forks in the whole list.

## Columns

Every column comes from the fork list payload. No per-fork request is made.

| Column | Source |
| --- | --- |
| Fork | `full_name` |
| Stars | `stargazers_count` |
| Forks | `forks_count` |
| Language | `language` |
| Last push | `pushed_at` |
| State | derived, see below |

`State` is `archived` when the fork is archived, otherwise `active` or
`untouched`. GitHub copies the parent's `pushed_at` onto a new fork, so a fork
whose `pushed_at` is at or before its own `created_at` has never been pushed to.
That makes `untouched` a reliable negative signal and `active` a weak positive
one: an active fork has commits of its own somewhere, but not necessarily ahead
of the parent's default branch.

## Non-Goals

Ahead/behind counts are not reported. They require one
`GET /repos/{owner}/{repo}/compare/{base}...{fork}` request per fork, turning a
single-request command into an N-request one, and they only see the fork's
default branch. See [next-features](next-features/) if that changes.

The command lists direct forks, which is what the endpoint returns. It does not
walk the fork network, and it does not resolve fork parents — that restriction
on repository inference is unchanged.

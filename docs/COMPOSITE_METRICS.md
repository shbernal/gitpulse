# Composite Metrics

Gitpulse composite metrics are small, deterministic grouping helpers. They are
intended to make related signals easier to scan, not to produce a final verdict
about whether a repository is good, safe, or worth adopting.

The current implementation computes two composite metrics:

- Activity freshness.
- Popularity Score.

Activity freshness is rounded, clamped to `0-100`, and labeled with score
bands:

| Score range | Label |
| --- | --- |
| `75-100` | `strong` |
| `50-74` | `moderate` |
| `25-49` | `limited` |
| `0-24` | `weak` |

Popularity Score is an open-ended logarithmic index over weighted adoption
signals. It is not clamped to `0-100`, and each `+1.0` increase means roughly
`10x` more PU.

Machine-readable JSON exposes each score with its input values so consumers can
inspect how the score was produced. Popularity Score also exposes the weighted
PU total.

For deeper debugging, repository reports support explanation mode:

```bash
gitpulse owner/name --explain
gitpulse owner/name --json --explain
```

Explanation mode adds a score analysis breakdown for the single-repository
report. The default terminal and JSON output stay compact unless `--explain` is
passed. Explanation mode is meant to show why Gitpulse produced a specific
score from available API data; it is still not a project-quality, security, or
maintenance verdict.

When a composite metric formula changes, update this document in the same
change.

A later plan may add a tooling-based maintenance analysis that does not use
documentation presence as an input. See
[Future Maintenance Analysis and Docs Command](FUTURE_MAINTENANCE_AND_DOCS.md).

## Activity Freshness

Activity freshness answers: "Does this repository appear to be moving recently?"

It combines repository push recency, latest default-branch commit recency,
latest release recency, release presence, and archive state.

The implementation first computes:

```text
freshnessDays = min(daysSinceLatestCommit, daysSinceLastPush)
```

That means a recent repository push can improve the activity score even if the
latest fetched default-branch commit is older. If one of those dates is missing,
the available date is used. If both are missing, this component contributes `0`.

Commit or push freshness contributes up to `55` points:

| Days since latest commit or push | Points |
| --- | ---: |
| `<= 30` | `55` |
| `<= 90` | `45` |
| `<= 180` | `35` |
| `<= 365` | `20` |
| `<= 730` | `10` |
| `> 730` or missing | `0` |

Release freshness contributes up to `25` points:

| Days since latest release | Points |
| --- | ---: |
| `<= 90` | `25` |
| `<= 365` | `20` |
| `<= 730` | `10` |
| `> 730` or missing | `0` |

Additional activity inputs:

| Signal | Points |
| --- | ---: |
| Has at least one fetched release | `+10` |
| Repository is not archived | `+10` |
| Repository is archived | `-30` |

Current caveat: this score is relatively forgiving to projects with older
commits if they still have release history and are not archived. A repository
with a latest commit slightly over 90 days old can still reach the `strong` band
when other activity inputs are present.

## Popularity Score

Popularity Score answers: "How much visible GitHub adoption surface does this
repository have?"

It first converts visible adoption signals into PU. PU means Popularity Units:
a weighted count of stars, forks, and watchers where stronger intent signals
count more than stars.

```text
popularityUnits = stars + (8 * forks) + (5 * watchers)
popularityScore = log10(popularityUnits + 1)
```

| Signal | Unit weight |
| --- | ---: |
| Star | `1` |
| Fork | `8` |
| Watcher | `5` |

Watchers are sourced from GitHub REST `subscribers_count`, not the legacy
`watchers_count` field that mirrors stars.

The default terminal output renders the score with the weighted total in
parentheses, for example:

```text
Popularity Score  5.42 (263.4k PU)
```

Approximate scale:

| Score | Approximate PU |
| ---: | ---: |
| `3.00` | `1k` |
| `4.00` | `10k` |
| `5.00` | `100k` |
| `6.00` | `1m` |
| `7.00` | `10m` |

Contributors are intentionally not part of Popularity Score. Contributor count
is a community and maintenance-surface signal, while Popularity Score is limited
to public adoption intent signals.

This score does not measure project quality, governance, issue health, or how
recently the community has been active.

## Interpretation Rules

- Treat composite metrics as grouped evidence, not verdicts.
- Prefer the raw fields when making a decision about a repository.
- Compare scores alongside their inputs; two repositories can share a score for
  different reasons.
- Missing data is scored conservatively for that component.
- Archived repositories are penalized in activity.

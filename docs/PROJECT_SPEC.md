# Gitpulse Project Spec

## Summary

Gitpulse is a terminal-first project intelligence CLI. It collects public development signals from source repositories and turns them into a compact, inspectable story for developers evaluating a project.

The current implementation targets GitHub repositories.

## Problem

Developers often need to judge unfamiliar projects quickly:

- Should I install this CLI or tool?
- Should I depend on this library?
- Should I contribute to this project?
- Which of several competing projects looks healthier or more likely to last?
- Is this repository active, maintained, abandoned, experimental, or mature?

The raw signals exist across repository pages, releases, issues, pull requests, documentation files, package registries, and community activity. Gitpulse should collect the first layer of these signals and present them in a way that is fast to read without pretending to make the decision for the user.

## Product Positioning

Gitpulse is not `gh` with another interface. It should not focus on managing GitHub objects.

Gitpulse should be closer to a due-diligence lens for developers: a quick way to understand a repository's state, trajectory, and reliability signals before using it, comparing it, or investing time in it.

## Target Users

Primary users:

- Developers choosing between competing tools.
- Developers evaluating whether to add a project as a dependency.
- Developers deciding whether a project is worth contributing to.
- Technical users checking whether a CLI or developer tool looks maintained before installing it.

Secondary users:

- Maintainers who want a quick external view of how their repository appears.
- Teams standardizing dependencies or tooling choices.
- Security-minded users looking for maintenance and ownership signals before adoption.

## Core Use Cases

### Repository Snapshot

Given `owner/repo`, Gitpulse should display the main repository facts and health signals:

- Creation date and age.
- Stars, forks, watchers, open issues, open pull requests.
- Primary language and language distribution.
- License.
- Latest release and release cadence.
- Recent commit activity.
- Contributor count and concentration.
- Archived, disabled, fork, template, or mirror status.

### Documentation Inspection

Given `owner/repo`, Gitpulse should provide a focused documentation view:

- README presence.
- Changelog presence.
- Contributing guide presence.
- Code of conduct presence.
- Security policy presence.

Documentation signals should be available through `gitpulse docs <repo>` rather
than shown in the default human-readable repository report.

### User Profile Snapshot

Given a GitHub login, Gitpulse should provide a factual public profile view:

- Login, display name, bio, URL, and account type.
- Creation and update dates.
- Followers, following, public repository count, and public gist count.
- Optional public details such as company, location, blog, email, hireable, and
  Twitter/X username.
- Public repository footprint from fetched owned repositories: total stars and
  forks, top repositories, recently pushed repositories, primary languages,
  archived repositories, and fork repositories.

User profile lookup should use an explicit command:

```bash
gitpulse user octocat
```

It should not be inferred from bare root arguments, because root arguments are
repository references or deterministic local repository shorthand.

### Starred Repository Picker

Given the authenticated user's GitHub account, Gitpulse should make it easy to
choose one repository from their starred list and run the normal repository
report:

```bash
gitpulse starred
```

The starred command is a discovery convenience for the authenticated user's own
starred repositories, not a general search surface. It should use the existing
Octokit/GitHub token model, read from `GITHUB_TOKEN`, and avoid relying on
`gh auth` as an implicit token source.

Script-friendly listing should be available without opening a selector:

```bash
gitpulse starred --list
gitpulse starred --list --json
```

The command should not add every starred repository to local shorthand. Only
the repository the user selects and inspects should flow through the normal
snapshot cache and history path.

### Repository Search

Given a search query, Gitpulse should make it easy to discover a GitHub
repository and run the normal repository report:

```bash
gitpulse search ripgrep
gitpulse search terminal fuzzy finder
gitpulse search ripgrep --lucky
gitpulse search ripgrep --list
gitpulse search ripgrep --list --json
```

The search command is the only remote repository-search surface. It may open a
local selector, print a script-friendly list, emit JSON, or use `--lucky` to run
the first result directly.

Search should not weaken root shorthand semantics. Unknown bare root arguments
remain unknown shorthand errors rather than remote searches.

Search result caches are separate from repository snapshots. Only the selected
or lucky repository should flow through the normal repository snapshot cache and
history path.

### Evaluation Lenses

Gitpulse should organize raw datapoints into a few practical lenses. These lenses guide output structure and metric design:

- Adoption: stars, forks, watchers, downstream interest, and ecosystem presence where available.
- Dynamism: recent commits, releases, issue activity, pull request activity, and contributor movement.
- Reliability: release habits, maintenance recency, documentation presence, license clarity, and warning states.
- Maturity: project age, version history, contributor base, topic clarity, and stability indicators.
- Long-term viability: maintainer distribution, community participation, recent activity, and signs that the project is still moving.

These lenses should not become hard claims. They are ways to group evidence so the user can inspect the story quickly.

### Repository Comparison

Given two or more repositories, Gitpulse should show comparable metrics side by side.

The comparison should help answer questions such as:

- Which project appears more active?
- Which project appears more mature?
- Which project has broader adoption?
- Which project has more recent maintenance?
- Which project has stronger release habits?
- Are there warning signs such as archival, very low maintainer activity, or stale releases?

Example comparisons:

```bash
gitpulse Jguer/yay Morganamilo/paru
gitpulse OJ/gobuster ffuf/ffuf
```

### Decision Support, Not Decision Replacement

Gitpulse should avoid declaring one project as "best" or "safe." Instead, it should present evidence and explain tradeoffs.

Good comparison framing:

```text
Show latest release, latest commit, stars, and forks side by side so the user can see those differences directly.
```

Bad output:

```text
Use paru.
```

## Signal Categories

### Repository Facts

These are direct GitHub fields:

- Full name.
- Description.
- URL.
- Creation date.
- Last push date.
- Last update date.
- Default branch.
- Primary language.
- License.
- Star count.
- Fork count.
- Watcher count, sourced from GitHub REST `subscribers_count` rather than legacy `watchers_count`.
- Open issue count.
- Topics.
- Repository size.
- Archived status.
- Fork status.

### Activity Signals

These describe recent project movement:

- Latest commit date on the default branch.
- Commit count over recent windows when available.
- Latest release date.
- Release count.
- Recent issue activity.
- Recent pull request activity.
- Time since last meaningful repository event.

### Community Signals

These describe participation and adoption:

- Contributor count.
- Top contributor concentration.
- Forks relative to stars.
- Open issues relative to stars.
- Pull request participation from non-maintainers where available.

### Documentation Signals

These describe how easy the project is to evaluate:

- README presence.
- License presence.
- Changelog presence.
- Contributing guide presence.
- Code of conduct presence.
- Security policy presence.
- Release notes presence.

Phase 1 detects presence and basic metadata only. It does not perform deeper
content analysis.

### User Profile Signals

These describe the public GitHub account behind a login:

- Login, display name, account type, profile URL, and public profile text fields.
- Account creation and update dates.
- Follower, following, public repository, and public gist counts.
- Fetched public repository footprint, including total stars, total forks,
  recently pushed repositories, top repositories by stars, primary languages,
  archived repository count, and fork repository count.

Phase 1 should treat this as factual profile context, not an identity score or
trust verdict.

## Metric Philosophy

Metrics should be useful but humble. A high star count can indicate adoption or hype. A low issue count can mean quality, inactivity, or disabled issue tracking. Recent commits can mean active maintenance or churn.

Gitpulse should make metrics easier to inspect, not overclaim what they prove.

Composite metrics are allowed as evidence grouping helpers, but they must
remain explainable. The output and docs should describe the inputs and
weighting. Current formulas live in [Composite Metrics](COMPOSITE_METRICS.md).

## Output Philosophy

Default output should be optimized for humans in a terminal:

- Compact reports with grouped sections.
- Score bars or similarly scannable presentations for explainable composite metrics.
- Consistent labels.
- Clear missing-data indicators.
- Dates shown in understandable absolute form.
- Relative recency where helpful, such as "18 days ago."
- Light color usage when supported.
- Configurable terminal themes for human-readable output.

Documentation output should stay focused in `gitpulse docs <repo>` so default
repository and comparison reports remain compact.

User profile output should stay focused in `gitpulse user <login>` so root
repository lookup and repository shorthand remain deterministic.

Browser-opening convenience commands may construct GitHub URLs and launch the
user's browser without collecting project-health data:

```bash
gitpulse web owner/name
gitpulse user web octocat
```

Authenticated starred-repository selection may collect the user's starred
repository list, open a local selector, and then run the normal single
repository report for the selected `owner/name`:

```bash
gitpulse starred
gitpulse starred --list
```

Repository search may query GitHub, open a local selector, and then run the
normal single repository report for the selected `owner/name`:

```bash
gitpulse search ripgrep
gitpulse search ripgrep --lucky
gitpulse search ripgrep --list
```

Repository arguments may use exact bare local shorthand after a repository has
appeared in Gitpulse's cache or consultation history. This shorthand is
deterministic and local-only: command execution does not use prefix matching or
remote GitHub search. Unknown shorthand should ask the user to run `owner/name`
once so Gitpulse can fetch and record it.

The root command infers the report mode from positional repository arguments:
one repository renders a single repository report, while two or more
repositories render a comparison. Reserved command words such as `docs`,
`web`, `starred`, `search`, `user`, `history`, `cache`, `config`, and
`completions` remain command names rather than repository shorthand.

Comparison output should emphasize the scoreboard and grouped side-by-side metrics, without prescribing a choice.

Machine-readable output should be available:

```bash
gitpulse owner/name --json
gitpulse docs owner/name --json
gitpulse starred --list --json
gitpulse search query --list --json
gitpulse user octocat --json
gitpulse owner/a owner/b --json
```

JSON output should remain stable enough to support scripts.
It should use an explicit envelope with a schema version and command name so the scripting surface can evolve deliberately.

## Non-Goals

Gitpulse should not:

- Replace `gh`.
- Manage GitHub issues, pull requests, releases, or repository settings.
- Make final adoption decisions for users.
- Present AI-generated claims without source data.
- Require authentication for basic public repository checks.
- Depend on terminal UI features for core functionality.

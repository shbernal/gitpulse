# gitpulse

CLI to get key data of a GitHub repo.

## Install (manual for now)
Deps: `bash`, `curl`, `jq`, `awk`, `sed`, `coreutils` (`date`).

```bash
install -Dm755 ./gitpulse "$HOME/.local/bin/gitpulse"
```

## Usage
```bash
gitpulse org/repo
```

Example:
```bash
gitpulse torvalds/linux
```

Result:
```text
+--------------------------------+
| torvalds/linux                 |
+--------------------------------+
| Created at          05/09/2011 |
| Stars                   215.2k |
| Language                     C |
| Forks                    60144 |
| Issues                       3 |
+--------------------------------+
```

## Vision
- Build a `gum`-based TUI that presents repo “health” at a glance, so you can decide whether to use and/or contribute.
- Surface signals like archived status, activity trends, and designated/most likely successors for stalled projects.
- Compare projects by community/activity and responsiveness (issue/PR turnaround time).
- And all from the terminal!

import { Command, Option } from "commander";
import { GitHubClient } from "./github/client";
import { collectSnapshot } from "./metrics/snapshot";
import { renderComparisonJson, renderRepoJson } from "./render/json";
import { renderComparison, renderRepo } from "./render/table";
import { shouldUseColor, type ColorMode } from "./render/terminal";

type CommandOptions = {
  color?: ColorMode;
  json?: boolean;
};

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("gitpulse")
    .description("Take the pulse of GitHub repositories from the terminal.")
    .version("0.1.0")
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .argument("[repo]", "repository reference in owner/repo form")
    .action(async (repo: string | undefined, options: CommandOptions) => {
      if (!repo) {
        program.help({ error: true });
        return;
      }

      await runRepo(repo, Boolean(options.json), options.color ?? "auto");
    });

  program
    .command("repo")
    .description("Show a repository pulse report")
    .argument("<repo>", "repository reference in owner/repo form")
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .action(async (repo: string, _options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runRepo(repo, Boolean(options.json), options.color ?? "auto");
    });

  program
    .command("compare")
    .description("Compare two or more repositories side by side")
    .argument("<repos...>", "repository references in owner/repo form")
    .option("--json", "emit JSON output")
    .addOption(colorOption())
    .action(async (repos: string[], _options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runCompare(repos, Boolean(options.json), options.color ?? "auto");
    });

  await program.parseAsync(argv);
}

function colorOption(): Option {
  return new Option("--color <mode>", "color output: auto, always, never").choices(["auto", "always", "never"]);
}

async function runRepo(repo: string, json: boolean, colorMode: ColorMode): Promise<void> {
  const client = new GitHubClient();
  const result = await collectSnapshot(client, repo);

  if (json) {
    console.log(renderRepoJson(result));
  } else if (result.ok) {
    console.log(renderRepo(result.snapshot, { color: shouldUseColor(colorMode) }));
  } else {
    console.error(`gitpulse: ${result.error.message}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runCompare(repos: string[], json: boolean, colorMode: ColorMode): Promise<void> {
  if (repos.length < 2) {
    console.error("gitpulse: compare requires at least two repositories.");
    process.exitCode = 1;
    return;
  }

  const client = new GitHubClient();
  const results = await Promise.all(repos.map((repo) => collectSnapshot(client, repo)));

  if (json) {
    console.log(renderComparisonJson(results));
  } else {
    console.log(renderComparison(results, { color: shouldUseColor(colorMode) }));
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

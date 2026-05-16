import { Command } from "commander";
import { GitHubClient } from "./github/client";
import { collectSnapshot } from "./metrics/snapshot";
import { renderComparisonJson, renderRepoJson } from "./render/json";
import { renderComparison, renderRepo } from "./render/table";

type CommandOptions = {
  json?: boolean;
};

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("gitpulse")
    .description("Take the pulse of GitHub repositories from the terminal.")
    .version("0.1.0")
    .option("--json", "emit JSON output")
    .argument("[repo]", "repository reference in owner/repo form")
    .action(async (repo: string | undefined, options: CommandOptions) => {
      if (!repo) {
        program.help({ error: true });
        return;
      }

      await runRepo(repo, Boolean(options.json));
    });

  program
    .command("repo")
    .description("Show a repository pulse report")
    .argument("<repo>", "repository reference in owner/repo form")
    .option("--json", "emit JSON output")
    .action(async (repo: string, _options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runRepo(repo, Boolean(options.json));
    });

  program
    .command("compare")
    .description("Compare two or more repositories side by side")
    .argument("<repos...>", "repository references in owner/repo form")
    .option("--json", "emit JSON output")
    .action(async (repos: string[], _options: CommandOptions, command: Command) => {
      const options = command.optsWithGlobals<CommandOptions>();
      await runCompare(repos, Boolean(options.json));
    });

  await program.parseAsync(argv);
}

async function runRepo(repo: string, json: boolean): Promise<void> {
  const client = new GitHubClient();
  const result = await collectSnapshot(client, repo);

  if (json) {
    console.log(renderRepoJson(result));
  } else if (result.ok) {
    console.log(renderRepo(result.snapshot));
  } else {
    console.error(`gitpulse: ${result.error.message}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runCompare(repos: string[], json: boolean): Promise<void> {
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
    console.log(renderComparison(results));
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

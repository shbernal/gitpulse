import { describe, expect, test } from "bun:test";
import { browserOpenCommand, githubRepoUrl, githubUserUrl } from "../src/browser";

describe("browser URLs", () => {
  test("builds GitHub repository URLs from valid repository references", () => {
    expect(githubRepoUrl("cli/cli")).toBe("https://github.com/cli/cli");
    expect(githubRepoUrl("CharmBracelet/gum")).toBe("https://github.com/CharmBracelet/gum");
  });

  test("rejects invalid repository references", () => {
    expect(() => githubRepoUrl("cli")).toThrow('Invalid repository reference "cli". Expected owner/repo.');
  });

  test("builds GitHub user profile URLs from valid logins", () => {
    expect(githubUserUrl("octocat")).toBe("https://github.com/octocat");
    expect(githubUserUrl("GitHub")).toBe("https://github.com/GitHub");
  });

  test("rejects invalid GitHub logins", () => {
    expect(() => githubUserUrl("bad/login")).toThrow('Invalid GitHub login "bad/login".');
  });
});

describe("browser open commands", () => {
  test("uses the platform browser launcher", () => {
    expect(browserOpenCommand("https://github.com/cli/cli", "darwin")).toEqual({
      command: "open",
      args: ["https://github.com/cli/cli"],
    });
    expect(browserOpenCommand("https://github.com/cli/cli", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "https://github.com/cli/cli"],
    });
    expect(browserOpenCommand("https://github.com/cli/cli", "linux")).toEqual({
      command: "xdg-open",
      args: ["https://github.com/cli/cli"],
    });
  });
});

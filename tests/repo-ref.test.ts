import { describe, expect, test } from "bun:test";
import { parseGitHubLogin } from "../src/util/github-login";
import { formatComparisonRepoLabels, parseRepoRef } from "../src/util/repo-ref";

describe("parseRepoRef", () => {
  test("parses owner/repo references", () => {
    expect(parseRepoRef("octocat/Hello-World")).toEqual({
      owner: "octocat",
      name: "Hello-World",
    });
  });

  test("rejects invalid references", () => {
    expect(() => parseRepoRef("octocat")).toThrow();
    expect(() => parseRepoRef("/repo")).toThrow();
    expect(() => parseRepoRef("owner/")).toThrow();
    expect(() => parseRepoRef("owner/repo/extra")).toThrow();
  });
});

describe("parseGitHubLogin", () => {
  test("parses GitHub user and organization logins", () => {
    expect(parseGitHubLogin("octocat")).toBe("octocat");
    expect(parseGitHubLogin("github-actions")).toBe("github-actions");
  });

  test("rejects invalid GitHub logins", () => {
    expect(() => parseGitHubLogin("owner/repo")).toThrow();
    expect(() => parseGitHubLogin("-octocat")).toThrow();
    expect(() => parseGitHubLogin("octocat-")).toThrow();
  });
});

describe("formatComparisonRepoLabels", () => {
  test("uses repo names when they are distinct", () => {
    expect(formatComparisonRepoLabels(["Jguer/yay", "Morganamilo/paru"])).toEqual(["yay", "paru"]);
  });

  test("uses full names when repo names collide", () => {
    expect(formatComparisonRepoLabels(["cli/cli", "another/cli"])).toEqual(["cli/cli", "another/cli"]);
  });

  test("treats name collisions case-insensitively", () => {
    expect(formatComparisonRepoLabels(["owner/tool", "other/Tool"])).toEqual(["owner/tool", "other/Tool"]);
  });
});

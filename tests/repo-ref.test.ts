import { describe, expect, test } from "bun:test";
import { parseRepoRef } from "../src/util/repo-ref";

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

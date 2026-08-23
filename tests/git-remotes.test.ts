import { describe, expect, test } from "bun:test";
import {
  formatInferenceFailure,
  inferRepositoryFromGitRemotes,
  parseGitHubRemoteUrl,
  parseGitRemoteOutput,
  selectGitHubRemote,
  type GitRunner,
} from "../src/util/git-remotes";

function remoteOutput(remotes: Array<[string, string]>): string {
  return remotes
    .flatMap(([name, url]) => [`${name}\t${url} (fetch)`, `${name}\t${url} (push)`])
    .join("\n");
}

function fakeGit(result: { ok: boolean; stdout: string }): GitRunner {
  return async () => result;
}

describe("GitHub remote URLs", () => {
  test("accepts the URL forms git writes", () => {
    expect(parseGitHubRemoteUrl("https://github.com/Jguer/yay.git")).toBe("Jguer/yay");
    expect(parseGitHubRemoteUrl("https://shbernal@github.com/Jguer/yay")).toBe("Jguer/yay");
    expect(parseGitHubRemoteUrl("git@github.com:Jguer/yay.git")).toBe("Jguer/yay");
    expect(parseGitHubRemoteUrl("ssh://git@ssh.github.com:443/Jguer/yay.git")).toBe("Jguer/yay");
    expect(parseGitHubRemoteUrl("git://github.com/Jguer/yay.git")).toBe("Jguer/yay");
    expect(parseGitHubRemoteUrl("https://www.github.com/Jguer/yay/")).toBe("Jguer/yay");
  });

  test("rejects non-GitHub hosts and malformed paths", () => {
    expect(parseGitHubRemoteUrl("git@gitlab.com:Jguer/yay.git")).toBeNull();
    expect(parseGitHubRemoteUrl("https://github.enterprise.dev/Jguer/yay.git")).toBeNull();
    expect(parseGitHubRemoteUrl("https://github.com/Jguer")).toBeNull();
    expect(parseGitHubRemoteUrl("https://github.com/Jguer/yay/tree/master")).toBeNull();
    expect(parseGitHubRemoteUrl("../local/mirror.git")).toBeNull();
  });

  test("keeps only fetch lines pointing at GitHub", () => {
    const remotes = parseGitRemoteOutput(
      remoteOutput([
        ["fork", "https://github.com/shbernal/yay.git"],
        ["mirror", "git@gitlab.com:shbernal/yay.git"],
        ["origin", "https://github.com/Jguer/yay.git"],
      ]),
    );

    expect(remotes).toEqual([
      { name: "fork", fullName: "shbernal/yay" },
      { name: "origin", fullName: "Jguer/yay" },
    ]);
  });
});

describe("remote precedence", () => {
  test("origin wins over any other remote name", () => {
    expect(
      selectGitHubRemote([
        { name: "fork", fullName: "shbernal/yay" },
        { name: "origin", fullName: "Jguer/yay" },
      ]),
    ).toEqual({ kind: "inferred", fullName: "Jguer/yay", remote: "origin" });
  });

  test("origin wins over upstream but reports the upstream it passed over", () => {
    expect(
      selectGitHubRemote([
        { name: "origin", fullName: "shbernal/yay" },
        { name: "upstream", fullName: "Jguer/yay" },
      ]),
    ).toEqual({
      kind: "inferred",
      fullName: "shbernal/yay",
      remote: "origin",
      upstreamFullName: "Jguer/yay",
    });
  });

  test("upstream wins when no origin remote points at GitHub", () => {
    expect(
      selectGitHubRemote([
        { name: "fork", fullName: "shbernal/yay" },
        { name: "upstream", fullName: "Jguer/yay" },
      ]),
    ).toEqual({ kind: "inferred", fullName: "Jguer/yay", remote: "upstream" });
  });

  test("uses a single unnamed-convention remote", () => {
    expect(selectGitHubRemote([{ name: "fork", fullName: "shbernal/yay" }])).toEqual({
      kind: "inferred",
      fullName: "shbernal/yay",
      remote: "fork",
    });
  });

  test("remotes pointing at the same repository are not ambiguous", () => {
    expect(
      selectGitHubRemote([
        { name: "mirror", fullName: "jguer/yay" },
        { name: "release", fullName: "Jguer/yay" },
      ]),
    ).toEqual({ kind: "inferred", fullName: "jguer/yay", remote: "mirror" });
  });

  test("fails on several distinct GitHub remotes without a preferred name", () => {
    expect(
      selectGitHubRemote([
        { name: "fork", fullName: "shbernal/yay" },
        { name: "vendor", fullName: "Morganamilo/paru" },
      ]),
    ).toEqual({
      kind: "ambiguous",
      candidates: [
        { name: "fork", fullName: "shbernal/yay" },
        { name: "vendor", fullName: "Morganamilo/paru" },
      ],
    });
  });

  test("fails when no remote points at GitHub", () => {
    expect(selectGitHubRemote([])).toEqual({ kind: "no-github-remote" });
  });
});

describe("inference failures", () => {
  test("reports a missing checkout separately from a missing GitHub remote", async () => {
    await expect(
      inferRepositoryFromGitRemotes({ run: fakeGit({ ok: false, stdout: "" }) }),
    ).resolves.toEqual({ kind: "outside-checkout" });

    await expect(
      inferRepositoryFromGitRemotes({ run: fakeGit({ ok: true, stdout: "" }) }),
    ).resolves.toEqual({ kind: "no-github-remote" });
  });

  test("infers from git output end to end", async () => {
    const run = fakeGit({
      ok: true,
      stdout: remoteOutput([
        ["fork", "git@github.com:shbernal/yay.git"],
        ["origin", "https://github.com/Jguer/yay.git"],
      ]),
    });

    await expect(inferRepositoryFromGitRemotes({ run })).resolves.toEqual({
      kind: "inferred",
      fullName: "Jguer/yay",
      remote: "origin",
    });
  });

  test("names the candidates in an ambiguity message", () => {
    const message = formatInferenceFailure({
      kind: "ambiguous",
      candidates: [
        { name: "fork", fullName: "shbernal/yay" },
        { name: "vendor", fullName: "Morganamilo/paru" },
      ],
    });

    expect(message).toContain("shbernal/yay");
    expect(message).toContain("Morganamilo/paru");
    expect(message).toContain("Pass owner/name.");
  });
});

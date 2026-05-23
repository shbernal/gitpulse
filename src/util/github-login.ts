const githubLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export class GitHubLoginError extends Error {
  constructor(input: string) {
    super(`Invalid GitHub login "${input}".`);
    this.name = "GitHubLoginError";
  }
}

export function parseGitHubLogin(input: string): string {
  const trimmed = input.trim();

  if (!githubLoginPattern.test(trimmed)) {
    throw new GitHubLoginError(input);
  }

  return trimmed;
}

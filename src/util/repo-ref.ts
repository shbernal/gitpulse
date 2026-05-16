import type { RepoRef } from "../types";

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const repoPattern = /^[A-Za-z0-9._-]+$/;

export class RepoRefError extends Error {
  constructor(input: string) {
    super(`Invalid repository reference "${input}". Expected owner/repo.`);
    this.name = "RepoRefError";
  }
}

export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();
  const parts = trimmed.split("/");

  if (parts.length !== 2) {
    throw new RepoRefError(input);
  }

  const [owner, name] = parts;

  if (
    !owner ||
    !name ||
    !ownerPattern.test(owner) ||
    !repoPattern.test(name) ||
    name.length > 100
  ) {
    throw new RepoRefError(input);
  }

  return { owner, name };
}

export function formatRepoRef(ref: RepoRef): string {
  return `${ref.owner}/${ref.name}`;
}

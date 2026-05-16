export type GitHubRepository = {
  full_name: string;
  description: string | null;
  html_url: string;
  created_at: string;
  pushed_at: string | null;
  updated_at: string;
  default_branch: string;
  language: string | null;
  license: {
    spdx_id: string | null;
    key: string | null;
    name: string | null;
  } | null;
  stargazers_count: number;
  forks_count: number;
  subscribers_count: number;
  open_issues_count: number;
  topics?: string[];
  archived: boolean;
  fork: boolean;
  disabled: boolean;
  is_template?: boolean;
  size: number;
};

export type GitHubRelease = {
  name: string | null;
  tag_name: string;
  published_at: string | null;
  created_at: string;
};

export type GitHubCommit = {
  commit: {
    author: {
      date: string | null;
    } | null;
    committer: {
      date: string | null;
    } | null;
  };
};

export type CommitOverview = {
  latest: GitHubCommit | null;
  count: number | null;
};

export type GitHubContributor = {
  login?: string | null;
  name?: string | null;
  contributions: number;
};

export type ContributorOverview = {
  contributors: GitHubContributor[];
  totalCount: number | null;
  fetchLimit: number;
  truncated: boolean;
};

export type GitHubContentItemType = "dir" | "file" | "submodule" | "symlink";

export type GitHubContentItem = {
  type: GitHubContentItemType;
  name: string;
  path: string;
};

export type ReleaseOverview = {
  latest: GitHubRelease | null;
  count: number;
};

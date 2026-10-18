import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectForge, remoteHost, repoForge } from "./forge.ts";

describe("detectForge", () => {
  it.each([
    ["https://github.com/cursor/plugins.git", "gh"],
    ["git@github.com:cursor/plugins.git", "gh"],
    ["ssh://git@ssh.github.com:443/cursor/plugins.git", "gh"],
    ["https://gitlab.com/group/project.git", "glab"],
    ["git@gitlab.internal.example:team/app.git", "glab"],
    ["https://code.example.corp/team/app.git", "glab"],
    ["ssh://git@git.example.corp:2222/team/app.git", "glab"],
    ["/srv/repos/app.git", "gh"],
    ["file:///srv/repos/app.git", "gh"],
  ] as const)("maps %s to %s", (url, forge) => {
    expect(detectForge(url)).toBe(forge);
  });

  it("keeps gh when there is no origin remote", () => {
    expect(detectForge(null)).toBe("gh");
  });

  it("reads the host from https, ssh, and scp-style remotes", () => {
    expect(remoteHost("https://user:token@GitLab.Example.corp/a/b.git")).toBe(
      "gitlab.example.corp"
    );
    expect(remoteHost("git@gitlab.example.corp:a/b.git")).toBe(
      "gitlab.example.corp"
    );
    expect(remoteHost("C:/repos/app")).toBeNull();
  });
});

describe("repoForge", () => {
  const git = (repo: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-C", repo, ...args]);

  it("reads git remote get-url origin", () => {
    const repo = mkdtempSync(join(tmpdir(), "forge-test-"));
    try {
      git(repo, "init", "--initial-branch=main");
      expect(repoForge(repo)).toBe("gh");
      git(repo, "remote", "add", "origin", "git@gitlab.example.corp:team/app.git");
      expect(repoForge(repo)).toBe("glab");
      git(repo, "remote", "set-url", "origin", "https://github.com/team/app.git");
      expect(repoForge(repo)).toBe("gh");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "worktree-audit.sh");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function git(repo: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", "-C", repo, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function fakeTool(bin: string, name: string, body: string): void {
  const path = join(bin, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function audit(remote: string): { stdout: string; calls: string } {
  const directory = mkdtempSync(join(tmpdir(), "worktree-audit-test-"));
  directories.push(directory);
  const repo = join(directory, "repo");
  const bin = join(directory, "bin");
  const calls = join(directory, "calls.txt");
  mkdirSync(repo);
  mkdirSync(bin);
  writeFileSync(calls, "");
  git(repo, "init", "--initial-branch=main");
  git(repo, "config", "user.name", "Audit Test");
  git(repo, "config", "user.email", "audit@example.com");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "main");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "worktree", "add", "-b", "feat", join(directory, "feat"));
  fakeTool(
    bin,
    "glab",
    `printf 'glab %s\\n' "$*" >> "${calls}"\nprintf '%s' '[{"iid":7,"state":"opened","draft":false,"source_branch":"feat"}]'`
  );
  fakeTool(
    bin,
    "gh",
    `printf 'gh %s\\n' "$*" >> "${calls}"\nprintf '%s' '[{"number":5,"state":"OPEN","headRefName":"feat"}]'`
  );
  const result = Bun.spawnSync(["bash", script, "-b", "main", repo], {
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, HOME: directory },
  });
  expect(result.exitCode).toBe(0);
  return {
    stdout: result.stdout.toString(),
    calls: readFileSync(calls, "utf8"),
  };
}

it("reads merge requests through local glab on a self-hosted GitLab remote", () => {
  const { stdout, calls } = audit("git@gitlab.example.corp:team/app.git");
  expect(stdout).toContain("#7/open");
  expect(stdout).toContain("hold-open-pr");
  expect(calls).toContain("glab api --paginate projects/:id/merge_requests?scope=created_by_me");
  expect(calls).not.toContain("gh ");
});

it("keeps gh on a github.com remote", () => {
  const { stdout, calls } = audit("https://github.com/team/app.git");
  expect(stdout).toContain("#5/open");
  expect(calls).toContain("gh pr list --author @me");
  expect(calls).not.toContain("glab");
});

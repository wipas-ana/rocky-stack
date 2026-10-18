import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, statusOf, type MergeRequest } from "./watch-mr.ts";

const script = join(import.meta.dir, "watch-mr.ts");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const open: MergeRequest = {
  iid: 42,
  state: "opened",
  draft: false,
  has_conflicts: false,
  detailed_merge_status: "mergeable",
  sha: "abc123",
  head_pipeline: { status: "success" },
};
const unresolved = [{ notes: [{ resolvable: true, resolved: false }] }];
const resolved = [{ notes: [{ resolvable: true, resolved: true }, { resolvable: false }] }];

describe("statusOf", () => {
  it("is READY when GitLab says mergeable, the pipeline passed, and no thread is open", () => {
    expect(statusOf(open, resolved)).toMatchObject({ verdict: "READY", unresolvedThreads: 0 });
  });

  it("is READY with no pipeline when the project runs none", () => {
    expect(statusOf({ ...open, head_pipeline: null }, []).verdict).toBe("READY");
  });

  it("lists blockers in conflicts, threads, CI order", () => {
    expect(
      statusOf(
        { ...open, has_conflicts: true, head_pipeline: { status: "failed" } },
        unresolved
      )
    ).toMatchObject({
      verdict: "BLOCKED",
      reasons: ["conflicts", "unresolved-threads", "ci-failed"],
    });
  });

  it("reports approval and draft as blockers for the human", () => {
    expect(
      statusOf({ ...open, draft: true, detailed_merge_status: "not_approved" }, []).reasons
    ).toEqual(["draft", "needs-approval"]);
  });

  it("waits while the pipeline runs", () => {
    expect(
      statusOf(
        { ...open, detailed_merge_status: "ci_still_running", head_pipeline: { status: "running" } },
        []
      )
    ).toMatchObject({ verdict: "WAITING", reasons: ["ci-running", "ci_still_running"] });
  });

  it("is terminal on merged and closed", () => {
    expect(statusOf({ ...open, state: "merged" }, unresolved).verdict).toBe("MERGED");
    expect(statusOf({ ...open, state: "closed" }, []).verdict).toBe("CLOSED");
  });

  it("falls back to merge_status on older GitLab", () => {
    expect(
      statusOf({ ...open, detailed_merge_status: undefined, merge_status: "can_be_merged" }, []).verdict
    ).toBe("READY");
  });
});

describe("parseArgs", () => {
  it("accepts !iid and rejects unknown flags", () => {
    expect(parseArgs(["--mr", "!7", "--status-only"])).toMatchObject({ mr: 7, statusOnly: true });
    expect(() => parseArgs(["--pr", "7"])).toThrow("Usage: watch-mr");
  });
});

describe("watch-mr CLI", () => {
  function fakeGlab(states: readonly string[]): { bin: string; calls: string } {
    const directory = mkdtempSync(join(tmpdir(), "watch-mr-test-"));
    directories.push(directory);
    const bin = join(directory, "bin");
    const calls = join(directory, "calls.txt");
    const counter = join(directory, "count");
    mkdirSync(bin);
    writeFileSync(counter, "0");
    const cases = states
      .map(
        (status, index) =>
          `    ${index}) printf '%s' '${JSON.stringify({ ...open, detailed_merge_status: status === "success" ? "mergeable" : "ci_still_running", head_pipeline: { status } })}' ;;`
      )
      .join("\n");
    writeFileSync(
      join(bin, "glab"),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
case "$2" in
  "projects/:id/merge_requests?source_branch=feat&state=opened&per_page=100") printf '[{"iid":42}]' ;;
  "projects/:id/merge_requests/42/discussions?per_page=100") printf '[]' ;;
  "projects/:id/merge_requests/42")
    n=$(cat "${counter}"); echo $((n + 1)) > "${counter}"
    case "$n" in
${cases}
    *) printf '%s' '${JSON.stringify(open)}' ;;
    esac ;;
  *) echo "unexpected glab $*" >&2; exit 2 ;;
esac
`
    );
    chmodSync(join(bin, "glab"), 0o755);
    return { bin, calls };
  }

  function run(bin: string, args: readonly string[], cwd?: string) {
    const result = Bun.spawnSync(["bun", script, ...args], {
      cwd,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });
    return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  }

  it("prints one status pass with --status-only", () => {
    const { bin } = fakeGlab(["running"]);
    const result = run(bin, ["--mr", "42", "--status-only"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ verdict: "WAITING", mr: 42, pipeline: "running" });
  });

  it("polls until READY", () => {
    const { bin, calls } = fakeGlab(["running", "running", "success"]);
    const result = run(bin, ["--mr", "42", "--interval", "0.01", "--pretty"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("!42 READY pipeline=success threads=0");
    expect(readFileSync(calls, "utf8").match(/merge_requests\/42$/gm)?.length).toBe(3);
  });

  it("finds the merge request for the current branch", () => {
    const { bin } = fakeGlab(["success"]);
    const repo = mkdtempSync(join(tmpdir(), "watch-mr-repo-"));
    directories.push(repo);
    Bun.spawnSync(["git", "-C", repo, "init", "--initial-branch=feat"]);
    const result = run(bin, ["--status-only"], repo);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).verdict).toBe("READY");
  });

  it("exits 2 on a usage error", () => {
    const { bin } = fakeGlab([]);
    expect(run(bin, ["--nope"]).code).toBe(2);
  });
});

#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export type Verdict = "READY" | "WAITING" | "BLOCKED" | "MERGED" | "CLOSED";

export interface MergeRequest {
  readonly iid: number;
  readonly state: string;
  readonly draft?: boolean;
  readonly has_conflicts?: boolean;
  readonly detailed_merge_status?: string;
  readonly merge_status?: string;
  readonly sha?: string;
  readonly web_url?: string;
  readonly head_pipeline?: { readonly status?: string } | null;
}

export interface Discussion {
  readonly notes?: readonly {
    readonly resolvable?: boolean;
    readonly resolved?: boolean;
  }[];
}

export interface Status {
  readonly verdict: Verdict;
  readonly mr: number;
  readonly sha: string | null;
  readonly mergeStatus: string | null;
  readonly pipeline: string | null;
  readonly unresolvedThreads: number;
  readonly reasons: readonly string[];
  readonly webUrl: string | null;
}

const PIPELINE_PENDING = new Set([
  "created",
  "waiting_for_resource",
  "preparing",
  "pending",
  "running",
  "scheduled",
]);
const PIPELINE_FAILED = new Set(["failed", "canceled"]);
const MERGE_STATUS_BLOCKERS: Readonly<Record<string, string>> = {
  not_approved: "needs-approval",
  requested_changes: "changes-requested",
  need_rebase: "needs-rebase",
  jira_association_missing: "jira-association-missing",
  blocked_status: "blocked-by-dependency",
  not_open: "not-open",
};
const TERMINAL = new Set<Verdict>(["READY", "BLOCKED", "MERGED", "CLOSED"]);

export function unresolvedThreads(discussions: readonly Discussion[]): number {
  return discussions.filter((discussion) =>
    (discussion.notes ?? []).some(
      (note) => note.resolvable === true && note.resolved !== true
    )
  ).length;
}

export function statusOf(
  mr: MergeRequest,
  discussions: readonly Discussion[]
): Status {
  const pipeline = mr.head_pipeline?.status ?? null;
  const mergeStatus = mr.detailed_merge_status ?? mr.merge_status ?? null;
  const unresolved = unresolvedThreads(discussions);
  const base = {
    mr: mr.iid,
    sha: mr.sha ?? null,
    mergeStatus,
    pipeline,
    unresolvedThreads: unresolved,
    webUrl: mr.web_url ?? null,
  };
  if (mr.state === "merged") return { ...base, verdict: "MERGED", reasons: [] };
  if (mr.state === "closed") return { ...base, verdict: "CLOSED", reasons: [] };

  const blockers: string[] = [];
  if (mr.has_conflicts === true || mergeStatus === "conflict") blockers.push("conflicts");
  if (unresolved > 0) blockers.push("unresolved-threads");
  if (pipeline !== null && PIPELINE_FAILED.has(pipeline)) blockers.push("ci-failed");
  if (pipeline === "manual") blockers.push("ci-manual-job");
  if (mr.draft === true || mergeStatus === "draft_status") blockers.push("draft");
  const mapped = mergeStatus === null ? undefined : MERGE_STATUS_BLOCKERS[mergeStatus];
  if (mapped !== undefined) blockers.push(mapped);
  if (blockers.length > 0) return { ...base, verdict: "BLOCKED", reasons: blockers };

  const pipelineReady = pipeline === null || pipeline === "success";
  if ((mergeStatus === "mergeable" || mergeStatus === "can_be_merged") && pipelineReady) {
    return { ...base, verdict: "READY", reasons: [] };
  }
  const waiting: string[] = [];
  if (pipeline !== null && PIPELINE_PENDING.has(pipeline)) waiting.push("ci-running");
  if (mergeStatus !== null && mergeStatus !== "mergeable") waiting.push(mergeStatus);
  return { ...base, verdict: "WAITING", reasons: waiting.length ? waiting : ["unknown"] };
}

export function glabJson(args: readonly string[]): unknown {
  let raw: string;
  try {
    raw = execFileSync("glab", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`glab ${args.join(" ")} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`glab ${args.join(" ")} output is not valid JSON`);
  }
}

function currentBranchMr(): number {
  const branch = execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const rows = glabJson([
    "api",
    `projects/:id/merge_requests?source_branch=${encodeURIComponent(branch)}&state=opened&per_page=100`,
  ]);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`branch ${branch} has no open merge request; open one with glab mr create`);
  }
  if (rows.length > 1) {
    throw new Error(`branch ${branch} has ${rows.length} open merge requests; pass --mr <iid>`);
  }
  return Number(rows[0].iid);
}

export function readStatus(iid: number): Status {
  const mr = glabJson(["api", `projects/:id/merge_requests/${iid}`]) as MergeRequest;
  const discussions = glabJson([
    "api",
    `projects/:id/merge_requests/${iid}/discussions?per_page=100`,
  ]);
  if (typeof mr !== "object" || mr === null || typeof mr.iid !== "number") {
    throw new Error(`glab api merge_requests/${iid} returned no merge request`);
  }
  return statusOf(mr, Array.isArray(discussions) ? discussions : []);
}

interface Options {
  mr: number | null;
  statusOnly: boolean;
  pretty: boolean;
  intervalSeconds: number;
  timeoutSeconds: number;
}

const USAGE =
  "Usage: watch-mr [--mr <iid>] [--status-only] [--pretty] [--interval <seconds>] [--timeout <seconds>]";

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    mr: null,
    statusOnly: false,
    pretty: false,
    intervalSeconds: 30,
    timeoutSeconds: 3600,
  };
  const number = (value: string | undefined, name: string): number => {
    const parsed = Number(value?.replace(/^!/, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be greater than zero`);
    return parsed;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mr") options.mr = number(argv[++i], "--mr");
    else if (arg === "--status-only") options.statusOnly = true;
    else if (arg === "--pretty") options.pretty = true;
    else if (arg === "--interval") options.intervalSeconds = number(argv[++i], "--interval");
    else if (arg === "--timeout") options.timeoutSeconds = number(argv[++i], "--timeout");
    else throw new Error(USAGE);
  }
  return options;
}

function render(status: Status, pretty: boolean): string {
  if (!pretty) return JSON.stringify(status);
  const reasons = status.reasons.length ? ` (${status.reasons.join(", ")})` : "";
  return `!${status.mr} ${status.verdict}${reasons} pipeline=${status.pipeline ?? "none"} threads=${status.unresolvedThreads}`;
}

export async function main(argv: readonly string[]): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  try {
    const iid = options.mr ?? currentBranchMr();
    const deadline = Date.now() + options.timeoutSeconds * 1000;
    for (;;) {
      const status = readStatus(iid);
      if (options.statusOnly || TERMINAL.has(status.verdict)) {
        console.log(render(status, options.pretty));
        return 0;
      }
      if (Date.now() + options.intervalSeconds * 1000 > deadline) {
        console.log(render(status, options.pretty));
        return 1;
      }
      await delay(options.intervalSeconds * 1000);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}

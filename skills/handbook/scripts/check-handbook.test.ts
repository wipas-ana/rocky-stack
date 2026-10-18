import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "bun:test";

const checker = join(import.meta.dir, "check-handbook.mjs");
const fixture = join(import.meta.dir, "fixtures", "repo");
const repos: string[] = [];

const copy = () => {
	const repo = mkdtempSync(join(tmpdir(), "check-handbook-test-"));
	cpSync(fixture, repo, { recursive: true });
	repos.push(repo);
	return repo;
};

const run = (repo: string, ...flags: string[]) =>
	spawnSync("node", [checker, "--root", repo, ...flags], { encoding: "utf8" });

afterEach(() => {
	for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

const rules = "docs/handbook/rules/pricing.md";
const bug = "docs/handbook/bugs/2026-10-01-welcome-code-under-minimum.md";

test("the fixture handbook passes", () => {
	const result = run(copy());
	expect(result.stderr).toBe("");
	expect(result.status).toBe(0);
});

test.each([
	["a missing path", rules, "- Codes stack. Code `src/missing.ts#stack`. `unguarded`.\n", "does not exist"],
	["a missing symbol", rules, "- Codes stack. Code `src/pricing.ts#stackCodes`. `unguarded`.\n", "symbol not found"],
	["a rule with no guard", rules, "- Codes stack. Code `src/pricing.ts#applyDiscount`.\n", "no guard test"],
	["a guard that is not a test", rules, "- Codes stack. Code `src/pricing.ts#applyDiscount`. Guard `src/pricing.ts#applyDiscount`.\n", "is not a test file"],
	["a rule with no code citation", rules, "- Codes stack. `unguarded`.\n", "cites no Code"],
	["a line-number citation", "docs/handbook/flows/checkout.md", "See `src/pricing.ts:2`.\n", "line-number citation"],
	["a path outside the repo", "docs/handbook/flows/checkout.md", "See `../outside.ts#x`.\n", "leaves the repo"],
	["a long dash", "docs/handbook/overview.md", "Pricing runs once \u2014 at checkout.\n", "long dash"],
])("fails on %s", (_name, file, line, message) => {
	const repo = copy();
	appendFileSync(join(repo, file), line);
	const result = run(repo);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(message);
});

test("fails on a bug entry without its fields or a dated name", () => {
	const repo = copy();
	writeFileSync(join(repo, "docs/handbook/bugs/2026-10-02-empty.md"), "# Empty\n");
	writeFileSync(join(repo, "docs/handbook/bugs/undated.md"), "# Undated\n");
	const result = run(repo);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("lacks **Root cause.**");
	expect(result.stderr).toContain("is not bugs/<yyyy-mm-dd>-<slug>.md");
});

test("an unguarded bug entry passes", () => {
	const repo = copy();
	const text = readFileSync(join(repo, bug), "utf8").replace(/\*\*Guard\.\*\* .*/, "**Guard.** `unguarded`");
	writeFileSync(join(repo, bug), text);
	expect(run(repo, "--index").status).toBe(0);
});

test("a new entry only notes a stale index until --index rebuilds it", () => {
	const repo = copy();
	writeFileSync(
		join(repo, "docs/handbook/bugs/2026-10-03-zero-total.md"),
		"# Empty cart priced as NaN\n\n**Symptom.** NaN total.\n**Keywords.** NaN, empty cart\n**Root cause.** Missing default in `src/pricing.ts#applyDiscount`.\n**Fix.** commit abc1234\n**Guard.** `unguarded`\n",
	);
	const stale = run(repo);
	expect(stale.status).toBe(0);
	expect(stale.stdout).toContain("is stale");
	expect(run(repo, "--index").status).toBe(0);
	const index = readFileSync(join(repo, "docs/handbook/bugs/README.md"), "utf8");
	expect(index).toContain("| 2026-10-03 | Empty cart priced as NaN | NaN, empty cart |");
	expect(run(repo).stdout).not.toContain("is stale");
});

const incident = "docs/handbook/incidents/2026-10-05-checkout-totals-wrong.md";

test("an incident entry needs every field and a guard", () => {
	const repo = copy();
	const text = readFileSync(join(repo, incident), "utf8")
		.replace(/\*\*Follow-ups\.\*\* .*\n/, "")
		.replace(/\*\*Guard\.\*\* .*/, "**Guard.** see the PR");
	writeFileSync(join(repo, incident), text);
	writeFileSync(join(repo, "docs/handbook/incidents/outage.md"), "# Outage\n");
	const result = run(repo);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("incident entry lacks **Follow-ups.**");
	expect(result.stderr).toContain("no guard test");
	expect(result.stderr).toContain("incident entry is not incidents/<yyyy-mm-dd>-<slug>.md");
});

test("a new incident only notes a stale index until --index rebuilds it", () => {
	const repo = copy();
	writeFileSync(
		join(repo, "docs/handbook/incidents/2026-10-06-pricing-timeouts.md"),
		"# Pricing timed out\n\n**Severity.** P1\n**What happened.** Checkout timed out.\n**Cause.** A slow loop in `src/pricing.ts#applyDiscount`.\n**Fix.** commit def5678\n**Guard.** `unguarded`\n**Follow-ups.** Add a load test.\n",
	);
	const stale = run(repo);
	expect(stale.status).toBe(0);
	expect(stale.stdout).toContain("docs/handbook/incidents/README.md is stale");
	expect(run(repo, "--index").status).toBe(0);
	const index = readFileSync(join(repo, "docs/handbook/incidents/README.md"), "utf8");
	expect(index).toContain("| 2026-10-06 | Pricing timed out | P1 | `unguarded` |");
	expect(run(repo).stdout).not.toContain("is stale");
});

test("exits 2 without a handbook", () => {
	const repo = copy();
	rmSync(join(repo, "docs"), { recursive: true });
	expect(run(repo).status).toBe(2);
});

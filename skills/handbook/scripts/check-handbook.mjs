#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const USAGE = "Usage: node check-handbook.mjs [--root <repo>] [--index] [handbook-dir]";
const ENTRY_FILE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const LOGS = {
	bugs: {
		noun: "bug",
		fields: ["Symptom.", "Keywords.", "Root cause.", "Fix.", "Guard."],
		header: ["# Bug log", "| Date | Symptom | Keywords | Guard | Entry |"],
		cells: (value) => [value("Keywords."), value("Guard.")],
	},
	incidents: {
		noun: "incident",
		fields: ["Severity.", "What happened.", "Cause.", "Fix.", "Guard.", "Follow-ups."],
		header: ["# Incident log", "| Date | Incident | Severity | Guard | Entry |"],
		cells: (value) => [value("Severity."), value("Guard.")],
	},
};
const CITATION = /`([^`#\s]+)#([^`]+)`/g;
const LINE_CITATION = /`[^`\s]+\.[a-z0-9]+:\d+`/i;
const TEST_PATH = /test|spec/i;

const args = process.argv.slice(2);
let root = process.cwd();
let writeIndex = false;
let dirArg = null;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--root") root = path.resolve(args[++i] ?? "");
	else if (args[i] === "--index") writeIndex = true;
	else if (args[i].startsWith("-")) {
		console.error(USAGE);
		process.exit(2);
	} else dirArg = args[i];
}
const handbook = path.resolve(root, dirArg ?? "docs/handbook");
if (!fs.existsSync(handbook)) {
	console.error(`${handbook}: no handbook directory`);
	console.error(USAGE);
	process.exit(2);
}

const problems = [];
const notes = [];
const rel = (file) => path.relative(root, file);
const fail = (file, line, message) => problems.push(`${rel(file)}:${line}: ${message}`);

const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
const search = has("rg") ? ["rg", ["-F", "-q", "--"]] : has("grep") ? ["grep", ["-F", "-q", "--"]] : null;
const symbolFound = (file, symbol) => {
	if (search) return spawnSync(search[0], [...search[1], symbol, file]).status === 0;
	return fs.readFileSync(file, "utf8").includes(symbol);
};

const resolveCitation = (file, line, citedPath, symbol) => {
	if (path.isAbsolute(citedPath)) return fail(file, line, `\`${citedPath}\` is absolute, cite a repo-relative path`), false;
	const target = path.resolve(root, citedPath);
	if (target !== root && !target.startsWith(root + path.sep)) return fail(file, line, `\`${citedPath}\` leaves the repo`), false;
	if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return fail(file, line, `\`${citedPath}\` does not exist`), false;
	if (!symbolFound(target, symbol)) return fail(file, line, `\`${citedPath}#${symbol}\` names a symbol not found in the file`), false;
	return true;
};

const proseLines = (file) => {
	const out = [];
	let fence = null;
	fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((text, i) => {
		const open = text.match(/^ {0,3}(`{3,}|~{3,})/);
		if (fence) {
			if (open && open[1][0] === fence[0] && open[1].length >= fence.length && text.trim() === open[1]) fence = null;
			return;
		}
		if (open) {
			fence = open[1];
			return;
		}
		out.push({ n: i + 1, text });
	});
	return out;
};

const checkGuard = (file, line, text) => {
	if (text.includes("`unguarded`")) return;
	const guard = text.match(/Guard\.?(?:\*\*)?\s+`([^`#\s]+)#([^`]+)`/);
	if (!guard) return fail(file, line, "no guard test, cite Guard `path#test name` or write `unguarded`");
	if (!TEST_PATH.test(guard[1])) fail(file, line, `guard \`${guard[1]}\` is not a test file`);
};

const walk = (dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const full = path.join(dir, e.name);
		return e.isDirectory() ? walk(full) : e.name.endsWith(".md") ? [full] : [];
	});

const logs = Object.entries(LOGS).map(([dir, spec]) => ({
	...spec,
	dir: path.join(handbook, dir),
	indexFile: path.join(handbook, dir, "README.md"),
	entries: [],
}));
const indexFiles = new Set(logs.map((log) => log.indexFile));
if (!fs.existsSync(path.join(handbook, "overview.md"))) fail(handbook, 1, "no overview.md");

for (const file of walk(handbook).sort()) {
	if (indexFiles.has(file)) continue;
	const lines = proseLines(file);
	const area = path.relative(handbook, file).split(path.sep)[0];
	for (const { n, text } of lines) {
		if (/[\u2013\u2014]/.test(text)) fail(file, n, "long dash");
		if (/[\u2018\u2019\u201c\u201d]/.test(text)) fail(file, n, "curly quote");
		if (LINE_CITATION.test(text)) fail(file, n, "line-number citation, cite `path#symbol` instead");
		for (const m of text.matchAll(CITATION)) resolveCitation(file, n, m[1], m[2]);
	}

	if (area === "rules") {
		const rules = lines.filter((l) => /^[-*] /.test(l.text));
		if (rules.length === 0) fail(file, 1, "no rules, write one rule per top-level bullet");
		for (const rule of rules) {
			if (!/Code\.?\s+`[^`#\s]+#[^`]+`/.test(rule.text)) fail(file, rule.n, "rule cites no Code `path#symbol`");
			checkGuard(file, rule.n, rule.text);
		}
	}

	const log = logs.find((l) => path.basename(l.dir) === area);
	if (log) {
		const name = path.basename(file);
		if (path.dirname(file) !== log.dir || !ENTRY_FILE.test(name)) {
			fail(file, 1, `${log.noun} entry is not ${area}/<yyyy-mm-dd>-<slug>.md`);
			continue;
		}
		const field = (label) => lines.find((l) => l.text.startsWith(`**${label}**`));
		for (const label of log.fields) if (!field(label)) fail(file, 1, `${log.noun} entry lacks **${label}**`);
		const guard = field("Guard.");
		if (guard) checkGuard(file, guard.n, guard.text);
		const value = (label) => (field(label)?.text.slice(label.length + 4).trim() ?? "").replace(/\|/g, "\\|");
		const title = lines.find((l) => l.text.startsWith("# "))?.text.slice(2).trim() ?? value(log.fields[0]);
		log.entries.push([name.slice(0, 10), title.replace(/\|/g, "\\|"), ...log.cells(value), `[${name}](./${name})`]);
	}
}

for (const log of logs) {
	const index = [
		log.header[0],
		"",
		"Generated by `check-handbook.mjs --index`. Do not edit by hand.",
		"",
		log.header[1],
		"|---|---|---|---|---|",
		...log.entries.map((cells) => `| ${cells.join(" | ")} |`),
		"",
	].join("\n");
	const exists = fs.existsSync(log.indexFile);
	if (writeIndex && (log.entries.length || exists || log.noun === "bug")) {
		fs.mkdirSync(log.dir, { recursive: true });
		fs.writeFileSync(log.indexFile, index);
		notes.push(`wrote ${rel(log.indexFile)} with ${log.entries.length} entries`);
	} else if (!writeIndex && (log.entries.length || exists)) {
		const current = exists ? fs.readFileSync(log.indexFile, "utf8") : "";
		if (current !== index) notes.push(`${rel(log.indexFile)} is stale, the landing unit runs --index`);
	}
}

for (const note of notes) console.log(note);
console.log(logs.map((log) => `${log.entries.length} ${log.noun} entries`).join(", ") + `, ${problems.length} problems`);
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);

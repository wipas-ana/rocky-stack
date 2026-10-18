---
name: handbook
description: "Generate or maintain a per-project handbook in the target repo at docs/handbook/: an overview, business rules, flows, a troubleshooting map, and a bug log, every claim cited to a real file or test. Use for /handbook, when the user must understand a project without reading its code, or when docs/handbook/ exists and a change alters what it says."
disable-model-invocation: true
---

# Handbook

The handbook lets the user understand a project without reading its code. It lives in the target repo at `docs/handbook/` and is committed with the code it describes. The reader is a person, so write every file with the **technical-writing** skill and then the **unslop** skill.

Pick one mode, and say which. A repo with no `docs/handbook/` takes generate mode. A repo that has one takes maintain mode unless the user asks for a rebuild.

## Layout

One Diátaxis mode per file. Never mix modes in one file. Split and link instead.

- `overview.md` is explanation. What the project is for, who uses it, and one mermaid diagram of its main parts.
- `rules/<area>.md` is reference. One business rule per top-level bullet, in plain language.
- `flows/<flow>.md` is reference. One sequence diagram per flow, the data shapes it passes, and its API and database touchpoints. Generate shapes from the authoritative schema or type where one exists.
- `troubleshooting.md` is how-to. Each entry gives a symptom, where to look, which logs to read, and how to check. For "how to check", link the project's verification skill (`.cursor/skills/verify-<app>/`) and its Doctor section and feature files. Do not copy launch or drive steps. If the project has none, suggest `/create-verification-skill`.
- `bugs/<yyyy-mm-dd>-<slug>.md` is one bug per file. `bugs/README.md` is the index, built by the script and never edited by hand.

## Citations

Every claim cites `path#symbol`, where `path` is relative to the repo root and `symbol` is text that appears in that file. Never cite a line number, because lines move.

- A rule bullet ends with `Code` and a `path#symbol` citation, then `Guard` and a test citation, or `unguarded`.
- A bug entry has these lead-ins in this order: `**Symptom.**`, `**Keywords.**`, `**Root cause.**` with a citation, `**Fix.**` with the PR link or commit, and `**Guard.**` with the regression test or `unguarded`.
- Write `unguarded` when no test guards the claim. Never invent a test name. An unguarded rule is a finding to report, and a candidate for the **tdd** skill.
- Keep a bug entry to about five lines. The PR body holds the rest.

```markdown
- WELCOME10 takes 10% off carts of 50 or more. Code `src/pricing.ts#applyDiscount`. Guard `tests/test_pricing.py#test_welcome_discount_needs_minimum_total`.
```

Run the checker after every edit. It fails on a cited path, symbol, or test that does not resolve, on a rule or bug entry with no guard and no `unguarded` marker, on line-number citations, and on long dashes and curly quotes.

```bash
node <handbook-skill>/scripts/check-handbook.mjs --root <repo>
node <handbook-skill>/scripts/check-handbook.mjs --root <repo> --index
```

`<handbook-skill>` is the directory of this file. The first command checks. The second also rebuilds `bugs/README.md`. A stale index is a note, not a failure, so a worker's PR passes before the landing unit rebuilds it.

## What the handbook never holds

- It never explains a surprise in our own code. That is a reshape target per the **no-comments** skill, so record it only as an open `MUST KILL` item in the troubleshooting map, not as an explanation.
- It never replaces a test. A repeated lesson becomes a test or a lint through the **correct** skill, and the handbook points at that check.
- It holds no decision trail. That stays with the **show-me-your-work** skill.

## Parallel safety

When several agents work at once (Orchestrate, Autopilot-full, Autopilot-stack), each worker only adds its own new entry files, such as a new `bugs/` file or a new `rules/<area>.md`. Workers never edit `bugs/README.md` or a file another worker may touch. The landing unit runs `--index` and makes any shared edits after the units land (the **separate-before-serializing-shared-state** principle skill).

## Generate mode

1. Run the **how** skill over the whole project for `overview.md`, then once per subsystem for `flows/`. Write its findings to the files. Do not build a second set of explorers.
2. Run the **why** skill, kept narrow, on the rules whose reason is not plain from the code. Fold its Preserve, Change, Avoid, and Risk set into the rule text. Keep its confidence language.
3. Write `rules/` from the code and its tests. For each rule, find the test that fails when the rule breaks, or mark it `unguarded`.
4. Seed `troubleshooting.md` from error paths, log statements, and the verification skill. Seed `bugs/` only from fixes you can cite (merged PRs, reverts, linked issues).
5. Run the checker with `--index` and fix every problem it prints.
6. Open the change through **Opening a PR** (`../rocky-mode/playbooks/opening-a-pr.md`).

## Maintain mode

Modeled on the **maintain-verification-skill** skill. Edit only `docs/handbook/`. Never edit product code. A claim the code no longer supports is either drift (fix the handbook) or a product regression (report it and keep it out of this PR).

1. Run the checker. Every broken citation is drift.
2. Spawn one read-only subagent per file in `rules/` and `flows/`, all at once. Each compares the file with the current code and returns drift with citations, or none. Pick each subagent's reasoning level and speed per the Subagents section of the **rocky-mode** skill.
3. Sweep recent commits for rules, flows, or touchpoints the handbook does not name. Require a concrete source path before you call one missing.
4. Fix the drift, rerun the checker with `--index`, and re-read every changed file.
5. Report one outcome. **Clean** means nothing changed and no PR. **Changed** means one PR of proven corrections. **Blocked** names exactly what blocked it.

## Reading it during a task

Read only what the task needs. In a bug fix, an explorer searches `bugs/` and `troubleshooting.md` for the symptom's keywords and returns only the matching entries. Treat the handbook as a starting point, and confirm each claim against the code.

For a guided walkthrough of any part, use the **teach** skill. It reads the handbook and the code and explains them diagram by diagram.

**Reply:** the mode, the files written or changed, the checker output, the rules marked `unguarded`, and the PR link.

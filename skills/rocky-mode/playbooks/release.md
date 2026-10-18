### Release

**You own what ships and what runs. Build each version once, promote that same artifact, and wait for the user before every outward step.** Shipping lands verified PRs on trunk (`shipping.md`). Release turns a trunk commit into a versioned, deployed, published build. Resolve the forge per `../references/forges.md`. GitLab is the first-class path, through the local `glab` CLI and the project's own CI, with no cloud agents. GitHub works through `gh`.

Four steps are irreversible or outward-facing: pushing a tag, deploying to production, publishing a release, and a rollback. Each one waits for the user's explicit go, one at a time, even under a full-autonomy grant, unless the user named that exact step.

1. **Follow the repo's convention.** Read the tags (`git tag --list --sort=-v:refname`), `CHANGELOG.md`, the version files (such as `package.json`, `pyproject.toml`, `Cargo.toml`, `Chart.yaml`, or `VERSION`), and any release tooling (`release-please-config.json`, `.releaserc*`, `release.config.*`, `.changeset/`, or a release job in `.gitlab-ci.yml`). Keep its tag prefix, changelog format, and tool. When a tool owns the version, run the tool and never hand-edit what it generates. If the repo has no convention, propose one and wait for the user, because it changes the team's process. The default proposal is SemVer tags `vX.Y.Z`, Conventional Commits, a Keep a Changelog `CHANGELOG.md`, and the CI template in `../references/release-ci.gitlab-ci.yml`.
2. **Pre-flight.** Stop and report if any check fails.
   - Trunk is green at the commit you release, per the forge's CI status in `../references/forges.md`.
   - No P1 incident is open. Check the issue tracker or alerting tool when one is connected, and `docs/handbook/incidents/`. If you cannot tell, ask.
   - The handbook checker passes when the repo has `docs/handbook/` (the **handbook** skill).
   - Every database migration since the last tag is expand and contract, and backward compatible, so the previous version still runs on the new schema. A migration that cannot be reversed, such as a dropped or renamed column, a narrowed type, or a data rewrite with no reverse, blocks the release. Split it into the expand part now and the contract part in a later release.
3. **Compute the version and show why.** Read the commits since the last tag as Conventional Commits. A `!` or a `BREAKING CHANGE` footer bumps MAJOR, or MINOR while the version is `0.y.z`. A `feat` bumps MINOR. A `fix` or `perf` bumps PATCH. Other types release nothing unless the user asks. A pre-release adds or increments `-rc.N`. Show the previous version, the next version, and the commits that set the bump. Classify a commit that breaks the convention by reading its diff, and say so.
4. **Open the release MR.** On a `release/vX.Y.Z` branch, bump the version files and add the `CHANGELOG.md` section in Keep a Changelog form (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`). Generate it from the commits, then edit it for a human reader with the **technical-writing** and **unslop** skills: one line per change a user can see, with MR links and no SHA lists. Run **Opening a PR**. The MR lands through Shipping or the user.
5. **Tag the merge commit.** After the release MR merges, write the new `CHANGELOG.md` section to a notes file and run `git tag -a vX.Y.Z <merge-sha> --file <notes-file>`. Push it with `git push origin vX.Y.Z` after the user's go. Never tag an unmerged branch, and never move or re-push a tag that exists.
6. **Build once, then promote the same artifact.** The tag pipeline builds one immutable artifact or image, tagged with the version and the commit SHA, and records its digest. It deploys that digest to staging and runs the smoke test. After the user's go, it promotes the same digest to production. Never rebuild for production. Watch the pipeline with `glab ci status` and `glab ci view`, or the GitHub commands in `../references/forges.md`. A pre-release tag stops at staging.
7. **Publish.** After the user's go, publish the release with the notes file. On GitLab, run `glab release create vX.Y.Z --notes-file <notes-file>`, or the template's manual `publish-release` job. On GitHub, run `gh release create vX.Y.Z --notes-file <notes-file> --verify-tag`.
8. **Confirm what runs.** Read the version and SHA from the deployed app in staging and production, and compare them with the tag. The app should expose both, through a `/version` endpoint or a startup log line, and every alert should carry them, so the Grok Bot "Alert triage" routine can match an alert to a release. If the app does neither, recommend that change as a Feature. Record the release only in `CHANGELOG.md` and the tag, with no handbook entry, because those two already map each version to its commit and notes and a third copy would drift.

#### Rollback or roll forward

- Turn off the feature flag first when one gates the broken path. It is the fastest kill switch, and it is a production change, so it also waits for the user's go.
- Roll back when the previous version is known good and still runs on the current schema. Redeploy the previous tag's existing artifact, through the template's manual `rollback-production` job with `ROLLBACK_VERSION=vX.Y.Z` or the repo's own deploy command with that version. Never rebuild the old version, and never revert or rewrite history on main. The rollback waits for the user's go.
- Roll forward with a hotfix when a rollback is unsafe, such as after a contract migration ran or after the new version wrote data the old one cannot read, or when the fix is small and proven.
- After either one, run the Incident playbook (`incident.md`). The fix ships as a PATCH release through the hotfix flow below.

#### Hotfix

1. If main has moved past the release, branch `hotfix/vX.Y.Z+1` from tag `vX.Y.Z`, with the next PATCH number in the name. Otherwise fix on main and release as usual.
2. Run Bug fix (`bug-fix.md`) against the hotfix branch for the fix and its regression test. Its MR targets the hotfix branch.
3. Release a PATCH from the hotfix branch through steps 2 to 8 above. The release MR targets the hotfix branch, and the tag goes on its merge commit.
4. Bring the fix back to main. Merge the hotfix branch, or cherry-pick the fix with `git cherry-pick -x`, in its own MR with the regression test. Confirm main has the test before you close the incident.

**Reply:** the version and the commits that set the bump, the pre-flight results, the release MR link, the tag, the artifact digest, the staging smoke result, each go the user gave, the version and SHA running in production, and the release link. For a rollback or hotfix, add what ran, the version now in production, and the incident link.

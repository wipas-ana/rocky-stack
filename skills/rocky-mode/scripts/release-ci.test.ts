import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const path = join(import.meta.dir, "..", "references", "release-ci.gitlab-ci.yml");
const text = readFileSync(path, "utf8");
type Rule = { if?: string; when?: string };
type Job = {
  stage?: string;
  extends?: string;
  rules?: Rule[];
  script?: string[];
  needs?: string[];
  environment?: { name: string };
  release?: Record<string, string>;
};
const ci = Bun.YAML.parse(text) as Record<string, unknown> & { stages: string[] };
const job = (name: string) => ci[name] as Job;
const rules = (name: string) => {
  const own = job(name);
  return own.rules ?? job(own.extends ?? "").rules ?? [];
};
const tagRegex = (rule: Rule) => new RegExp(rule.if!.match(/=~ \/(.*)\/$/)![1]);

describe("release CI template", () => {
  it("says it is a template", () => {
    expect(text.split("\n")[0]).toContain("TEMPLATE");
  });

  it("runs build, test, staging, production, and release in order", () => {
    expect(ci.stages).toEqual(["build", "test", "staging", "production", "release"]);
  });

  it("triggers the build on release tags, including pre-releases", () => {
    const [rule] = rules("build-image");
    expect(tagRegex(rule).test("v1.4.2")).toBe(true);
    expect(tagRegex(rule).test("v2.0.0-rc.1")).toBe(true);
    expect(tagRegex(rule).test("1.4.2")).toBe(false);
  });

  it("tags the image with the version and the short SHA", () => {
    const build = job("build-image").script!.join("\n");
    expect(build).toContain('--tag "$CI_REGISTRY_IMAGE:$CI_COMMIT_TAG"');
    expect(build).toContain('--tag "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"');
  });

  it("promotes the staging artifact to production by hand, without a rebuild", () => {
    const [rule] = rules("deploy-production");
    expect(rule.when).toBe("manual");
    expect(tagRegex(rule).test("v2.0.0-rc.1")).toBe(false);
    expect(job("deploy-production").needs).toContain("deploy-staging");
    expect(job("deploy-staging").script!.join("\n")).toContain('"$IMAGE_REF"');
    expect(job("deploy-production").script!.join("\n")).toContain('"$IMAGE_REF"');
    expect(job("deploy-production").script!.join("\n")).not.toContain("docker build");
  });

  it("publishes the release by hand after production", () => {
    const release = job("publish-release");
    expect(release.rules![0].when).toBe("manual");
    expect(release.needs).toEqual(["deploy-production"]);
    expect(release.release!.tag_name).toBe("$CI_COMMIT_TAG");
  });

  it("rolls back by hand to an existing version's image", () => {
    const rollback = job("rollback-production");
    expect(rollback.rules![0].when).toBe("manual");
    expect(rollback.rules![0].if).toContain("$ROLLBACK_VERSION");
    expect(rollback.environment!.name).toBe("production");
    expect(rollback.script!.join("\n")).toContain('"$CI_REGISTRY_IMAGE:$ROLLBACK_VERSION"');
    expect((ci.variables as Record<string, { description: string }>).ROLLBACK_VERSION.description).toContain("rollback");
  });
});

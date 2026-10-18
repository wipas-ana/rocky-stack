#!/usr/bin/env bun
import { execFileSync } from "node:child_process";

export type ForgeCli = "gh" | "glab";

export function remoteHost(url: string): string | null {
  const trimmed = url.trim();
  const withScheme = trimmed.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)/i);
  if (withScheme) {
    return withScheme[1].toLowerCase() || null;
  }
  const scp = trimmed.match(/^(?:[^@/]+@)?([^/:]+):(?!\/)/);
  if (scp && !/^[a-z]$/i.test(scp[1])) {
    return scp[1].toLowerCase();
  }
  return null;
}

export function detectForge(url: string | null): ForgeCli {
  if (url === null) {
    return "gh";
  }
  const host = remoteHost(url);
  if (host === null || host === "localhost" || url.trim().startsWith("file://")) {
    return "gh";
  }
  if (host === "github.com" || host.endsWith(".github.com")) {
    return "gh";
  }
  return "glab";
}

export function originUrl(repo: string): string | null {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function repoForge(repo: string): ForgeCli {
  return detectForge(originUrl(repo));
}

if (import.meta.main) {
  console.log(repoForge(process.argv[2] ?? process.cwd()));
}

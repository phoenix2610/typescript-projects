#!/usr/bin/env -S node
interface Issue {
  number: number;
  title: string;
  body: string;
  currentLabels: string[];
  removedByHuman: string[];
  createdAt: Date;
  lastActivityAt: Date;
}

interface LabelRule {
  label: string;
  titlePattern?: RegExp;
  bodyPattern?: RegExp;
  requireBoth?: boolean;
}

const RULES: LabelRule[] = [
  { label: "bug", titlePattern: /\b(bug|crash|broken|error|fails?)\b/i },
  { label: "bug", bodyPattern: /\b(TypeError|Traceback|stack trace|exception)\b/ },
  { label: "needs-repro", bodyPattern: /\b(intermittent(?:ly)?|can'?t reproduce|hard to reproduce|not (?:always|consistently) reproducible|happens sometimes|sometimes happens)\b/i },
  { label: "documentation", titlePattern: /\b(docs?|documentation|readme)\b/i },
  { label: "question", titlePattern: /^(how|why|what|is it possible)/i, bodyPattern: /\?/ , requireBoth: true },
  { label: "performance", titlePattern: /\b(slow|performance|timeout|hangs?)\b/i },
  { label: "security", bodyPattern: /\b(vulnerability|CVE-|security|exploit)\b/i },
  { label: "good-first-issue", bodyPattern: /\b(good first issue|beginner.?friendly|easy fix)\b/i },
];

function evaluateRule(issue: Issue, rule: LabelRule): boolean {
  const titleMatch = rule.titlePattern ? rule.titlePattern.test(issue.title) : null;
  const bodyMatch = rule.bodyPattern ? rule.bodyPattern.test(issue.body) : null;

  if (rule.requireBoth) {
    return Boolean(titleMatch) && Boolean(bodyMatch);
  }
  if (rule.titlePattern && rule.bodyPattern) return Boolean(titleMatch) || Boolean(bodyMatch);
  if (rule.titlePattern) return Boolean(titleMatch);
  if (rule.bodyPattern) return Boolean(bodyMatch);
  return false;
}

interface LabelDecision {
  issue: Issue;
  toAdd: string[];
  skippedAsHumanRemoved: string[];
}

function decideLabels(issue: Issue, rules: LabelRule[]): LabelDecision {
  const matched = new Set<string>();
  for (const rule of rules) {
    if (evaluateRule(issue, rule)) matched.add(rule.label);
  }

  const toAdd: string[] = [];
  const skipped: string[] = [];
  for (const label of matched) {
    if (issue.currentLabels.includes(label)) continue;
    if (issue.removedByHuman.includes(label)) {
      skipped.push(label);
      continue;
    }
    toAdd.push(label);
  }

  return { issue, toAdd, skippedAsHumanRemoved: skipped };
}

function staleLabelChanges(issue: Issue, now: Date, staleDays: number): { add: boolean; remove: boolean } {
  const daysSinceActivity = (now.getTime() - issue.lastActivityAt.getTime()) / 86_400_000;
  const isStale = daysSinceActivity >= staleDays;
  const hasLabel = issue.currentLabels.includes("stale");
  return { add: isStale && !hasLabel, remove: !isStale && hasLabel };
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function demo(): void {
  const now = new Date("2026-08-27T12:00:00Z");

  const issues: Issue[] = [
    {
      number: 501,
      title: "App crashes on startup with dark mode enabled",
      body: "Getting a TypeError: Cannot read property 'theme' of undefined when I enable dark mode.",
      currentLabels: [],
      removedByHuman: [],
      createdAt: daysAgo(now, 2),
      lastActivityAt: daysAgo(now, 2),
    },
    {
      number: 502,
      title: "How do I configure a custom retry policy?",
      body: "I've looked through the docs but can't find how to set a custom retry policy. Is it possible?",
      currentLabels: [],
      removedByHuman: [],
      createdAt: daysAgo(now, 40),
      lastActivityAt: daysAgo(now, 40),
    },
    {
      number: 503,
      title: "Login is extremely slow on large accounts",
      body: "For accounts with 10k+ users, login takes over 30 seconds and sometimes times out.",
      currentLabels: ["bug"],
      removedByHuman: [],
      createdAt: daysAgo(now, 10),
      lastActivityAt: daysAgo(now, 5),
    },
    {
      number: 504,
      title: "Fix typo in README installation section",
      body: "The install command in the README is missing a flag. This would be a good first issue for someone new.",
      currentLabels: [],
      removedByHuman: [],
      createdAt: daysAgo(now, 1),
      lastActivityAt: daysAgo(now, 1),
    },
    {
      number: 505,
      title: "Random crash, hard to reproduce",
      body: "This happens sometimes but I can't reproduce it reliably. No stack trace captured yet.",
      currentLabels: [],
      removedByHuman: ["bug"],
      createdAt: daysAgo(now, 60),
      lastActivityAt: daysAgo(now, 60),
    },
    {
      number: 506,
      title: "Potential SSRF vulnerability in webhook URL validation",
      body: "The webhook URL field doesn't validate against internal IP ranges, which could allow an SSRF exploit.",
      currentLabels: ["security"],
      removedByHuman: [],
      createdAt: daysAgo(now, 3),
      lastActivityAt: daysAgo(now, 3),
    },
  ];

  console.log(`processing ${issues.length} issues\n`);

  for (const issue of issues) {
    const decision = decideLabels(issue, RULES);
    const stale = staleLabelChanges(issue, now, 30);

    console.log(`#${issue.number} "${issue.title}"`);
    console.log(`  current: [${issue.currentLabels.join(", ") || "none"}]`);
    if (decision.toAdd.length) console.log(`  + adding: ${decision.toAdd.join(", ")}`);
    if (decision.skippedAsHumanRemoved.length) console.log(`  ! skipped (human removed before): ${decision.skippedAsHumanRemoved.join(", ")}`);
    if (stale.add) console.log(`  + adding: stale (${Math.round((now.getTime() - issue.lastActivityAt.getTime()) / 86_400_000)}d inactive)`);
    if (stale.remove) console.log(`  - removing: stale (recent activity)`);
    if (!decision.toAdd.length && !decision.skippedAsHumanRemoved.length && !stale.add && !stale.remove) {
      console.log(`  (no changes)`);
    }
    console.log();
  }

  console.log(`note: #503 already has "bug" and the rules would match it again — it's correctly`);
  console.log(`skipped (no duplicate), while "performance" is still newly added since that label`);
  console.log(`wasn't present yet. Its body says "sometimes times out", but needs-repro does NOT`);
  console.log(`fire — that phrasing describes a consistent perf problem, not a flaky one, and the`);
  console.log(`rule only matches phrases actually about reproducibility ("can't reproduce",`);
  console.log(`"intermittent", "happens sometimes"), not the bare word "sometimes" on its own.`);
  console.log(`#505 DOES match needs-repro (it literally says "can't reproduce"), and would also`);
  console.log(`match "bug" via its crash language — but a maintainer explicitly removed "bug" from`);
  console.log(`this issue before, so the bot respects that and skips re-adding only that label,`);
  console.log(`while still adding "needs-repro" since that one was never touched by a human.`);
  console.log(`#506 is already correctly labeled "security" and gets no redundant action.`);
}

interface GitHubIssueSummary {
  number: number;
  title: string;
  body: string | null;
  labels: { name: string }[];
  created_at: string;
  updated_at: string;
}

async function fetchOpenIssues(repo: string, token: string): Promise<GitHubIssueSummary[]> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
  const all = (await response.json()) as (GitHubIssueSummary & { pull_request?: unknown })[];
  return all.filter((i) => !i.pull_request);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--demo") || args.length === 0) {
    demo();
    return;
  }
  if (args[0] !== "sort") {
    console.log("usage: issue_sorter.ts sort --repo org/repo --token TOKEN");
    return;
  }
  const repoIdx = args.indexOf("--repo");
  const tokenIdx = args.indexOf("--token");
  const repo = repoIdx >= 0 ? args[repoIdx + 1] : undefined;
  const token = tokenIdx >= 0 ? args[tokenIdx + 1] : undefined;
  if (!repo || !token) {
    console.error("--repo and --token are required");
    process.exitCode = 1;
    return;
  }

  try {
    const issues = await fetchOpenIssues(repo, token);
    console.log(`fetched ${issues.length} open issues (non-PR) from ${repo}`);
    let totalToAdd = 0;
    for (const summary of issues) {
      const issue: Issue = {
        number: summary.number,
        title: summary.title,
        body: summary.body ?? "",
        currentLabels: summary.labels.map((l) => l.name),
        removedByHuman: [],
        createdAt: new Date(summary.created_at),
        lastActivityAt: new Date(summary.updated_at),
      };
      const decision = decideLabels(issue, RULES);
      if (decision.toAdd.length) {
        console.log(`  #${issue.number}: would add [${decision.toAdd.join(", ")}]`);
        totalToAdd += decision.toAdd.length;
      }
    }
    console.log(`\n${totalToAdd} label additions identified across ${issues.length} issues (read-only preview — no labels were actually applied)`);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

main();

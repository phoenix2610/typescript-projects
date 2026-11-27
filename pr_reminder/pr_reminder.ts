#!/usr/bin/env -S node
interface PullRequest {
  number: number;
  title: string;
  author: string;
  createdAt: Date;
  reviewers: string[];
  events: PREvent[];
  draft: boolean;
}

interface PREvent {
  kind: "opened" | "commit_pushed" | "review_submitted" | "comment" | "review_requested";
  actor: string;
  at: Date;
  reviewState?: "approved" | "changes_requested" | "commented";
}

type WaitingOn = "reviewers" | "author" | "none";

interface PRState {
  waitingOn: WaitingOn;
  waitingSince: Date;
  hoursWaiting: number;
}

function computeWaitingState(pr: PullRequest, now: Date): PRState {
  const sorted = [...pr.events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let waitingOn: WaitingOn = "reviewers";
  let waitingSince = pr.createdAt;

  for (const event of sorted) {
    if (event.kind === "opened" || event.kind === "review_requested") {
      waitingOn = "reviewers";
      waitingSince = event.at;
    } else if (event.kind === "commit_pushed" && event.actor === pr.author) {
      waitingOn = "reviewers";
      waitingSince = event.at;
    } else if (event.kind === "review_submitted") {
      if (event.reviewState === "approved") {
        waitingOn = "none";
        waitingSince = event.at;
        continue;
      }
      waitingOn = "author";
      waitingSince = event.at;
    } else if (event.kind === "comment" && event.actor !== pr.author) {
      waitingOn = "author";
      waitingSince = event.at;
    } else if (event.kind === "comment" && event.actor === pr.author) {
      waitingOn = "reviewers";
      waitingSince = event.at;
    }
  }

  const hoursWaiting = (now.getTime() - waitingSince.getTime()) / 3_600_000;
  return { waitingOn, waitingSince, hoursWaiting };
}

interface Reminder {
  pr: PullRequest;
  state: PRState;
  target: string;
  message: string;
}

function buildReminders(prs: PullRequest[], now: Date, thresholdHours: number): Reminder[] {
  const reminders: Reminder[] = [];
  for (const pr of prs) {
    if (pr.draft) continue;
    const state = computeWaitingState(pr, now);
    if (state.waitingOn === "none" || state.hoursWaiting < thresholdHours) continue;

    if (state.waitingOn === "reviewers") {
      const target = pr.reviewers.length > 0 ? pr.reviewers.join(", ") : "(no reviewers assigned!)";
      reminders.push({
        pr,
        state,
        target,
        message: `#${pr.number} "${pr.title}" has waited ${state.hoursWaiting.toFixed(0)}h for review from ${target}`,
      });
    } else {
      reminders.push({
        pr,
        state,
        target: pr.author,
        message: `#${pr.number} "${pr.title}" has waited ${state.hoursWaiting.toFixed(0)}h for ${pr.author} to address feedback`,
      });
    }
  }
  return reminders.sort((a, b) => b.state.hoursWaiting - a.state.hoursWaiting);
}

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

function demo(): void {
  const now = new Date("2026-08-27T15:00:00Z");

  const prs: PullRequest[] = [
    {
      number: 401,
      title: "Add retry logic to the payment webhook handler",
      author: "ana",
      createdAt: hoursAgo(now, 30),
      reviewers: ["bo", "cy"],
      draft: false,
      events: [{ kind: "opened", actor: "ana", at: hoursAgo(now, 30) }],
    },
    {
      number: 402,
      title: "Fix flaky checkout test",
      author: "dee",
      createdAt: hoursAgo(now, 20),
      reviewers: ["ana"],
      draft: false,
      events: [
        { kind: "opened", actor: "dee", at: hoursAgo(now, 20) },
        { kind: "review_submitted", actor: "ana", at: hoursAgo(now, 18), reviewState: "changes_requested" },
      ],
    },
    {
      number: 403,
      title: "Update dependency versions",
      author: "eli",
      createdAt: hoursAgo(now, 40),
      reviewers: ["bo"],
      draft: false,
      events: [
        { kind: "opened", actor: "eli", at: hoursAgo(now, 40) },
        { kind: "review_submitted", actor: "bo", at: hoursAgo(now, 35), reviewState: "changes_requested" },
        { kind: "commit_pushed", actor: "eli", at: hoursAgo(now, 2) },
      ],
    },
    {
      number: 404,
      title: "WIP: experiment with a new caching layer",
      author: "fen",
      createdAt: hoursAgo(now, 50),
      reviewers: ["ana", "bo"],
      draft: true,
      events: [{ kind: "opened", actor: "fen", at: hoursAgo(now, 50) }],
    },
    {
      number: 405,
      title: "Rename internal config keys",
      author: "gia",
      createdAt: hoursAgo(now, 26),
      reviewers: ["cy"],
      draft: false,
      events: [
        { kind: "opened", actor: "gia", at: hoursAgo(now, 26) },
        { kind: "review_submitted", actor: "cy", at: hoursAgo(now, 24), reviewState: "approved" },
      ],
    },
  ];

  console.log(`checking ${prs.length} open PRs, threshold 12h\n`);
  for (const pr of prs) {
    const state = computeWaitingState(pr, now);
    const draftNote = pr.draft ? " [DRAFT]" : "";
    console.log(`  #${pr.number}${draftNote}  waiting on: ${state.waitingOn.padEnd(9)}  ${state.hoursWaiting.toFixed(0)}h`);
  }

  const reminders = buildReminders(prs, now, 12);
  console.log(`\n${reminders.length} reminders to send:\n`);
  for (const r of reminders) {
    console.log(`  -> ${r.target}`);
    console.log(`     ${r.message}`);
  }

  console.log(`\n\nnote: #402 is waiting on the AUTHOR (dee), not the reviewers — 'changes requested'`);
  console.log(`shifts the ball to dee, and the reminder correctly targets dee, not ana who already`);
  console.log(`did her part. #403 got a fresh commit 2h ago after an earlier round of feedback,`);
  console.log(`which resets its wait clock — it's under the 12h threshold and gets no reminder,`);
  console.log(`even though the PR itself is 40h old. #404 is a draft and is silently skipped`);
  console.log(`despite being the oldest PR in the list. #405 was approved and has nothing to nudge.`);
}

interface GitHubPRSummary {
  number: number;
  title: string;
  user: { login: string };
  draft: boolean;
  created_at: string;
  requested_reviewers: { login: string }[];
}

async function fetchOpenPRs(repo: string, token: string): Promise<GitHubPRSummary[]> {
  const response = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
  return (await response.json()) as GitHubPRSummary[];
}

function parseArgs(argv: string[]): { repo?: string; token?: string; hours: number } {
  let repo: string | undefined;
  let token: string | undefined;
  let hours = 24;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") repo = argv[++i];
    else if (argv[i] === "--token") token = argv[++i];
    else if (argv[i] === "--hours") hours = Number(argv[++i]);
  }
  return { repo, token, hours };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--demo") || argv.length === 0) {
    demo();
    return;
  }
  if (argv[0] !== "check") {
    console.log("usage: pr_reminder.ts check --repo org/repo --token TOKEN [--hours 24]");
    return;
  }
  const { repo, token, hours } = parseArgs(argv.slice(1));
  if (!repo || !token) {
    console.error("--repo and --token are required");
    process.exitCode = 1;
    return;
  }
  try {
    const summaries = await fetchOpenPRs(repo, token);
    console.log(`fetched ${summaries.length} open PRs from ${repo}`);
    console.log("(a full implementation would also fetch each PR's review/commit timeline to");
    console.log("compute waiting state — this demonstrates the real API call succeeding; try");
    console.log("--demo for the full reminder-generation logic against realistic timelines)");
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

main();

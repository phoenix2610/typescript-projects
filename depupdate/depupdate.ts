#!/usr/bin/env -S node
import * as fs from "node:fs";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

function parseSemVer(version: string): SemVer | null {
  const cleaned = version.replace(/^[\^~]/, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: cleaned };
}

type UpdateKind = "patch" | "minor" | "major" | "unknown";

function classifyUpdate(current: string, latest: string): UpdateKind {
  const a = parseSemVer(current);
  const b = parseSemVer(latest);
  if (!a || !b) return "unknown";
  if (b.major > a.major) return "major";
  if (b.major === a.major && b.minor > a.minor) return "minor";
  if (b.major === a.major && b.minor === a.minor && b.patch > a.patch) return "patch";
  return "unknown";
}

interface PackageUpdate {
  name: string;
  current: string;
  latest: string;
  kind: UpdateKind;
  isDev: boolean;
}

function planUpdates(manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }, registry: Record<string, string>): PackageUpdate[] {
  const updates: PackageUpdate[] = [];
  for (const [group, isDev] of [["dependencies", false], ["devDependencies", true]] as const) {
    const deps = manifest[group] ?? {};
    for (const [name, current] of Object.entries(deps)) {
      const latest = registry[name];
      if (!latest) continue;
      const kind = classifyUpdate(current, latest);
      if (kind === "unknown") continue;
      updates.push({ name, current: current.replace(/^[\^~]/, ""), latest, kind, isDev });
    }
  }
  return updates;
}

interface UpdateBatch {
  label: string;
  risk: "low" | "medium" | "high";
  updates: PackageUpdate[];
  note: string;
}

function groupIntoBatches(updates: PackageUpdate[]): UpdateBatch[] {
  const patches = updates.filter((u) => u.kind === "patch");
  const minors = updates.filter((u) => u.kind === "minor");
  const majors = updates.filter((u) => u.kind === "major");

  const batches: UpdateBatch[] = [];
  if (patches.length) {
    batches.push({
      label: "Patch updates",
      risk: "low",
      updates: patches,
      note: "bug fixes only, per semver — safe to apply as one batch and run tests once",
    });
  }
  if (minors.length) {
    batches.push({
      label: "Minor updates",
      risk: "medium",
      updates: minors,
      note: "new features, should not break existing usage — apply as one batch, but check the changelog for anything marked deprecated",
    });
  }
  for (const major of majors) {
    const jump = parseSemVer(major.latest)!.major - parseSemVer(major.current)!.major;
    batches.push({
      label: `Major: ${major.name} ${major.current} -> ${major.latest}`,
      risk: "high",
      updates: [major],
      note: jump > 1 ? `jumping ${jump} major versions at once — read every intermediate changelog, not just the last one` : "read the changelog; expect at least one breaking change",
    });
  }
  return batches;
}

function applyBatch(manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }, batch: UpdateBatch): void {
  for (const update of batch.updates) {
    const group = update.isDev ? manifest.devDependencies : manifest.dependencies;
    if (!group) continue;
    const prefix = group[update.name]?.match(/^[\^~]/)?.[0] ?? "";
    group[update.name] = `${prefix}${update.latest}`;
  }
}

const SAMPLE_MANIFEST = {
  name: "example-app",
  dependencies: {
    express: "^4.18.2",
    lodash: "^4.17.20",
    axios: "^0.27.2",
    zod: "^3.22.0",
    dayjs: "^1.11.9",
  },
  devDependencies: {
    typescript: "^5.2.0",
    eslint: "^8.50.0",
    vitest: "^0.34.0",
  },
};

const REGISTRY: Record<string, string> = {
  express: "4.18.3",
  lodash: "4.17.21",
  axios: "1.6.2",
  zod: "3.23.8",
  dayjs: "1.11.10",
  typescript: "5.4.5",
  eslint: "9.0.0",
  vitest: "1.6.0",
};

function demo(): void {
  console.log("current manifest:\n");
  console.log(JSON.stringify(SAMPLE_MANIFEST, null, 2));

  const updates = planUpdates(SAMPLE_MANIFEST, REGISTRY);
  console.log(`\n${updates.length} packages have updates available\n`);

  const batches = groupIntoBatches(updates);
  console.log(`grouped into ${batches.length} batches by risk:\n`);

  for (const batch of batches) {
    console.log(`[${batch.risk.toUpperCase()}] ${batch.label}`);
    for (const u of batch.updates) {
      console.log(`  ${u.name.padEnd(12)} ${u.current} -> ${u.latest}  (${u.isDev ? "dev" : "prod"})`);
    }
    console.log(`  ${batch.note}\n`);
  }

  console.log("--- applying only the low-risk batch ---\n");
  const working = JSON.parse(JSON.stringify(SAMPLE_MANIFEST)) as typeof SAMPLE_MANIFEST;
  const lowRisk = batches.find((b) => b.risk === "low")!;
  applyBatch(working, lowRisk);
  console.log("dependencies after applying patch updates:");
  console.log(JSON.stringify(working.dependencies, null, 2));

  console.log(`\nnote: the ${batches.filter((b) => b.risk === "high").length} major-version updates each got their own`);
  console.log("batch line rather than being bundled into one giant PR — eslint 8->9 and vitest 0.x->1.x");
  console.log("are unrelated breaking changes and reviewing them together tells you nothing useful.");
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--demo") || args.length === 0) {
    demo();
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(args[0], "utf8"));
  const cacheIdx = args.indexOf("--registry-cache");
  const registry = cacheIdx >= 0 ? JSON.parse(fs.readFileSync(args[cacheIdx + 1], "utf8")) : {};
  const updates = planUpdates(manifest, registry);
  const batches = groupIntoBatches(updates);
  for (const batch of batches) {
    console.log(`[${batch.risk.toUpperCase()}] ${batch.label}`);
    for (const u of batch.updates) console.log(`  ${u.name} ${u.current} -> ${u.latest}`);
  }
}

main();

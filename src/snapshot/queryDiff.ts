import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParseObjectData } from "../types.js";
import { diffObjects, type FieldDiff } from "./diff.js";

export interface QueryCapture {
  label: string;
  className: string;
  where?: Record<string, unknown>;
  capturedAt: string;
  results: ParseObjectData[];
}

export interface QueryDiffSummary {
  added: string[];
  removed: string[];
  modified: { objectId: string; diffs: FieldDiff[] }[];
  beforeCapturedAt: string;
  afterCapturedAt: string;
  reportMdPath: string;
  reportCsvPath: string;
}

/**
 * Resolves the directory where captures/reports for a given label are stored.
 *
 * @param snapshotDir - Root directory where snapshots are written.
 * @param label - Capture label.
 * @returns The path `snapshotDir/query/<label>`.
 */
const labelDir = (snapshotDir: string, label: string): string =>
  join(snapshotDir, "query", label);

/**
 * Persists a query result capture as a timestamped JSON file.
 *
 * @param capture - Capture payload (label, query, results, timestamp).
 * @param snapshotDir - Root directory where snapshots are written.
 * @returns The path of the written `.json` file under `snapshotDir/query/<label>/`.
 */
export const writeQueryCapture = async (
  capture: QueryCapture,
  snapshotDir: string,
): Promise<string> => {
  const dir = labelDir(snapshotDir, capture.label);
  await mkdir(dir, { recursive: true });

  const timestamp = capture.capturedAt.replace(/[:.]/g, "-");
  const filePath = join(dir, `${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(capture, null, 2), "utf8");

  return filePath;
};

/**
 * Lists capture files for a label in chronological order (filename timestamps sort lexicographically).
 *
 * @param snapshotDir - Root directory where snapshots are written.
 * @param label - Capture label to list.
 * @returns Sorted capture file paths, or an empty list if the label directory doesn't exist yet.
 */
const listCaptureFiles = async (snapshotDir: string, label: string): Promise<string[]> => {
  const dir = labelDir(snapshotDir, label);
  try {
    const entries = await readdir(dir);
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
};

/**
 * Reads and parses a previously written query capture JSON file.
 *
 * @param filePath - Path of the `.json` capture file.
 * @returns The parsed {@link QueryCapture}.
 */
const readCapture = async (filePath: string): Promise<QueryCapture> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as QueryCapture;
};

/**
 * Indexes results by `objectId` for O(1) before/after lookups.
 *
 * @param results - Captured query results.
 * @returns A map of `objectId` to its object data; entries without a string `objectId` are skipped.
 */
const indexById = (results: ParseObjectData[]): Map<string, ParseObjectData> => {
  const index = new Map<string, ParseObjectData>();
  for (const result of results) {
    const objectId = result.objectId;
    if (typeof objectId === "string") {
      index.set(objectId, result);
    }
  }
  return index;
};

/**
 * Renders the added/removed/modified sets into a human-readable markdown report.
 *
 * @param label - Capture label being compared.
 * @param before - Older capture used as the diff baseline.
 * @param after - Newer capture being compared against `before`.
 * @param added - Object ids present in `after` but not in `before`.
 * @param removed - Object ids present in `before` but not in `after`.
 * @param modified - Object ids present in both, with their per-field {@link FieldDiff} list.
 * @returns The rendered markdown report.
 */
const renderMarkdown = (
  label: string,
  before: QueryCapture,
  after: QueryCapture,
  added: string[],
  removed: string[],
  modified: { objectId: string; diffs: FieldDiff[] }[],
): string => {
  const lines: string[] = [];
  lines.push(`# Query Diff — ${label}`);
  lines.push("");
  lines.push(`- Before: ${before.capturedAt} (${before.results.length} results)`);
  lines.push(`- After: ${after.capturedAt} (${after.results.length} results)`);
  lines.push("");
  lines.push(`## Added (${added.length})`);
  for (const objectId of added) {
    lines.push(`- \`${objectId}\``);
  }
  lines.push("");
  lines.push(`## Removed (${removed.length})`);
  for (const objectId of removed) {
    lines.push(`- \`${objectId}\``);
  }
  lines.push("");
  lines.push(`## Modified (${modified.length})`);
  for (const entry of modified) {
    lines.push(`### ${entry.objectId}`);
    lines.push("| Field | Before | After |");
    lines.push("|---|---|---|");
    for (const diff of entry.diffs) {
      lines.push(`| ${diff.field} | ${JSON.stringify(diff.before)} | ${JSON.stringify(diff.after)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

/**
 * Renders the same added/removed/modified sets as CSV rows, for spreadsheet-friendly review.
 *
 * @param added - Object ids present in `after` but not in `before`.
 * @param removed - Object ids present in `before` but not in `after`.
 * @param modified - Object ids present in both, with their per-field {@link FieldDiff} list.
 * @returns The rendered CSV content, one row per added/removed object and per modified field.
 */
const renderCsv = (
  added: string[],
  removed: string[],
  modified: { objectId: string; diffs: FieldDiff[] }[],
): string => {
  const lines = ["objectId,status,field,before,after"];
  for (const objectId of added) {
    lines.push(`${objectId},added,,,`);
  }
  for (const objectId of removed) {
    lines.push(`${objectId},removed,,,`);
  }
  for (const entry of modified) {
    for (const diff of entry.diffs) {
      const before = JSON.stringify(diff.before).replace(/"/g, '""');
      const after = JSON.stringify(diff.after).replace(/"/g, '""');
      lines.push(`${entry.objectId},modified,${diff.field},"${before}","${after}"`);
    }
  }
  return lines.join("\n");
};

export interface DiffQuerySnapshotsOptions {
  label: string;
  before?: string;
  after?: string;
  snapshotDir: string;
}

/**
 * Compares two captures of the same label and writes a .md + .csv diff report of added/removed/modified objects.
 * Requires at least two captures to exist for the label.
 *
 * @param options - Diff options.
 * @param options.label - Capture label to diff.
 * @param options.before - Substring identifying the "before" capture file; defaults to the oldest capture.
 * @param options.after - Substring identifying the "after" capture file; defaults to the most recent capture.
 * @param options.snapshotDir - Root directory where snapshots are written.
 * @returns A {@link QueryDiffSummary} with the added/removed/modified ids and the written report paths.
 * @throws If fewer than two captures exist for `label`, or the `before`/`after` files cannot be resolved.
 */
export const diffQuerySnapshots = async (
  options: DiffQuerySnapshotsOptions,
): Promise<QueryDiffSummary> => {
  const files = await listCaptureFiles(options.snapshotDir, options.label);
  if (files.length < 2) {
    throw new Error(
      `Not enough captures for label "${options.label}" to compute a diff (found ${files.length})`,
    );
  }

  const beforePath = options.before
    ? files.find((file) => file.includes(options.before as string))
    : files[0];
  const afterPath = options.after
    ? files.find((file) => file.includes(options.after as string))
    : files[files.length - 1];

  if (!beforePath || !afterPath) {
    throw new Error("Could not resolve before/after capture files for the given label");
  }

  const before = await readCapture(beforePath);
  const after = await readCapture(afterPath);

  const beforeIndex = indexById(before.results);
  const afterIndex = indexById(after.results);

  const added: string[] = [];
  const removed: string[] = [];
  const modified: { objectId: string; diffs: FieldDiff[] }[] = [];

  for (const objectId of afterIndex.keys()) {
    if (!beforeIndex.has(objectId)) {
      added.push(objectId);
    }
  }
  for (const objectId of beforeIndex.keys()) {
    if (!afterIndex.has(objectId)) {
      removed.push(objectId);
    }
  }
  for (const [objectId, beforeObject] of beforeIndex) {
    const afterObject = afterIndex.get(objectId);
    if (!afterObject) continue;
    const diffs = diffObjects(beforeObject, afterObject);
    if (diffs.length > 0) {
      modified.push({ objectId, diffs });
    }
  }

  const dir = labelDir(options.snapshotDir, options.label);
  const timestamp = after.capturedAt.replace(/[:.]/g, "-");
  const reportMdPath = join(dir, `diff_${timestamp}.md`);
  const reportCsvPath = join(dir, `diff_${timestamp}.csv`);

  await writeFile(reportMdPath, renderMarkdown(options.label, before, after, added, removed, modified), "utf8");
  await writeFile(reportCsvPath, renderCsv(added, removed, modified), "utf8");

  return {
    added,
    removed,
    modified,
    beforeCapturedAt: before.capturedAt,
    afterCapturedAt: after.capturedAt,
    reportMdPath,
    reportCsvPath,
  };
};

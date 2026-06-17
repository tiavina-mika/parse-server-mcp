import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParseObjectData } from "../types.js";

export type SnapshotOperation = "create" | "update" | "delete";

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Structural equality via JSON serialization; sufficient here since Parse object fields are JSON-safe values.
 *
 * @param a - First value to compare.
 * @param b - Second value to compare.
 * @returns `true` if `a` and `b` serialize to the same JSON string.
 */
const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Computes the per-field differences between two object states.
 *
 * @param before - Object state before the change, or `null` if it did not exist (create case).
 * @param after - Object state after the change, or `null` if it no longer exists (delete case).
 * @returns The list of {@link FieldDiff} for fields whose value changed.
 */
export const diffObjects = (
  before: ParseObjectData | null,
  after: ParseObjectData | null,
): FieldDiff[] => {
  const fields = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  const diffs: FieldDiff[] = [];
  for (const field of fields) {
    const beforeValue = before ? before[field] : undefined;
    const afterValue = after ? after[field] : undefined;
    if (!deepEqual(beforeValue, afterValue)) {
      diffs.push({ field, before: beforeValue, after: afterValue });
    }
  }
  return diffs;
};

/**
 * Formats a field value for the markdown diff table.
 *
 * @param value - Field value to format.
 * @returns `"(absent)"` for `undefined`, `"(deleted)"` for `null`, otherwise the raw string or JSON-stringified value.
 */
const formatValue = (value: unknown): string => {
  if (value === undefined) return "(absent)";
  if (value === null) return "(deleted)";
  return typeof value === "string" ? value : JSON.stringify(value);
};

/**
 * Renders the full before/after snapshot (raw JSON + field diff table) as markdown.
 *
 * @param className - Name of the Parse class.
 * @param objectId - Id of the snapshotted object.
 * @param operation - Operation that triggered the snapshot.
 * @param before - Object state before the operation, or `null` if it did not exist.
 * @param after - Object state after the operation, or `null` if it was deleted.
 * @param diffs - Per-field differences between `before` and `after`.
 * @returns The rendered markdown document.
 */
const renderMarkdown = (
  className: string,
  objectId: string,
  operation: SnapshotOperation,
  before: ParseObjectData | null,
  after: ParseObjectData | null,
  diffs: FieldDiff[],
): string => {
  const lines: string[] = [];
  lines.push(`# Snapshot — ${className} / ${objectId}`);
  lines.push("");
  lines.push(`- Operation: ${operation}`);
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Before");
  lines.push("```json");
  lines.push(JSON.stringify(before, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## After");
  lines.push("```json");
  lines.push(after === null ? '"(deleted)"' : JSON.stringify(after, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Modified fields");
  lines.push("| Field | Before | After |");
  lines.push("|---|---|---|");
  for (const diff of diffs) {
    lines.push(`| ${diff.field} | ${formatValue(diff.before)} | ${formatValue(diff.after)} |`);
  }
  lines.push("");
  return lines.join("\n");
};

export interface WriteSnapshotOptions {
  snapshotDir: string;
}

/**
 * Writes a markdown snapshot of a Parse object's before/after state for `update`/`delete` operations,
 * so destructive changes always leave an audit trail (see project security rules).
 *
 * @param className - Name of the Parse class.
 * @param objectId - Id of the snapshotted object.
 * @param operation - Operation that triggered the snapshot.
 * @param before - Object state before the operation, or `null` if it did not exist.
 * @param after - Object state after the operation, or `null` if it was deleted.
 * @param options - Snapshot write options.
 * @param options.snapshotDir - Root directory where snapshots are written.
 * @returns The path of the written `.md` file.
 */
export const writeSnapshot = async (
  className: string,
  objectId: string,
  operation: SnapshotOperation,
  before: ParseObjectData | null,
  after: ParseObjectData | null,
  options: WriteSnapshotOptions,
): Promise<string> => {
  const diffs = diffObjects(before, after);
  const markdown = renderMarkdown(className, objectId, operation, before, after, diffs);

  const dir = join(options.snapshotDir, className);
  await mkdir(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(dir, `${objectId}_${timestamp}.md`);
  await writeFile(filePath, markdown, "utf8");

  return filePath;
};

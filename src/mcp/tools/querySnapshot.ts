import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CrudService } from "../../parse/crud.js";
import type { Config } from "../../config.js";
import { writeQueryCapture, diffQuerySnapshots, type QueryCapture } from "../../snapshot/queryDiff.js";
import { runTool } from "../toolResult.js";

/**
 * Registers the `parse_snapshot_query`/`parse_diff_query_snapshots` MCP tools for capturing
 * and comparing query result sets over time.
 *
 * @param server - MCP server to register the tools on.
 * @param crud - CRUD service used to run the captured queries.
 * @param config - Resolved app config (used for `snapshotDir`).
 */
export const registerQuerySnapshotTools = (
  server: McpServer,
  crud: CrudService,
  config: Config,
): void => {
  server.registerTool(
    "parse_snapshot_query",
    {
      description:
        "Run a parse_find query and write a timestamped JSON capture under snapshots/query/<label>/, so it can be compared later with parse_diff_query_snapshots.",
      inputSchema: {
        label: z.string(),
        className: z.string(),
        where: z.record(z.string(), z.unknown()).optional(),
        order: z.string().optional(),
        keys: z.array(z.string()).optional(),
        include: z.array(z.string()).optional(),
      },
    },
    async ({ label, className, where, order, keys, include }) =>
      runTool(async () => {
        const { results } = await crud.findObjects(className, { where, order, keys, include });
        const capture: QueryCapture = {
          label,
          className,
          where,
          capturedAt: new Date().toISOString(),
          results,
        };
        const filePath = await writeQueryCapture(capture, config.snapshotDir);
        return { filePath, count: results.length, capturedAt: capture.capturedAt };
      }),
  );

  server.registerTool(
    "parse_diff_query_snapshots",
    {
      description:
        "Compare two captures of the same label (by default the oldest and the most recent) and write a .md + .csv report of added/removed/modified objects.",
      inputSchema: {
        label: z.string(),
        before: z.string().optional(),
        after: z.string().optional(),
      },
    },
    async ({ label, before, after }) =>
      runTool(() => diffQuerySnapshots({ label, before, after, snapshotDir: config.snapshotDir })),
  );
};

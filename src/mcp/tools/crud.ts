import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CrudService } from "../../parse/crud.js";
import type { Config } from "../../config.js";
import { writeSnapshot } from "../../snapshot/diff.js";
import { runTool } from "../toolResult.js";

const whereSchema = z.record(z.string(), z.unknown()).optional();

/**
 * Registers the `parse_find`/`parse_get`/`parse_create`/`parse_update`/`parse_delete` MCP tools,
 * wiring schema validation and snapshot writes for mutating operations.
 *
 * @param server - MCP server to register the tools on.
 * @param crud - CRUD service used to talk to Parse.
 * @param config - Resolved app config (used for `snapshotEnabled`/`snapshotDir`).
 */
export const registerCrudTools = (
  server: McpServer,
  crud: CrudService,
  config: Config,
): void => {
  server.registerTool(
    "parse_find",
    {
      description:
        "Search for Parse objects in a class, with a where filter (raw Parse format, supports pointers), sorting, pagination, and pointer include.",
      inputSchema: {
        className: z.string(),
        where: whereSchema,
        limit: z.number().int().min(1).max(1000).optional(),
        skip: z.number().int().min(0).optional(),
        order: z.string().optional(),
        keys: z.array(z.string()).optional(),
        include: z.array(z.string()).optional(),
      },
    },
    async ({ className, where, limit, skip, order, keys, include }) =>
      runTool(() => crud.findObjects(className, { where, limit, skip, order, keys, include })),
  );

  server.registerTool(
    "parse_get",
    {
      description:
        "Retrieve a Parse object by class + objectId, with optional pointer resolution via include.",
      inputSchema: {
        className: z.string(),
        objectId: z.string(),
        include: z.array(z.string()).optional(),
      },
    },
    async ({ className, objectId, include }) =>
      runTool(() => crud.getObject(className, objectId, include)),
  );

  server.registerTool(
    "parse_create",
    {
      description:
        "Create a Parse object after validating the data against the class schema (types, required fields, pointers).",
      inputSchema: {
        className: z.string(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async ({ className, data }) => runTool(() => crud.createObject(className, data)),
  );

  server.registerTool(
    "parse_update",
    {
      description:
        "Update a Parse object after validating the modified fields, then generate a markdown snapshot of the before/after diff.",
      inputSchema: {
        className: z.string(),
        objectId: z.string(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async ({ className, objectId, data }) =>
      runTool(async () => {
        const { before, after } = await crud.updateObject(className, objectId, data);
        let snapshotPath: string | undefined;
        if (config.snapshotEnabled) {
          snapshotPath = await writeSnapshot(className, objectId, "update", before, after, {
            snapshotDir: config.snapshotDir,
          });
        }
        return { object: after, snapshotPath };
      }),
  );

  server.registerTool(
    "parse_delete",
    {
      description:
        "Delete a Parse object after capturing its state in a markdown snapshot (the object no longer exists after the operation).",
      inputSchema: {
        className: z.string(),
        objectId: z.string(),
      },
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ className, objectId }) =>
      runTool(async () => {
        const { before } = await crud.deleteObject(className, objectId);
        let snapshotPath: string | undefined;
        if (config.snapshotEnabled) {
          snapshotPath = await writeSnapshot(className, objectId, "delete", before, null, {
            snapshotDir: config.snapshotDir,
          });
        }
        return { deleted: true, snapshotPath };
      }),
  );
};

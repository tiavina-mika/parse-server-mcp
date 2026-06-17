import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SchemaService } from "../../parse/schema.js";
import { runTool } from "../toolResult.js";

/**
 * Registers the `parse_list_schemas`/`parse_get_schema` MCP tools for introspecting Parse class definitions.
 *
 * @param server - MCP server to register the tools on.
 * @param schemaService - Schema service used to read Parse class definitions.
 */
export const registerSchemaTools = (server: McpServer, schemaService: SchemaService): void => {
  server.registerTool(
    "parse_list_schemas",
    {
      description: "List all available Parse classes with their fields.",
      inputSchema: {},
    },
    async () => runTool(() => schemaService.listSchemas()),
  );

  server.registerTool(
    "parse_get_schema",
    {
      description:
        "Retrieve the detailed schema of a Parse class (fields, types, class-level permissions).",
      inputSchema: { className: z.string() },
    },
    async ({ className }) => runTool(() => schemaService.getSchema(className)),
  );
};

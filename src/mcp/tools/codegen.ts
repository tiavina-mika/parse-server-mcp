import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config.js";
import type { SchemaService } from "../../parse/schema.js";
import { writeTypesFiles } from "../../codegen/generateTypes.js";
import { runTool } from "../toolResult.js";

/**
 * Registers the `parse_generate_types` MCP tool, which converts Parse class schemas into
 * `.types.ts` TypeScript interfaces written to `config.typesDir`.
 *
 * @param server - MCP server to register the tool on.
 * @param schemaService - Schema service used to read Parse class definitions.
 * @param config - Resolved app config (used for `typesDir`).
 */
export const registerCodegenTools = (
  server: McpServer,
  schemaService: SchemaService,
  config: Config,
): void => {
  server.registerTool(
    "parse_generate_types",
    {
      description:
        "Generate TypeScript .types.ts interfaces from Parse class schemas, written to the configured types directory. Generates a single class when className is given, otherwise every class.",
      inputSchema: { className: z.string().optional() },
    },
    async ({ className }) =>
      runTool(async () => {
        const schemas = className
          ? [await schemaService.getSchema(className)]
          : await schemaService.listSchemas();
        const filePaths = await writeTypesFiles(schemas, { outputDir: config.typesDir });
        return { filePaths };
      }),
  );
};

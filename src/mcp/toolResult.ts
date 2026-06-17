import type { ValidationError } from "../types.js";

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResponse {
  [x: string]: unknown;
  content: McpTextContent[];
  isError?: boolean;
}

/**
 * Wraps an arbitrary JSON-serializable value into the MCP text-content response shape.
 *
 * @param value - Value to serialize as the tool's JSON response body.
 * @returns The {@link McpToolResponse} wrapping `value` as pretty-printed JSON text.
 */
const toJson = (value: unknown): McpToolResponse => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

/**
 * Builds a successful tool response.
 *
 * @param data - Payload to return to the calling MCP client.
 * @returns An {@link McpToolResponse} shaped as `{ success: true, data }`.
 */
export const okResult = <T>(data: T): McpToolResponse => toJson({ success: true, data });

/**
 * Builds a failed tool response. Never thrown — MCP tools must always return JSON.
 *
 * @param error - Human-readable error message.
 * @param errors - Field-level validation errors, when the failure comes from schema validation (default: none).
 * @returns An {@link McpToolResponse} shaped as `{ success: false, error, errors? }`.
 */
export const errorResult = (error: string, errors?: ValidationError[]): McpToolResponse =>
  toJson({ success: false, error, ...(errors ? { errors } : {}) });

/**
 * Runs a tool handler and converts any thrown error into a `{ success: false }` response instead of letting it
 * propagate, per the project rule that MCP tools never throw raw errors. `ValidationFailedError` is unpacked
 * into its field-level `errors` list so callers can see exactly what failed.
 *
 * @param fn - Tool handler to run.
 * @returns The resulting {@link McpToolResponse}, success or failure.
 */
export const runTool = async <T>(fn: () => Promise<T>): Promise<McpToolResponse> => {
  try {
    const data = await fn();
    return okResult(data);
  } catch (cause) {
    const error = cause as { name?: string; message?: string; errors?: ValidationError[] };
    if (error.name === "ValidationFailedError" && error.errors) {
      return errorResult(error.message ?? "Validation failed", error.errors);
    }
    return errorResult(error.message ?? "Unknown error");
  }
};

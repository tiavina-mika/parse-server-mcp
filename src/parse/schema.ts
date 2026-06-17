import type { ParseClient } from "./client.js";
import type { ParseSchema } from "../types.js";

const SCHEMA_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  schema: ParseSchema;
  expiresAt: number;
}

export interface SchemaService {
  listSchemas: () => Promise<ParseSchema[]>;
  getSchema: (className: string) => Promise<ParseSchema>;
  invalidate: (className?: string) => void;
}

interface RawSchemaResponse {
  className: string;
  fields: Record<string, { type: string; targetClass?: string; required?: boolean; defaultValue?: unknown }>;
  classLevelPermissions?: Record<string, unknown>;
}

/**
 * Maps the raw Parse `/schemas` REST shape to our internal `ParseSchema` type.
 *
 * @param raw - Raw schema object as returned by the Parse REST API.
 * @returns The normalized {@link ParseSchema}.
 */
const toParseSchema = (raw: RawSchemaResponse): ParseSchema => ({
  className: raw.className,
  fields: raw.fields as ParseSchema["fields"],
  classLevelPermissions: raw.classLevelPermissions,
});

/**
 * Creates the schema service used to validate CRUD inputs against Parse class definitions.
 * Keeps a short-lived in-memory cache (`SCHEMA_CACHE_TTL_MS`) to avoid hitting `/schemas` on every call.
 *
 * @param client - Parse REST client used to fetch schemas.
 * @returns A {@link SchemaService} exposing `listSchemas`/`getSchema`/`invalidate`.
 */
export const createSchemaService = (client: ParseClient): SchemaService => {
  const cache = new Map<string, CacheEntry>();

  /**
   * Returns the schema for a Parse class, from cache when fresh, otherwise fetched from Parse.
   *
   * @param className - Name of the Parse class.
   * @returns The {@link ParseSchema} for `className`.
   */
  const getSchema = async (className: string): Promise<ParseSchema> => {
    const cached = cache.get(className);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.schema;
    }
    const raw = await client.get<RawSchemaResponse>(`schemas/${className}`);
    const schema = toParseSchema(raw);
    cache.set(className, { schema, expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS });
    return schema;
  };

  /**
   * Fetches every Parse class schema in one request (not cached).
   *
   * @returns All {@link ParseSchema} known to the Parse Server instance.
   */
  const listSchemas = async (): Promise<ParseSchema[]> => {
    const response = await client.get<{ results: RawSchemaResponse[] }>("schemas");
    return response.results.map(toParseSchema);
  };

  /**
   * Drops cached schema entries.
   *
   * @param className - Class to invalidate; clears the whole cache when omitted (default: clear all).
   */
  const invalidate = (className?: string): void => {
    if (className) {
      cache.delete(className);
    } else {
      cache.clear();
    }
  };

  return { listSchemas, getSchema, invalidate };
};

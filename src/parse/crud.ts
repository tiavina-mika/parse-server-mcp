import type { ParseClient } from "./client.js";
import type { SchemaService } from "./schema.js";
import { validateAgainstSchema } from "./validate.js";
import type { ParseObjectData, ValidationError } from "../types.js";

export interface FindOptions {
  where?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  order?: string;
  keys?: string[];
  include?: string[];
}

export interface FindResult {
  results: ParseObjectData[];
  count?: number;
}

export class ValidationFailedError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super("Validation failed");
    this.name = "ValidationFailedError";
    this.errors = errors;
  }
}

export interface CrudService {
  findObjects: (className: string, options: FindOptions) => Promise<FindResult>;
  getObject: (className: string, objectId: string, include?: string[]) => Promise<ParseObjectData>;
  createObject: (className: string, data: ParseObjectData) => Promise<ParseObjectData>;
  updateObject: (
    className: string,
    objectId: string,
    data: ParseObjectData,
  ) => Promise<{ before: ParseObjectData; after: ParseObjectData }>;
  deleteObject: (className: string, objectId: string) => Promise<{ before: ParseObjectData }>;
}

export interface CrudServiceOptions {
  allowNewFields: boolean;
}

/**
 * Creates the CRUD service: schema-validated reads/writes against Parse classes, used by the MCP CRUD tools.
 *
 * @param client - Parse REST client.
 * @param schemaService - Schema service used to validate `create`/`update` payloads.
 * @param options - Service options.
 * @param options.allowNewFields - If `true`, allows fields absent from the Parse schema on writes.
 * @returns A {@link CrudService} exposing `findObjects`/`getObject`/`createObject`/`updateObject`/`deleteObject`.
 */
export const createCrudService = (
  client: ParseClient,
  schemaService: SchemaService,
  options: CrudServiceOptions,
): CrudService => {
  /**
   * Runs a Parse query, forwarding filters as REST query params.
   *
   * @param className - Name of the Parse class to query.
   * @param findOptions - Query options: `where`, `limit`, `skip`, `order`, `keys`, `include`.
   * @returns The matching {@link FindResult}.
   */
  const findObjects = async (className: string, findOptions: FindOptions): Promise<FindResult> => {
    const query: Record<string, unknown> = {};
    if (findOptions.where) query.where = findOptions.where;
    if (findOptions.limit !== undefined) query.limit = findOptions.limit;
    if (findOptions.skip !== undefined) query.skip = findOptions.skip;
    if (findOptions.order) query.order = findOptions.order;
    if (findOptions.keys) query.keys = findOptions.keys.join(",");
    if (findOptions.include) query.include = findOptions.include.join(",");

    return client.get<FindResult>(`classes/${className}`, query);
  };

  /**
   * Fetches a single object by id.
   *
   * @param className - Name of the Parse class.
   * @param objectId - Id of the object to fetch.
   * @param include - Pointer fields to resolve inline (default: none).
   * @returns The fetched {@link ParseObjectData}.
   */
  const getObject = async (
    className: string,
    objectId: string,
    include?: string[],
  ): Promise<ParseObjectData> =>
    client.get<ParseObjectData>(
      `classes/${className}/${objectId}`,
      include ? { include: include.join(",") } : undefined,
    );

  /**
   * Validates data against the class schema (all required fields must be present), then creates the object in Parse.
   *
   * @param className - Name of the Parse class.
   * @param data - Object data to create.
   * @returns The created object, merged with the `objectId`/`createdAt` returned by Parse.
   * @throws {ValidationFailedError} If `data` fails schema validation.
   */
  const createObject = async (className: string, data: ParseObjectData): Promise<ParseObjectData> => {
    const schema = await schemaService.getSchema(className);
    const errors = validateAgainstSchema(schema, data, {
      partial: false,
      allowNewFields: options.allowNewFields,
    });
    if (errors.length > 0) {
      throw new ValidationFailedError(errors);
    }

    const created = await client.post<{ objectId: string; createdAt: string }>(
      `classes/${className}`,
      data,
    );
    return { ...data, ...created };
  };

  /**
   * Validates data as a partial update (only the supplied fields are checked), applies it,
   * and returns the object state before and after the write so callers can build a snapshot diff.
   *
   * @param className - Name of the Parse class.
   * @param objectId - Id of the object to update.
   * @param data - Partial object data to apply.
   * @returns The object state `before` and `after` the update.
   * @throws {ValidationFailedError} If `data` fails schema validation.
   */
  const updateObject = async (
    className: string,
    objectId: string,
    data: ParseObjectData,
  ): Promise<{ before: ParseObjectData; after: ParseObjectData }> => {
    const schema = await schemaService.getSchema(className);
    const errors = validateAgainstSchema(schema, data, {
      partial: true,
      allowNewFields: options.allowNewFields,
    });
    if (errors.length > 0) {
      throw new ValidationFailedError(errors);
    }

    const before = await getObject(className, objectId);
    await client.put(`classes/${className}/${objectId}`, data);
    const after = await getObject(className, objectId);

    return { before, after };
  };

  /**
   * Captures the object's state, then deletes it from Parse — the captured state lets callers
   * write a pre-deletion snapshot.
   *
   * @param className - Name of the Parse class.
   * @param objectId - Id of the object to delete.
   * @returns The object state `before` deletion.
   */
  const deleteObject = async (
    className: string,
    objectId: string,
  ): Promise<{ before: ParseObjectData }> => {
    const before = await getObject(className, objectId);
    await client.del(`classes/${className}/${objectId}`);
    return { before };
  };

  return { findObjects, getObject, createObject, updateObject, deleteObject };
};

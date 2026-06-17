import type {
  ParseFieldSchema,
  ParseObjectData,
  ParseSchema,
  ValidationError,
  ValidationOptions,
} from "../types.js";

const RESERVED_FIELDS = new Set(["objectId", "createdAt", "updatedAt", "ACL"]);

/**
 * Narrows a value to a plain object, excluding arrays and null.
 *
 * @param value - Value to check.
 * @returns `true` if `value` is a non-null, non-array object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Checks whether a value is a valid Parse pointer representation.
 * Accepts either a bare objectId string or a full `{ __type: "Pointer", className, objectId }` payload.
 *
 * @param value - Value to check.
 * @returns `true` if `value` is a valid pointer shape.
 */
const isPointerValue = (value: unknown): boolean => {
  if (typeof value === "string") return true;
  return (
    isPlainObject(value) &&
    value.__type === "Pointer" &&
    typeof value.className === "string" &&
    typeof value.objectId === "string"
  );
};

/**
 * Checks that a Relation field value is one of Parse's AddRelation/RemoveRelation ops,
 * the only way to mutate a Relation field.
 *
 * @param value - Value to check.
 * @returns `true` if `value` is a valid `AddRelation`/`RemoveRelation` op.
 */
const isRelationOp = (value: unknown): boolean =>
  isPlainObject(value) &&
  (value.__op === "AddRelation" || value.__op === "RemoveRelation") &&
  Array.isArray(value.objects);

/**
 * Checks whether a value is a valid JS representation for a given Parse field type.
 *
 * @param field - Field schema declaring the expected `type`.
 * @param value - Value to check against `field.type`.
 * @returns `true` if `value` matches the expected type.
 */
const matchesType = (field: ParseFieldSchema, value: unknown): boolean => {
  switch (field.type) {
    case "String":
      return typeof value === "string";
    case "Number":
      return typeof value === "number";
    case "Boolean":
      return typeof value === "boolean";
    case "Date":
      return typeof value === "string" || value instanceof Date || isPlainObject(value);
    case "Array":
      return Array.isArray(value);
    case "Object":
      return isPlainObject(value);
    case "Pointer":
      return isPointerValue(value);
    case "Relation":
      return isRelationOp(value);
    case "File":
    case "GeoPoint":
    case "Polygon":
    case "Bytes":
      return isPlainObject(value);
    default:
      return true;
  }
};

/**
 * Validates data against a Parse class schema before it is sent to the server.
 * Rejects reserved fields, unknown fields (unless `allowNewFields`), direct Relation writes,
 * type mismatches and pointer className mismatches; when `partial` is false, also enforces required fields.
 *
 * @param schema - Parse class schema to validate against.
 * @param data - Candidate object data (create or update payload).
 * @param options - Validation options (default: `{}`).
 * @param options.partial - If `true`, only validates fields present in `data`; skips the required-fields check (default: `false`).
 * @param options.allowNewFields - If `true`, allows fields absent from `schema.fields` (default: `false`).
 * @returns A list of {@link ValidationError}; empty when `data` is valid.
 */
export const validateAgainstSchema = (
  schema: ParseSchema,
  data: ParseObjectData,
  options: ValidationOptions = {},
): ValidationError[] => {
  const { partial = false, allowNewFields = false } = options;
  const errors: ValidationError[] = [];

  for (const [field, value] of Object.entries(data)) {
    if (RESERVED_FIELDS.has(field)) {
      errors.push({ field, message: "reserved field, managed by Parse" });
      continue;
    }

    const fieldSchema = schema.fields[field];
    if (!fieldSchema) {
      if (!allowNewFields) {
        errors.push({ field, message: `unknown field, not present in schema for ${schema.className}` });
      }
      continue;
    }

    if (fieldSchema.type === "Relation") {
      errors.push({
        field,
        message: "Relation fields cannot be set directly via data, use AddRelation/RemoveRelation ops",
      });
      continue;
    }

    if (!matchesType(fieldSchema, value)) {
      errors.push({ field, message: `expected ${fieldSchema.type}, got ${typeof value}` });
      continue;
    }

    if (fieldSchema.type === "Pointer" && isPlainObject(value) && fieldSchema.targetClass) {
      if (value.className !== fieldSchema.targetClass) {
        errors.push({
          field,
          message: `pointer className mismatch: expected ${fieldSchema.targetClass}, got ${String(value.className)}`,
        });
      }
    }
  }

  if (!partial) {
    for (const [field, fieldSchema] of Object.entries(schema.fields)) {
      if (fieldSchema.required && !(field in data) && fieldSchema.defaultValue === undefined) {
        errors.push({ field, message: "missing required field" });
      }
    }
  }

  return errors;
};

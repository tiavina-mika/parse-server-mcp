export type ParseFieldType =
  | "String"
  | "Number"
  | "Boolean"
  | "Date"
  | "Array"
  | "Object"
  | "Pointer"
  | "Relation"
  | "File"
  | "GeoPoint"
  | "Polygon"
  | "Bytes";

export interface ParseFieldSchema {
  type: ParseFieldType;
  targetClass?: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface ParseSchema {
  className: string;
  fields: Record<string, ParseFieldSchema>;
  classLevelPermissions?: Record<string, unknown>;
}

export interface ParsePointer {
  __type: "Pointer";
  className: string;
  objectId: string;
}

export type ParseObjectData = Record<string, unknown>;

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationOptions {
  /** If true, only the fields present in `data` are validated (update case). */
  partial?: boolean;
  /** If true, allows fields absent from the Parse schema. */
  allowNewFields?: boolean;
}

export interface ToolSuccess<T> {
  success: true;
  data: T;
}

export interface ToolFailure {
  success: false;
  error: string;
  errors?: ValidationError[];
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

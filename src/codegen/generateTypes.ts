import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParseFieldSchema, ParseSchema } from "../types.js";

const COMMON_TYPES_FILE_NAME = "common.types.ts";
const GENERATED_HEADER =
  "// Auto-generated from the Parse schema. Do not edit by hand — regenerate via parse_generate_types.";

interface MappedField {
  tsType: string;
  commonType?: string;
  importClassName?: string;
}

export interface GeneratedInterface {
  fileName: string;
  content: string;
}

export interface WriteTypesOptions {
  outputDir: string;
}

/**
 * Maps a single Parse field schema to its TypeScript type. `Pointer`/`Relation` fields resolve to
 * the target class's generated interface, reporting the class to import (skipped for self-pointers).
 *
 * @param field - Parse field schema to map.
 * @param currentClassName - Class the field belongs to, used to avoid importing the class from itself.
 * @returns The mapped {@link MappedField}.
 */
const mapFieldType = (field: ParseFieldSchema, currentClassName: string): MappedField => {
  switch (field.type) {
    case "String":
      return { tsType: "string" };
    case "Number":
      return { tsType: "number" };
    case "Boolean":
      return { tsType: "boolean" };
    case "Date":
      return { tsType: "Date" };
    case "Array":
      return { tsType: "unknown[]" };
    case "Object":
      return { tsType: "Record<string, unknown>" };
    case "Pointer": {
      const target = field.targetClass ?? "unknown";
      return {
        tsType: `Pointer<${target}>`,
        commonType: "Pointer",
        importClassName: target !== currentClassName ? target : undefined,
      };
    }
    case "Relation": {
      const target = field.targetClass ?? "unknown";
      return {
        tsType: `Relation<${target}>`,
        commonType: "Relation",
        importClassName: target !== currentClassName ? target : undefined,
      };
    }
    case "File":
      return { tsType: "ParseFile", commonType: "ParseFile" };
    case "GeoPoint":
      return { tsType: "ParseGeoPoint", commonType: "ParseGeoPoint" };
    case "Polygon":
      return { tsType: "ParsePolygon", commonType: "ParsePolygon" };
    case "Bytes":
      return { tsType: "ParseBytes", commonType: "ParseBytes" };
    default:
      return { tsType: "unknown" };
  }
};

/**
 * Generates the full `.types.ts` source for one Parse class: a TypeScript interface mirroring its
 * schema fields, plus Parse's default `objectId`/`createdAt`/`updatedAt`/`ACL` fields, plus the
 * imports needed for any `Pointer`/`Relation`/`File`/`GeoPoint`/`Polygon`/`Bytes` field used.
 *
 * @param schema - Parse class schema to convert.
 * @returns The generated {@link GeneratedInterface} (file name + source content).
 */
export const generateInterfaceSource = (schema: ParseSchema): GeneratedInterface => {
  const commonTypes = new Set<string>();
  const importClassNames = new Set<string>();
  const fieldLines: string[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    const mapped = mapFieldType(fieldSchema, schema.className);
    if (mapped.commonType) commonTypes.add(mapped.commonType);
    if (mapped.importClassName) importClassNames.add(mapped.importClassName);
    const optional = fieldSchema.required ? "" : "?";
    fieldLines.push(`  ${fieldName}${optional}: ${mapped.tsType};`);
  }

  const importLines: string[] = [];
  if (commonTypes.size > 0) {
    importLines.push(
      `import type { ${[...commonTypes].sort().join(", ")} } from "./common.types.js";`,
    );
  }
  for (const target of [...importClassNames].sort()) {
    importLines.push(`import type { ${target} } from "./${target}.types.js";`);
  }

  const lines: string[] = [
    GENERATED_HEADER,
    ...importLines,
    "",
    `export interface ${schema.className} {`,
    "  objectId: string;",
    "  createdAt: string;",
    "  updatedAt: string;",
    "  ACL?: Record<string, unknown>;",
    ...fieldLines,
    "}",
    "",
  ];

  return { fileName: `${schema.className}.types.ts`, content: lines.join("\n") };
};

/**
 * Generates the shared `common.types.ts` source: Parse's structural types (`Pointer`, `Relation`,
 * `ParseFile`, `ParseGeoPoint`, `ParsePolygon`, `ParseBytes`) referenced by generated class interfaces.
 *
 * @returns The generated common types source.
 */
export const generateCommonTypesSource = (): string =>
  [
    GENERATED_HEADER,
    "",
    "export interface Pointer<T> {",
    '  __type: "Pointer";',
    "  className: string;",
    "  objectId: string;",
    "}",
    "",
    "export type Relation<T> = Pointer<T>[];",
    "",
    "export interface ParseFile {",
    '  __type: "File";',
    "  name: string;",
    "  url: string;",
    "}",
    "",
    "export interface ParseGeoPoint {",
    '  __type: "GeoPoint";',
    "  latitude: number;",
    "  longitude: number;",
    "}",
    "",
    "export interface ParsePolygon {",
    '  __type: "Polygon";',
    "  coordinates: [number, number][];",
    "}",
    "",
    "export interface ParseBytes {",
    '  __type: "Bytes";',
    "  base64: string;",
    "}",
    "",
  ].join("\n");

/**
 * Writes the generated `.types.ts` interface files (one per schema, plus the shared `common.types.ts`)
 * to `outputDir`, creating the directory if it does not exist yet.
 *
 * @param schemas - Parse class schemas to convert.
 * @param options - Write options.
 * @param options.outputDir - Directory the `.types.ts` files are written into.
 * @returns The list of written file paths, common file first.
 */
export const writeTypesFiles = async (
  schemas: ParseSchema[],
  options: WriteTypesOptions,
): Promise<string[]> => {
  await mkdir(options.outputDir, { recursive: true });

  const filePaths: string[] = [];

  const commonFilePath = join(options.outputDir, COMMON_TYPES_FILE_NAME);
  await writeFile(commonFilePath, generateCommonTypesSource(), "utf8");
  filePaths.push(commonFilePath);

  for (const schema of schemas) {
    const { fileName, content } = generateInterfaceSource(schema);
    const filePath = join(options.outputDir, fileName);
    await writeFile(filePath, content, "utf8");
    filePaths.push(filePath);
  }

  return filePaths;
};

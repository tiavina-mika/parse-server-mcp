import { describe, expect, it } from "vitest";
import { generateInterfaceSource, generateCommonTypesSource } from "../src/codegen/generateTypes.js";
import type { ParseSchema } from "../src/types.js";

describe("generateInterfaceSource", () => {
  it("maps primitive field types and required/optional markers", () => {
    const schema: ParseSchema = {
      className: "Product",
      fields: {
        name: { type: "String", required: true },
        price: { type: "Number", required: true },
        inStock: { type: "Boolean" },
        releasedAt: { type: "Date" },
        tags: { type: "Array" },
        metadata: { type: "Object" },
      },
    };

    const { fileName, content } = generateInterfaceSource(schema);

    expect(fileName).toBe("Product.types.ts");
    expect(content).toContain("export interface Product {");
    expect(content).toContain("  objectId: string;");
    expect(content).toContain("  createdAt: string;");
    expect(content).toContain("  updatedAt: string;");
    expect(content).toContain("  ACL?: Record<string, unknown>;");
    expect(content).toContain("  name: string;");
    expect(content).toContain("  price: number;");
    expect(content).toContain("  inStock?: boolean;");
    expect(content).toContain("  releasedAt?: Date;");
    expect(content).toContain("  tags?: unknown[];");
    expect(content).toContain("  metadata?: Record<string, unknown>;");
  });

  it("imports the target class for a Pointer field, but not for a self-pointer", () => {
    const schema: ParseSchema = {
      className: "Comment",
      fields: {
        author: { type: "Pointer", targetClass: "_User", required: true },
        parent: { type: "Pointer", targetClass: "Comment" },
      },
    };

    const { content } = generateInterfaceSource(schema);

    expect(content).toContain('import type { Pointer } from "./common.types.js";');
    expect(content).toContain('import type { _User } from "./_User.types.js";');
    expect(content).not.toContain('from "./Comment.types.js"');
    expect(content).toContain("  author: Pointer<_User>;");
    expect(content).toContain("  parent?: Pointer<Comment>;");
  });

  it("maps Relation, File, GeoPoint, Polygon and Bytes fields with their common type imports", () => {
    const schema: ParseSchema = {
      className: "Place",
      fields: {
        reviews: { type: "Relation", targetClass: "Review" },
        photo: { type: "File" },
        location: { type: "GeoPoint" },
        area: { type: "Polygon" },
        signature: { type: "Bytes" },
      },
    };

    const { content } = generateInterfaceSource(schema);

    expect(content).toContain(
      'import type { ParseBytes, ParseFile, ParseGeoPoint, ParsePolygon, Relation } from "./common.types.js";',
    );
    expect(content).toContain('import type { Review } from "./Review.types.js";');
    expect(content).toContain("  reviews?: Relation<Review>;");
    expect(content).toContain("  photo?: ParseFile;");
    expect(content).toContain("  location?: ParseGeoPoint;");
    expect(content).toContain("  area?: ParsePolygon;");
    expect(content).toContain("  signature?: ParseBytes;");
  });

  it("omits the common types import when no field needs it", () => {
    const schema: ParseSchema = {
      className: "Tag",
      fields: { label: { type: "String", required: true } },
    };

    const { content } = generateInterfaceSource(schema);

    expect(content).not.toContain("common.types.js");
  });
});

describe("generateCommonTypesSource", () => {
  it("declares Pointer, Relation and the Parse structural types", () => {
    const content = generateCommonTypesSource();

    expect(content).toContain("export interface Pointer<T> {");
    expect(content).toContain("export type Relation<T> = Pointer<T>[];");
    expect(content).toContain("export interface ParseFile {");
    expect(content).toContain("export interface ParseGeoPoint {");
    expect(content).toContain("export interface ParsePolygon {");
    expect(content).toContain("export interface ParseBytes {");
  });
});

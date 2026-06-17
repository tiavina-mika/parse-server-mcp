import { describe, expect, it } from "vitest";
import { validateAgainstSchema } from "../src/parse/validate.js";
import type { ParseSchema } from "../src/types.js";

const productSchema: ParseSchema = {
  className: "Product",
  fields: {
    name: { type: "String", required: true },
    price: { type: "Number", required: true },
    inStock: { type: "Boolean" },
    author: { type: "Pointer", targetClass: "_User" },
    reviews: { type: "Relation", targetClass: "Review" },
  },
};

describe("validateAgainstSchema", () => {
  it("passes for a fully valid object on create", () => {
    const errors = validateAgainstSchema(productSchema, { name: "Chaise", price: 49.99 });
    expect(errors).toEqual([]);
  });

  it("reports a missing required field on create", () => {
    const errors = validateAgainstSchema(productSchema, { name: "Chaise" });
    expect(errors).toEqual([{ field: "price", message: "missing required field" }]);
  });

  it("does not require missing fields when partial (update)", () => {
    const errors = validateAgainstSchema(productSchema, { price: 39.99 }, { partial: true });
    expect(errors).toEqual([]);
  });

  it("reports a type mismatch", () => {
    const errors = validateAgainstSchema(productSchema, { name: "Chaise", price: "49.99" });
    expect(errors).toEqual([{ field: "price", message: "expected Number, got string" }]);
  });

  it("rejects unknown fields by default", () => {
    const errors = validateAgainstSchema(productSchema, {
      name: "Chaise",
      price: 49.99,
      color: "red",
    });
    expect(errors).toEqual([
      { field: "color", message: "unknown field, not present in schema for Product" },
    ]);
  });

  it("allows unknown fields when allowNewFields is true", () => {
    const errors = validateAgainstSchema(
      productSchema,
      { name: "Chaise", price: 49.99, color: "red" },
      { allowNewFields: true },
    );
    expect(errors).toEqual([]);
  });

  it("rejects reserved fields", () => {
    const errors = validateAgainstSchema(productSchema, {
      name: "Chaise",
      price: 49.99,
      objectId: "abc123",
    });
    expect(errors).toEqual([{ field: "objectId", message: "reserved field, managed by Parse" }]);
  });

  it("accepts a pointer given as a plain objectId string", () => {
    const errors = validateAgainstSchema(
      productSchema,
      { name: "Chaise", price: 49.99, author: "abc123" },
      { partial: true },
    );
    expect(errors).toEqual([]);
  });

  it("accepts a full pointer matching targetClass", () => {
    const errors = validateAgainstSchema(
      productSchema,
      {
        author: { __type: "Pointer", className: "_User", objectId: "abc123" },
      },
      { partial: true },
    );
    expect(errors).toEqual([]);
  });

  it("rejects a pointer with a mismatched className", () => {
    const errors = validateAgainstSchema(
      productSchema,
      {
        author: { __type: "Pointer", className: "Author", objectId: "abc123" },
      },
      { partial: true },
    );
    expect(errors).toEqual([
      { field: "author", message: "pointer className mismatch: expected _User, got Author" },
    ]);
  });

  it("rejects relation fields set directly via data", () => {
    const errors = validateAgainstSchema(
      productSchema,
      { reviews: ["r1", "r2"] },
      { partial: true },
    );
    expect(errors).toEqual([
      {
        field: "reviews",
        message: "Relation fields cannot be set directly via data, use AddRelation/RemoveRelation ops",
      },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { diffObjects } from "../src/snapshot/diff.js";

describe("diffObjects", () => {
  it("returns no diffs for identical objects", () => {
    const diffs = diffObjects({ name: "Chaise", price: 49.99 }, { name: "Chaise", price: 49.99 });
    expect(diffs).toEqual([]);
  });

  it("detects a changed field", () => {
    const diffs = diffObjects({ name: "Chaise", price: 49.99 }, { name: "Chaise", price: 39.99 });
    expect(diffs).toEqual([{ field: "price", before: 49.99, after: 39.99 }]);
  });

  it("detects an added field", () => {
    const diffs = diffObjects({ name: "Chaise" }, { name: "Chaise", stock: 10 });
    expect(diffs).toEqual([{ field: "stock", before: undefined, after: 10 }]);
  });

  it("detects a removed field", () => {
    const diffs = diffObjects({ name: "Chaise", stock: 10 }, { name: "Chaise" });
    expect(diffs).toEqual([{ field: "stock", before: 10, after: undefined }]);
  });

  it("treats a delete as a diff against null", () => {
    const diffs = diffObjects({ name: "Chaise", price: 49.99 }, null);
    expect(diffs).toEqual([
      { field: "name", before: "Chaise", after: undefined },
      { field: "price", before: 49.99, after: undefined },
    ]);
  });
});

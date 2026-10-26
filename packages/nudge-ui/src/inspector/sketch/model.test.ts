import { describe, expect, it } from "vitest";
import { SKETCH_SCHEMA_VERSION, isSketchDocument } from "./model.ts";

const image = new Blob(["png"], { type: "image/png" });

function document() {
  return {
    schemaVersion: SKETCH_SCHEMA_VERSION,
    projectId: "project",
    id: "sketch-1",
    createdAt: 1,
    updatedAt: 2,
    url: "https://example.test/playground",
    imageWidth: 100,
    imageHeight: 200,
    image,
  };
}

describe("sketch document validation", () => {
  it("accepts the copied image and its provenance", () => {
    expect(isSketchDocument(document())).toBe(true);
  });

  it("rejects records from the old editable-sketch model", () => {
    expect(isSketchDocument({ ...document(), schemaVersion: 1 })).toBe(false);
    expect(isSketchDocument({ ...document(), strokes: [] })).toBe(false);
    expect(isSketchDocument({ ...document(), annotations: [] })).toBe(false);
    expect(isSketchDocument({ ...document(), capture: {} })).toBe(false);
    expect(isSketchDocument({ ...document(), originalImage: image })).toBe(false);
    expect(isSketchDocument({ ...document(), revision: 1 })).toBe(false);
  });

  it("rejects images and dimensions outside the storage bounds", () => {
    expect(isSketchDocument({ ...document(), image: new Blob(["png"], { type: "image/jpeg" }) })).toBe(false);
    expect(isSketchDocument({ ...document(), image: new Blob([], { type: "image/png" }) })).toBe(false);
    expect(isSketchDocument({ ...document(), imageWidth: 2_049 })).toBe(false);
    expect(isSketchDocument({ ...document(), imageHeight: 0 })).toBe(false);
    expect(isSketchDocument({ ...document(), url: "about:blank" })).toBe(false);
  });
});

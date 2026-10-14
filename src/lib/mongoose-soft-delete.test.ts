/** @vitest-environment node */
import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";
import {
  applySoftDeleteFilter,
  asSoftDeleteModel,
  includesDeleted,
  SOFT_DELETE_FIELD,
  softDeletePlugin,
} from "@/lib/mongoose-soft-delete";

let counter = 0;

const OBJECT_ID = "000000000000000000000001";

/** Builds an isolated model so plugin behaviour can be inspected without a DB. */
function buildModel() {
  const schema = new mongoose.Schema({ name: String });
  softDeletePlugin(schema);
  const model = mongoose.model(`SoftDeleteSpec${counter++}`, schema);
  return { model, schema };
}

interface Captured {
  find?: Record<string, unknown>;
  findOne?: Record<string, unknown>;
  countDocuments?: Record<string, unknown>;
  updateOne?: unknown[];
  updateMany?: unknown[];
}

/** Replaces native collection methods so query filters can be captured. */
function capture(model: { collection: unknown }): Captured {
  const captured: Captured = {};
  const coll = model.collection as unknown as Record<string, (...args: unknown[]) => unknown>;

  coll.find = (filter) => {
    captured.find = filter as Record<string, unknown>;
    return { toArray: async () => [], next: async () => null };
  };
  coll.findOne = (filter) => {
    captured.findOne = filter as Record<string, unknown>;
    return Promise.resolve(null);
  };
  coll.countDocuments = (filter) => {
    captured.countDocuments = filter as Record<string, unknown>;
    return Promise.resolve(0);
  };
  coll.updateOne = (...args) => {
    captured.updateOne = args;
    return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  };
  coll.updateMany = (...args) => {
    captured.updateMany = args;
    return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  };

  return captured;
}

describe("softDeletePlugin", () => {
  it("adds the deletedAt field and helper methods", () => {
    const { model, schema } = buildModel();
    expect(schema.path(SOFT_DELETE_FIELD)).toBeTruthy();
    expect(typeof schema.methods.softDelete).toBe("function");
    const sm = asSoftDeleteModel(model);
    expect(typeof sm.softDeleteById).toBe("function");
    expect(typeof sm.restoreById).toBe("function");
    expect(typeof sm.softDeleteMany).toBe("function");
  });

  it("is idempotent when applied twice", () => {
    const schema = new mongoose.Schema({ name: String });
    softDeletePlugin(schema);
    expect(() => softDeletePlugin(schema)).not.toThrow();
    expect(schema.path(SOFT_DELETE_FIELD)).toBeTruthy();
  });

  it("excludes soft-deleted records from reads by default", async () => {
    const { model } = buildModel();
    const captured = capture(model);

    await model.find({ name: "a" }).exec();
    expect(captured.find).toEqual({ name: "a", [SOFT_DELETE_FIELD]: null });

    await model.findOne({ name: "a" }).exec();
    expect(captured.findOne).toEqual({ name: "a", [SOFT_DELETE_FIELD]: null });

    await model.findById(OBJECT_ID).exec();
    const byId = captured.findOne as {
      _id: { toString(): string };
      [SOFT_DELETE_FIELD]: unknown;
    };
    expect(String(byId._id)).toBe(OBJECT_ID);
    expect(byId[SOFT_DELETE_FIELD]).toBeNull();

    await model.countDocuments({ name: "a" });
    expect(captured.countDocuments).toEqual({ name: "a", [SOFT_DELETE_FIELD]: null });

    await model.exists({ name: "a" });
    expect(captured.findOne).toEqual({ name: "a", [SOFT_DELETE_FIELD]: null });
  });

  it("includes deleted records when withDeleted is set", async () => {
    const { model } = buildModel();
    const captured = capture(model);

    await model.find({ name: "a" }).setOptions({ withDeleted: true }).exec();
    expect(captured.find).toEqual({ name: "a" });

    await model.findOne({ name: "a" }).setOptions({ withDeleted: true }).exec();
    expect(captured.findOne).toEqual({ name: "a" });
  });

  it("softDeleteById stamps deletedAt without an exclusion filter", async () => {
    const { model } = buildModel();
    const captured = capture(model);

    const when = new Date("2026-01-01T00:00:00Z");
    await asSoftDeleteModel(model).softDeleteById(OBJECT_ID, when);

    const filter = captured.updateOne?.[0] as { _id: { toString(): string } };
    expect(String(filter._id)).toBe(OBJECT_ID);
    expect(filter).not.toHaveProperty(SOFT_DELETE_FIELD);
    expect(captured.updateOne?.[1]).toEqual({ $set: { [SOFT_DELETE_FIELD]: when } });
  });

  it("restoreById clears deletedAt on a soft-deleted record", async () => {
    const { model } = buildModel();
    const captured = capture(model);

    await asSoftDeleteModel(model).restoreById(OBJECT_ID);

    const filter = captured.updateOne?.[0] as {
      _id: { toString(): string };
      [SOFT_DELETE_FIELD]: unknown;
    };
    expect(String(filter._id)).toBe(OBJECT_ID);
    expect(filter[SOFT_DELETE_FIELD]).toEqual({ $ne: null });
    expect(captured.updateOne?.[1]).toEqual({ $set: { [SOFT_DELETE_FIELD]: null } });
  });

  it("softDeleteMany only touches live records", async () => {
    const { model } = buildModel();
    const captured = capture(model);

    const when = new Date("2026-02-02T00:00:00Z");
    await asSoftDeleteModel(model).softDeleteMany({ propertyId: "p1" }, when);

    expect(captured.updateMany?.[0]).toEqual({ propertyId: "p1", [SOFT_DELETE_FIELD]: null });
    expect(captured.updateMany?.[1]).toEqual({ $set: { [SOFT_DELETE_FIELD]: when } });
  });
});

describe("applySoftDeleteFilter", () => {
  it("adds the guard when the query has not opted in", () => {
    const where = vi.fn();
    applySoftDeleteFilter({ getOptions: () => ({}), where });
    expect(where).toHaveBeenCalledWith({ [SOFT_DELETE_FIELD]: null });
  });

  it("does nothing when the query opted in with withDeleted", () => {
    const where = vi.fn();
    applySoftDeleteFilter({ getOptions: () => ({ withDeleted: true }), where });
    expect(where).not.toHaveBeenCalled();
  });

  it("honours a custom field name", () => {
    const where = vi.fn();
    applySoftDeleteFilter({ getOptions: () => ({}), where }, "removedAt");
    expect(where).toHaveBeenCalledWith({ removedAt: null });
  });
});

describe("includesDeleted", () => {
  it("reflects the withDeleted option", () => {
    expect(includesDeleted({ getOptions: () => ({ withDeleted: true }) })).toBe(true);
    expect(includesDeleted({ getOptions: () => ({}) })).toBe(false);
    expect(includesDeleted({})).toBe(false);
  });
});

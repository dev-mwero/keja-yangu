/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/PropertyType", () => ({ PropertyTypeModel: getModelStubs().propertytype }));

import {
  countDeleted,
  isRecycleBinType,
  listDeleted,
  purgeDeleted,
  restoreDeleted,
} from "@/lib/recycle-bin";

const { property, unit, tenant } = getModelStubs();

const DELETED_FILTER = { deletedAt: { $ne: null } };

describe("isRecycleBinType", () => {
  it("accepts known types and rejects others", () => {
    expect(isRecycleBinType("property")).toBe(true);
    expect(isRecycleBinType("invoice")).toBe(true);
    expect(isRecycleBinType("user")).toBe(false);
    expect(isRecycleBinType("")).toBe(false);
  });
});

describe("countDeleted", () => {
  beforeEach(() => resetModelStubs());

  it("returns a count per type", async () => {
    const { propertytype, lease, invoice } = getModelStubs();
    for (const stub of [property, unit, tenant, lease, invoice, propertytype]) {
      stub.countDocuments.mockReturnValue({ setOptions: () => Promise.resolve(3) });
    }

    const counts = await countDeleted();
    expect(counts).toEqual({
      property: 3,
      unit: 3,
      tenant: 3,
      lease: 3,
      invoice: 3,
      propertytype: 3,
    });
    expect(property.countDocuments).toHaveBeenCalledWith(DELETED_FILTER);
  });
});

describe("listDeleted", () => {
  beforeEach(() => resetModelStubs());

  it("queries deleted records with the withDeleted escape hatch", async () => {
    const docs = [{ _id: "p1", deletedAt: "2026-01-01" }];
    property.find.mockReturnValue(buildQuery(docs));
    property.countDocuments.mockReturnValue({ setOptions: () => Promise.resolve(1) });

    const page = await listDeleted("property", 2, 5);

    const query = property.find.mock.results[0]?.value as { setOptions: ReturnType<typeof vi.fn> };
    expect(query.setOptions).toHaveBeenCalledWith({ withDeleted: true });
    expect(property.find).toHaveBeenCalledWith(DELETED_FILTER);
    expect((page.docs as unknown[]).length).toBe(1);
    expect(page.total).toBe(1);
  });
});

describe("restoreDeleted", () => {
  beforeEach(() => resetModelStubs());

  it("restores a soft-deleted record and reports success", async () => {
    tenant.restoreById.mockResolvedValue({ matchedCount: 1 });

    expect(await restoreDeleted("tenant", "abc")).toBe(true);
    expect(tenant.restoreById).toHaveBeenCalledWith("abc");
    expect(unit.updateMany).not.toHaveBeenCalled();
  });

  it("returns false when no deleted record matched", async () => {
    tenant.restoreById.mockResolvedValue({ matchedCount: 0 });

    expect(await restoreDeleted("tenant", "abc")).toBe(false);
    expect(unit.updateMany).not.toHaveBeenCalled();
  });

  it("restores a property's soft-deleted units alongside it", async () => {
    property.restoreById.mockResolvedValue({ matchedCount: 1 });
    unit.updateMany.mockResolvedValue({});

    expect(await restoreDeleted("property", "p1")).toBe(true);
    expect(unit.updateMany).toHaveBeenCalledWith(
      { propertyId: "p1", ...DELETED_FILTER },
      { $set: { deletedAt: null } },
    );
  });
});

describe("purgeDeleted", () => {
  beforeEach(() => resetModelStubs());

  it("purges only soft-deleted records and reports success", async () => {
    tenant.deleteOne.mockResolvedValue({ deletedCount: 1 });

    expect(await purgeDeleted("tenant", "abc")).toBe(true);
    expect(tenant.deleteOne).toHaveBeenCalledWith({ _id: "abc", ...DELETED_FILTER });
  });

  it("returns false when nothing was purged", async () => {
    tenant.deleteOne.mockResolvedValue({ deletedCount: 0 });

    expect(await purgeDeleted("tenant", "abc")).toBe(false);
    expect(unit.deleteMany).not.toHaveBeenCalled();
  });

  it("purges a property's soft-deleted units alongside it", async () => {
    property.deleteOne.mockResolvedValue({ deletedCount: 1 });
    unit.deleteMany.mockResolvedValue({});

    expect(await purgeDeleted("property", "p1")).toBe(true);
    expect(unit.deleteMany).toHaveBeenCalledWith({ propertyId: "p1", ...DELETED_FILTER });
  });
});

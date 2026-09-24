import { describe, expect, it } from "vitest";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";

describe("pagination", () => {
  it("parses pagination params correctly", () => {
    expect(parsePagination({ page: "1", limit: "10" })).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({})).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({ page: "0", limit: "100" })).toEqual({ page: 1, limit: 100 });
    expect(parsePagination({ page: "5", limit: "50" })).toEqual({ page: 5, limit: 50 });
  });

  it("clamps page to a minimum of 1", () => {
    expect(parsePagination({ page: "0", limit: "10" })).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({ page: "-3", limit: "10" })).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({ page: "abc", limit: "10" })).toEqual({ page: 1, limit: 10 });
  });

  it("clamps limit to the 1..100 boundary", () => {
    // 0/bogus values fall back to the default of 10
    expect(parsePagination({ page: "1", limit: "0" })).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({ page: "1", limit: "abc" })).toEqual({ page: 1, limit: 10 });
    // negative values clamp to the 1 minimum
    expect(parsePagination({ page: "1", limit: "-5" })).toEqual({ page: 1, limit: 1 });
    // oversized values clamp to the 100 maximum
    expect(parsePagination({ page: "1", limit: "1000" })).toEqual({ page: 1, limit: 100 });
  });

  it("builds pagination result correctly", () => {
    const result = buildPaginationResult([{ id: 1 }], 10, 1, 10);
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(10);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.hasNextPage).toBe(false);
    expect(result.pagination.hasPrevPage).toBe(false);
  });

  it("handles multiple pages correctly", () => {
    const result = buildPaginationResult([{ id: 1 }], 25, 2, 10);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.hasNextPage).toBe(true);
    expect(result.pagination.hasPrevPage).toBe(true);
  });

  it("exposes boundary pagination flags for the last page and first page", () => {
    const lastPage = buildPaginationResult([{ id: 1 }], 25, 3, 10);
    expect(lastPage.pagination.hasNextPage).toBe(false);
    expect(lastPage.pagination.hasPrevPage).toBe(true);

    const firstPage = buildPaginationResult([{ id: 1 }], 0, 1, 10);
    expect(firstPage.pagination.hasPrevPage).toBe(false);
  });

  it("handles an empty collection with zero pages", () => {
    const result = buildPaginationResult([], 0, 1, 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNextPage).toBe(false);
    expect(result.pagination.hasPrevPage).toBe(false);
  });
});

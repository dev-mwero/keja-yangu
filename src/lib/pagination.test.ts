import { describe, expect, it } from "vitest";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";

describe("pagination", () => {
  it("parses pagination params correctly", () => {
    expect(parsePagination({ page: "1", limit: "10" })).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({})).toEqual({ page: 1, limit: 10 });
    expect(parsePagination({ page: "0", limit: "100" })).toEqual({ page: 1, limit: 100 });
    expect(parsePagination({ page: "5", limit: "50" })).toEqual({ page: 5, limit: 50 });
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
});

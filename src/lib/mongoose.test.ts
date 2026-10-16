/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();

vi.mock("mongoose", () => ({
  default: { connect: (...args: unknown[]) => connectMock(...args) },
}));

describe("connectToDatabase", () => {
  beforeEach(() => {
    vi.resetModules();
    connectMock.mockReset();
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    (globalThis as unknown as { mongooseCache?: unknown }).mongooseCache = undefined;
  });

  it("retries a transient connection failure instead of caching the rejection", async () => {
    const { connectToDatabase } = await import("@/lib/mongoose");

    connectMock.mockRejectedValueOnce(new Error("boom"));
    await expect(connectToDatabase()).rejects.toThrow("boom");

    connectMock.mockResolvedValueOnce({ connection: {} });
    await expect(connectToDatabase()).resolves.toBeDefined();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("reuses an established connection", async () => {
    const { connectToDatabase } = await import("@/lib/mongoose");

    connectMock.mockResolvedValueOnce({ connection: {} });
    await connectToDatabase();
    await connectToDatabase();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});

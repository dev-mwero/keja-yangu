/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "@/test/utils/api-request";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));

import { ourFileRouter } from "@/app/api/uploadthing/core";

type Middleware = (args: { req: Request }) => Promise<unknown>;
const runMiddleware = (ourFileRouter.propertyImages as unknown as { middleware: Middleware })
  .middleware;

function reqWithToken(): Request {
  const token = signToken("user-1", { role: "owner", name: "Ada" });
  return new Request("http://localhost:3000/api/uploadthing", {
    method: "POST",
    headers: { cookie: `keja-token=${token}` },
  });
}

describe("uploadthing file router", () => {
  it("exposes the propertyImages endpoint", () => {
    expect(Object.keys(ourFileRouter)).toContain("propertyImages");
  });

  it("configures propertyImages as image type, 4MB max, 8 files, public-read ACL", () => {
    const config = (
      ourFileRouter.propertyImages as unknown as { routerConfig: Record<string, unknown> }
    ).routerConfig;
    expect(config).toEqual({
      image: { maxFileSize: "4MB", maxFileCount: 8, acl: "public-read" },
    });
  });

  it("registers middleware and onUploadComplete handlers", () => {
    const route = ourFileRouter.propertyImages as unknown as Record<string, unknown>;
    expect(typeof route.middleware).toBe("function");
    expect(typeof route.onUploadComplete).toBe("function");
  });
});

describe("uploadthing propertyImages middleware", () => {
  beforeEach(() => resetModelStubs());

  it("rejects requests without a token", async () => {
    await expect(
      runMiddleware({ req: new Request("http://localhost:3000/api/uploadthing") }),
    ).rejects.toThrow();
  });

  it("rejects a deactivated user even with a valid token", async () => {
    getModelStubs().user.findById.mockReturnValue(buildQuery({ isActive: false, role: "owner" }));
    await expect(runMiddleware({ req: reqWithToken() })).rejects.toThrow();
  });

  it("allows an active user and returns the uploader identity", async () => {
    getModelStubs().user.findById.mockReturnValue(buildQuery({ isActive: true, role: "owner" }));
    const result = await runMiddleware({ req: reqWithToken() });
    expect(result).toMatchObject({ uploadedBy: "user-1", role: "owner" });
  });
});

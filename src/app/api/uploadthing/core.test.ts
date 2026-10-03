import { describe, expect, it } from "vitest";
import { ourFileRouter } from "@/app/api/uploadthing/core";

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

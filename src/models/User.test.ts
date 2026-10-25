import { describe, expect, it } from "vitest";
import { User } from "@/models/User";

describe("User schema — optional email", () => {
  it("email is not required", () => {
    const emailPath = (User.schema as any).paths.email;
    expect(emailPath.isRequired).toBe(false);
  });

  it("email index is sparse unique", () => {
    const indexes = (User.schema as any).indexes();
    const sparse = indexes.find(
      ([keys, opts]: any) =>
        JSON.stringify(keys) === JSON.stringify({ email: 1 }) &&
        opts.sparse === true &&
        opts.unique === true,
    );
    expect(sparse).toBeDefined();
  });
});

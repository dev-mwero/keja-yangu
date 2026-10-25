import { describe, expect, it } from "vitest";
import { User } from "@/models/User";

describe("User schema — optional email", () => {
  it("email is not required", () => {
    const emailPath = (User.schema.paths as Record<string, { isRequired: boolean }>).email;
    expect(emailPath.isRequired).toBe(false);
  });

  it("email index is sparse unique", () => {
    const indexes = User.schema.indexes() as Array<
      [Record<string, unknown>, Record<string, unknown>]
    >;
    const sparse = indexes.find(
      ([keys, opts]) =>
        JSON.stringify(keys) === JSON.stringify({ email: 1 }) &&
        opts.sparse === true &&
        opts.unique === true,
    );
    expect(sparse).toBeDefined();
  });
});

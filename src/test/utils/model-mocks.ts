import { vi } from "vitest";

const stubs: Record<
  | "user"
  | "property"
  | "tenant"
  | "lease"
  | "invoice"
  | "notification"
  | "payment"
  | "complaint"
  | "chatthread"
  | "chatmessage"
  | "announcement"
  | "propertydocument",
  ModelStub
> = {
  user: createModelStub(),
  property: createModelStub(),
  tenant: createModelStub(),
  lease: createModelStub(),
  invoice: createModelStub(),
  notification: createModelStub(),
  payment: createModelStub(),
  complaint: createModelStub(),
  chatthread: createModelStub(),
  chatmessage: createModelStub(),
  announcement: createModelStub(),
  propertydocument: createModelStub(),
};

/**
 * Returns the shared singleton stubs. Route tests wire their `vi.mock`
 * factories through this accessor (rather than closing over a top-level
 * variable) because mock factories run lazily during import resolution, before
 * the test file's own top-level statements execute.
 */
export function getModelStubs() {
  return stubs;
}

/** Clears call history on every stub method between tests. */
export function resetModelStubs() {
  for (const stub of Object.values(stubs)) {
    for (const fn of Object.values(stub)) {
      fn.mockReset();
    }
  }
}

/**
 * Builds a chainable Mongoose query stub whose terminal methods resolve to
 * `value`. Methods not present in the chain return the chain itself so any
 * query shape used by the route handlers can be composed in one expression.
 */
export function buildQuery(value: unknown) {
  const chain = {
    // Variadic so chainable calls match whatever selector the route passes
    // (vitest types a `vi.fn(() => chain)` impl as zero-arg, which fails `tsc`
    // on `.select(LEASE_SAFE_FIELDS)` / `.sort({...})` / `.skip(0)` / `.limit(10)`).
    select: vi.fn((..._args: unknown[]) => chain),
    sort: vi.fn((..._args: unknown[]) => chain),
    skip: vi.fn((..._args: unknown[]) => chain),
    limit: vi.fn((..._args: unknown[]) => chain),
    populate: vi.fn((..._args: unknown[]) => chain),
    lean: vi.fn(() => value),
    exec: vi.fn(() => value),
  };
  return chain;
}

export type QueryChain = ReturnType<typeof buildQuery>;

export interface ModelStub {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByIdAndUpdate: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  findOneAndDelete: ReturnType<typeof vi.fn>;
  deleteOne: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

/**
 * Creates a model stub with every Mongoose method the property-management
 * routes call. Wire a resolved value per method in each test:
 *
 *     userStub.findById.mockReturnValue(buildQuery(userDoc));
 *     propertyStub.create.mockResolvedValue(createdDoc);
 */
export function createModelStub(): ModelStub {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    exists: vi.fn(),
    aggregate: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
  };
}

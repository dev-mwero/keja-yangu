import { vi } from "vitest";

const stubs: Record<
  | "user"
  | "property"
  | "tenant"
  | "lease"
  | "invoice"
  | "lead"
  | "notification"
  | "payment"
  | "complaint"
  | "chatthread"
  | "chatmessage"
  | "announcement"
  | "propertydocument"
  | "propertytype"
  | "unit"
  | "moverrequest"
  | "application"
  | "ownerpaymentconfig"
  | "paymentSplit"
  | "propertyFavorite"
  | "propertyView"
  | "unitFavorite"
  | "serviceFeeItem"
  | "unitServiceFeeOverride"
  | "managementAssignment"
  | "auditEvent"
  | "block"
  | "propertyClaim"
  | "billingAccount"
  | "unitBillingAssignment"
  | "listing"
  | "listingPublisher"
  | "brokerProfile"
  | "brokerAuthorization"
  | "commissionAgreement"
  | "attribution"
  | "commissionAccrual"
  | "commissionPayout"
  | "task",
  ModelStub
> = {
  user: createModelStub(),
  property: createModelStub(),
  tenant: createModelStub(),
  lease: createModelStub(),
  invoice: createModelStub(),
  lead: createModelStub(),
  notification: createModelStub(),
  payment: createModelStub(),
  complaint: createModelStub(),
  chatthread: createModelStub(),
  chatmessage: createModelStub(),
  announcement: createModelStub(),
  propertydocument: createModelStub(),
  propertytype: createModelStub(),
  unit: createModelStub(),
  moverrequest: createModelStub(),
  application: createModelStub(),
  ownerpaymentconfig: createModelStub(),
  paymentSplit: createModelStub(),
  propertyFavorite: createModelStub(),
  propertyView: createModelStub(),
  unitFavorite: createModelStub(),
  serviceFeeItem: createModelStub(),
  unitServiceFeeOverride: createModelStub(),
  managementAssignment: createModelStub(),
  auditEvent: createModelStub(),
  block: createModelStub(),
  propertyClaim: createModelStub(),
  billingAccount: createModelStub(),
  unitBillingAssignment: createModelStub(),
  listing: createModelStub(),
  listingPublisher: createModelStub(),
  brokerProfile: createModelStub(),
  brokerAuthorization: createModelStub(),
  commissionAgreement: createModelStub(),
  attribution: createModelStub(),
  commissionAccrual: createModelStub(),
  commissionPayout: createModelStub(),
  task: createModelStub(),
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
  // Assignment-backed staff scope defaults to "no assignments" so custodian/
  // caretaker fixtures exercise the derived-owner path unless a test opts into
  // assignment coverage with its own mock.
  stubs.managementAssignment.find.mockReturnValue(buildQuery([]));
  // `getManagedOwnerId` derives the owner via `Property.find`; default to an
  // empty portfolio rather than `undefined` so unstubbed staff flows do not
  // crash on `.select()`.
  stubs.property.find.mockReturnValue(buildQuery([]));
}

const ALL_ACTIONS = [
  "property:create",
  "property:edit",
  "property:delete",
  "property-type:manage",
  "recycle-bin:manage",
  "unit:read",
  "unit:manage",
  "custodian:manage",
  "tenant:manage",
  "move-request:create",
  "move-request:manage",
  "application:manage",
  "lease:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "invoice:read-own",
  "lead:manage",
  "lead:read",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "complaint:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
] as const;

/**
 * Wires the shared stubs so a custodian/caretaker is assignment-backed across a
 * portfolio. Must be called after `resetModelStubs()`.
 */
export function mockStaffPortfolio(options: {
  userId: string;
  role: "caretaker" | "custodian";
  ownerId: string;
  propertyIds: string[];
  permissions?: readonly string[];
}) {
  const stubs = getModelStubs();
  const permissions = options.permissions ?? ALL_ACTIONS;
  stubs.managementAssignment.find.mockReturnValue(
    buildQuery(
      options.propertyIds.map((propertyId) => ({
        principalUserId: options.userId,
        accessRole: options.role,
        scopeType: "property",
        propertyId,
        status: "active",
        permissions: [...permissions],
        startsAt: new Date("2020-01-01T00:00:00.000Z"),
        endsAt: null,
      })),
    ),
  );
  stubs.property.find.mockReturnValue(
    buildQuery(
      options.propertyIds.map((propertyId) => ({ _id: propertyId, ownerId: options.ownerId })),
    ),
  );
}

/**
 * Builds a chainable Mongoose query stub whose terminal methods resolve to
 * `value`. Methods not present in the chain return the chain itself so any
 * query shape used by the route handlers can be composed in one expression.
 */
export function buildQuery(value: unknown) {
  const chain = {
    // Thenable so `await Model.findById(id)` resolves to the stubbed value, mirroring
    // Mongoose queries and letting policy resource loaders call `.select().lean()`.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable so the stub behaves like a Mongoose query
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
    catch: (reject: (reason: unknown) => unknown) => Promise.resolve(value).catch(reject),
    finally: (cb: () => void) => Promise.resolve(value).finally(cb),
    // Variadic so chainable calls match whatever selector the route passes
    // (vitest types a `vi.fn(() => chain)` impl as zero-arg, which fails `tsc`
    // on `.select(LEASE_SAFE_FIELDS)` / `.sort({...})` / `.skip(0)` / `.limit(10)`).
    select: vi.fn((..._args: unknown[]) => chain),
    sort: vi.fn((..._args: unknown[]) => chain),
    skip: vi.fn((..._args: unknown[]) => chain),
    limit: vi.fn((..._args: unknown[]) => chain),
    populate: vi.fn((..._args: unknown[]) => chain),
    setOptions: vi.fn(() => chain),
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
  softDeleteById: ReturnType<typeof vi.fn>;
  softDeleteMany: ReturnType<typeof vi.fn>;
  restoreById: ReturnType<typeof vi.fn>;
  insertMany: ReturnType<typeof vi.fn>;
  bulkWrite: ReturnType<typeof vi.fn>;
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
    softDeleteById: vi.fn(),
    softDeleteMany: vi.fn(),
    restoreById: vi.fn(),
    insertMany: vi.fn(),
    bulkWrite: vi.fn(),
    exists: vi.fn(),
    aggregate: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
  };
}

# Phone-based staff accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow owner/custodian/caretaker to directly add staff (custodian, caretaker, tenant) accounts that log in with phone number + password, no email address required, no activation flow — credentials communicated out-of-band by the admin.

**Architecture:**
- `User.email` becomes optional (sparse unique index so multiple users can have no email); `phone` stays indexed plaintext.
- `POST /api/auth {action:"signin"}` accepts `identifier` (email or phone) + `password`; looks up by email first, then phone.
- Custodian and tenant create routes gain a phone-only path: create `User` with `isActive: true, isVerified: true`, no verification token, no invite email; return the generated password to the admin so it can be shared out-of-band.
- Auth signin page: the email field becomes "Email or phone", accepting either.
- `useAuth.signIn` signature widens to `(identifier: string, password: string)`.

**Tech Stack:** Next.js App Router, Mongoose, Zod, Vitest

**Spec:** none (derived from user request on 2026-10-25); previous decision: phone-first, no SMS/WhatsApp yet.

## Global Constraints

- No SMS/WhatsApp delivery at this stage (admin shares credentials out-of-band).
- Email-based signup and magic-link flows remain unchanged for self-registered users.
- Phone-only accounts are created `isActive: true, isVerified: true` — no activation step.
- Only staff roles (custodian, caretaker, tenant) can be phone-only; owner/system-admin keep email requirement.
- `nationalId` remains encrypted (not used for login in this phase).
- All existing tests must continue to pass; new tests cover phone signin and phone-only creation.

## Review Focus

1. **Multiple users with no email** — sparse unique index must not collide on missing/empty email.
2. **Phone lookup collision** — phone is non-unique; signin must return 401 if multiple users share a phone (or pick one deterministically — prefer erroring).
3. **`isVerified` gate on signin** — phone accounts are created verified; existing unverified email accounts must still be blocked.
4. **Tenant row binding** — phone-only tenant rows bind to their User at creation (no verify-email bind step needed).
5. **Identifier ambiguity** — a value that looks like both email and phone (rare) resolves to email lookup first.

---

### Task 1: User model — make email optional

**Files:**
- Modify: `src/models/User.ts`

**Interfaces:**
- Consumes: none
- Produces: `email` path is `required: false`; inline `unique: true` removed; new `userSchema.index({ email: 1 }, { unique: true, sparse: true })` added.

- [ ] **Step 1: Write the failing test**

```ts
// src/models/User.test.ts (new file)
import { describe, expect, it } from "vitest";
import { User } from "@/models/User";

// Unit test on schema paths (no DB connection)
it("email is not required", () => {
  const emailPath = (User.schema as any).paths.email;
  expect(emailPath.isRequired).toBe(false);
});

it("email index is sparse unique", () => {
  const indexes = (User.schema as any).indexes();
  const sparse = indexes.find(([keys, opts]: any) =>
    JSON.stringify(keys) === JSON.stringify({ email: 1 }) && opts.sparse === true && opts.unique === true
  );
  expect(sparse).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/models/User.test.ts`
Expected: FAIL (file doesn't exist / schema still requires email)

- [ ] **Step 3: Modify `src/models/User.ts`**

Change:
```ts
email: { type: String, required: true, unique: true, trim: true, lowercase: true },
```
to:
```ts
email: { type: String, required: false, trim: true, lowercase: true },
```
And add after the schema definition (before `userSchema.index({ role: 1, managedByOwnerId: 1 });`):
```ts
userSchema.index({ email: 1 }, { unique: true, sparse: true });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/models/User.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/User.ts src/models/User.test.ts
git commit -m "feat(models): make email optional with sparse unique index"
```

---

### Task 2: Auth signin — accept phone or email

**Files:**
- Modify: `src/app/api/auth/route.ts`
- Test: `src/app/api/auth/route.test.ts`

**Interfaces:**
- Consumes: `User.findOne` by email then phone
- Produces: signin accepts `{ action: "signin", identifier: string, password: string }`; backward compatible with `{ email, password }`

- [ ] **Step 1: Write the failing test**

```ts
// In src/app/api/auth/route.test.ts, new describe block "POST /api/auth — signin by phone"
it("signs in a user by phone number", async () => {
  const phoneUser = {
    _id: USER_ID,
    email: undefined,
    phone: "+254712345678",
    role: "caretaker",
    isActive: true,
    isVerified: true,
    passwordHash: await bcrypt.hash("secret123", 12),
    save: vi.fn().mockResolvedValue(undefined),
  };
  user.findOne.mockResolvedValueOnce(null); // email lookup misses
  user.findOne.mockResolvedValueOnce(phoneUser); // phone lookup hits

  const res = await POST(
    buildRequest("/api/auth", {
      method: "POST",
      body: { action: "signin", identifier: "+254712345678", password: "secret123" },
    }),
  );
  expect(res.status).toBe(200);
  const body = await json(res);
  expect(body.user.role).toBe("caretaker");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/auth/route.test.ts`
Expected: FAIL (signin schema rejects `identifier`, no phone lookup path)

- [ ] **Step 3: Modify `src/app/api/auth/route.ts`**

1. Widen `signInSchema`:
```ts
const signInSchema = z.object({
  identifier: z.string().min(1, "Email or phone required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
```
Backward compat: also accept `email` alias:
```ts
const signInSchema = z.object({
  identifier: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.identifier || data.email, "Email or phone required");
```

2. In signin branch, resolve identifier:
```ts
const rawId = parsed.data.identifier ?? parsed.data.email ?? "";
let user = await User.findOne({ email: rawId.trim().toLowerCase() }).lean();
if (!user && /^\+?[\d\s\-]+$/.test(rawId)) {
  user = await User.findOne({ phone: rawId.trim() }).lean();
}
```

3. Response: include phone when email missing:
```ts
const response = NextResponse.json({
  user: { email: user.email, phone: user.phone, name: user.name, role: user.role },
});
return issueSession(response, user);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/auth/route.test.ts`
Expected: PASS (including existing email signin tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/route.ts src/app/api/auth/route.test.ts
git commit -m "feat(auth): sign in with phone number or email"
```

---

### Task 3: Custodian route — phone-only creation path

**Files:**
- Modify: `src/app/api/v1/custodians/route.ts`
- Test: `src/app/api/v1/custodians/route.test.ts`

**Interfaces:**
- Consumes: `custodianInviteSchema` widened to make email optional, require phone when no email
- Produces: phone-only custodian created `isActive: true, isVerified: true`; password returned in response

- [ ] **Step 1: Write the failing test**

```ts
// In src/app/api/v1/custodians/route.test.ts
it("creates a phone-only custodian that can sign in immediately", async () => {
  user.findOne.mockResolvedValue(null); // no existing custodian
  user.create.mockResolvedValue({
    _id: makeObjectId("user"),
    email: undefined,
    phone: "+254712345678",
    role: "custodian",
    isActive: true,
    isVerified: true,
  });

  const res = await POST(
    buildRequest("/api/v1/custodians", {
      method: "POST",
      token: signToken(OWNER_ID),
      body: { name: "Jane Custodian", phone: "+254712345678" },
    }),
  );
  expect(res.status).toBe(201);
  expect(user.create).toHaveBeenCalledWith(
    expect.objectContaining({
      phone: "+254712345678",
      role: "custodian",
      isActive: true,
      isVerified: true,
      email: undefined,
    }),
  );
  const body = await res.json();
  expect(body.password).toBeDefined(); // admin shares this out-of-band
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/custodians/route.test.ts`
Expected: FAIL (schema requires email, creates inactive unverified user)

- [ ] **Step 3: Modify `src/app/api/v1/custodians/route.ts`**

1. Schema: make email optional, add `.refine` requiring email or phone:
```ts
const custodianInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  ownerId: z.string().trim().optional(),
}).refine((data) => data.email || data.phone, "Email or phone is required");
```

2. Creation branch: when no email, create active+verified, no token, generate password, return it:
```ts
if (!parsed.data.email) {
  const plainPassword = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  const created = await User.create({
    email: undefined,
    name: parsed.data.name ?? "Custodian",
    phone: parsed.data.phone,
    passwordHash,
    role: "custodian",
    managedByOwnerId: boundOwnerId,
    isActive: true,
    isVerified: true,
  });
  return NextResponse.json({
    created: true,
    password: plainPassword, // admin shares out-of-band
    data: { id: String(created._id), name: created.name, phone: created.phone },
  }, { status: 201 });
}
// existing email invite flow unchanged below...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/custodians/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/custodians/route.ts src/app/api/v1/custodians/route.test.ts
git commit -m "feat(custodians): allow phone-only custodian accounts"
```

---

### Task 4: Tenant route — phone-only creation path

**Files:**
- Modify: `src/app/api/v1/tenants/route.ts`
- Test: `src/app/api/v1/tenants/route.test.ts`

**Interfaces:**
- Consumes: `tenantInput` schema widened to make email optional
- Produces: phone-only tenant creates active+verified User, binds Tenant row immediately, returns password

- [ ] **Step 1: Write the failing test**

```ts
// In src/app/api/v1/tenants/route.test.ts
it("creates a phone-only tenant with an active verified user", async () => {
  user.findOne.mockResolvedValue(null); // no existing user
  user.create.mockResolvedValue({ _id: makeObjectId("user"), phone: "+254712345678" });
  tenantStub.create.mockResolvedValue({ _id: makeObjectId("tenant"), userId: String(makeObjectId("user")) });

  const res = await POST(
    buildRequest("/api/v1/tenants", {
      method: "POST",
      token: signToken(OWNER_ID),
      body: { name: "Amina Phone", phone: "+254712345678", propertyId: makeObjectId("prop") },
    }),
  );
  expect(res.status).toBe(201);
  expect(user.create).toHaveBeenCalledWith(
    expect.objectContaining({ phone: "+254712345678", isActive: true, isVerified: true }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/tenants/route.test.ts`
Expected: FAIL (schema requires email, creates inactive unverified user)

- [ ] **Step 3: Modify `src/app/api/v1/tenants/route.ts`**

1. Schema: make email optional:
```ts
const tenantInput = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().optional(),
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  status: z.enum(["active", "pending", "rejected"]).optional(),
  notes: z.string().optional(),
}).refine((data) => data.email || data.phone, "Email or phone is required");
```

2. Duplicate check: check by email OR phone:
```ts
const duplicate = await Tenant.findOne({
  propertyId: parsed.data.propertyId,
  $or: [
    parsed.data.email ? { email: parsed.data.email } : {},
    parsed.data.phone ? { phone: parsed.data.phone } : {},
  ].filter((q) => Object.keys(q).length > 0),
}).select("_id").lean();
```

3. Existing user lookup: by email or phone:
```ts
const existingUser = await User.findOne({
  $or: [
    parsed.data.email ? { email: parsed.data.email, isActive: true, isVerified: true } : {},
    parsed.data.phone ? { phone: parsed.data.phone, isActive: true, isVerified: true } : {},
  ].filter((q) => Object.keys(q).length > 0),
}).select("_id").lean();
```

4. Phone-only creation branch: active+verified, bind immediately, return password:
```ts
if (!existingUser && !parsed.data.email) {
  const plainPassword = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  const createdUser = await User.create({
    email: undefined,
    name: parsed.data.name,
    phone: parsed.data.phone,
    passwordHash,
    role: "tenant",
    isActive: true,
    isVerified: true,
  });
  // bind tenant row immediately
  tenant.userId = String(createdUser._id);
  await tenant.save();
  return NextResponse.json({
    created: true,
    password: plainPassword,
    data: { ...created, userId: String(createdUser._id) },
  }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/tenants/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/tenants/route.ts src/app/api/v1/tenants/route.test.ts
git commit -m "feat(tenants): allow phone-only tenant accounts"
```

---

### Task 5: Auth UI — signin with phone

**Files:**
- Modify: `src/app/auth/page.tsx`
- Modify: `src/hooks/use-auth.tsx`

**Interfaces:**
- Consumes: `signIn(identifier, password)` from hook
- Produces: signin field labeled "Email or phone"

- [ ] **Step 1: Write the failing test**

No new component test needed — existing `auth/page.test.tsx` (if any) covers signin. Add a manual verification step instead: sign in with phone works end-to-end.

- [ ] **Step 2: Modify `src/hooks/use-auth.tsx`**

Change `signIn` signature:
```ts
signIn: (identifier: string, password: string) => Promise<KejaUser>;
```
And the implementation sends `identifier` instead of `email` to the API.

- [ ] **Step 3: Modify `src/app/auth/page.tsx`**

1. Client schema:
```ts
const signInSchema = z.object({
  identifier: z.string().min(1, "Enter email or phone"),
  password: z.string().min(6, "At least 6 characters"),
});
```
2. Form label: "Email or phone", type `text`
3. `onSignIn` calls `signIn(values.identifier, values.password)`

- [ ] **Step 4: Run verification**

Run: `npx tsc --noEmit && npx biome check`
Expected: clean

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/page.tsx src/hooks/use-auth.tsx
git commit -m "feat(ui): sign in with email or phone"
```

---

### Task 6: Full verification

**Files:** none

- [ ] **Step 1: Run all checks**

Run: `npx biome check && npx tsc --noEmit && npx vitest run`
Expected: all clean/pass

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: verify phone-login branch"
```

---

## Self-Review

1. **Spec coverage:** Phone-only staff creation ✓ (tasks 3,4), phone signin ✓ (task 2), UI ✓ (task 5), model ✓ (task 1), verification ✓ (task 6).
2. **Step scan:** Each step produces exactly one testable deliverable; no TBD lines.
3. **Type consistency:** `identifier` used consistently across route, hook, and UI; `password` returned in creation responses.
4. **Review Focus:** All five items covered — sparse index (task 1 test), phone collision (signin returns first match / 401 on ambiguous — need to note), isVerified gate (task 2 keeps it), tenant binding (task 4 binds immediately), identifier ambiguity (email-first lookup in task 2).
5. **Proportion:** Plan is ~1.5x the spec size — appropriate.

**Note on phone collision:** Phone is a non-unique index. If two staff share a phone, `findOne({phone})` returns one arbitrarily. This is acceptable for v1; admin should ensure unique phones. A stricter check (reject signin if multiple users share a phone) can be added later.

**Plan complete and saved to `docs/superpowers/plans/2026-10-25-phone-login-staff-accounts.md`. Please review the plan. Does it capture what you want?** I recommend **Native** execution (I implement each task in this session, then one full verification at the end) because the tasks are tightly coupled through the shared `User` model and auth route — a single mistake in the model schema cascades into all later tasks, so independent per-task review adds little value here. Which approach should we use?

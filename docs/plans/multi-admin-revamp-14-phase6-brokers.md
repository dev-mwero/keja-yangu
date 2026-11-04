# Phase 6 — Brokers

**Status:** Complete  
**Goal:** Onboard and authorise brokers without granting internal access to tenant or financial ledgers.  
**Depends on:** Phase 5 complete (`feat/revamp`, commit `2d40c90`)

> [!IMPORTANT]
> Authorization boundary: Local code, test fixtures, and scripts only. No live production database mutations or deployments.

---

## 1. Objectives & Exit Criteria

### 1.1 Objectives
1. **Domain Models for Broker Operations**:
   - `BrokerProfile`: Broker identity, agency affiliation, licensing details, county specializations, payout method details, and verification lifecycle (`pending`, `verified`, `rejected`, `suspended`).
   - `BrokerAuthorization`: Scoped grant by an authorized admin allowing a verified broker to distribute listings for a `property`, `block`, or specific `unit`.
   - `CommissionAgreement`: Scoped commercial terms (`first_month_rent`, `percentage_of_rent`, `fixed`) with rate/amount and billing account reference, agreed between admin and broker.
2. **Domain Enums & Strict Authorization Policies**:
   - Register domain enums in `src/lib/domain-enums.ts`.
   - Implement policy rules preventing brokers from accessing internal tenant data, leases, invoices, or management ledgers.
   - Enforce that admins can only authorize brokers for scopes (`property`, `block`, `unit`) where they possess active management authority.
3. **Broker Listing Distribution Integration**:
   - Integrate with Phase 5's `ListingPublisher` model.
   - Verified brokers with an active `BrokerAuthorization` and active `CommissionAgreement` can generate unique, opaque attribution `shareCode`s for active listings.
   - Instant revocation: Suspending or revoking a broker's authorization immediately invalidates their ability to publish or distribute those listings.
4. **Privacy Redaction & Data Fencing**:
   - Ensure all broker-accessible endpoints and views strictly redact tenant PII, private landlord details, financial account credentials, and internal property notes.
5. **Broker & Admin Dashboards**:
   - Dedicated Broker Dashboard at `/dashboard/broker` with verification status, active authorizations, distributable listings, and share link generation.
   - Admin Broker Management at `/dashboard/admin/brokers` (or integrated into property/unit views) to review, authorize, and set commission terms.

### 1.2 Exit Criteria (from Multi-Admin Revamp Master Plan)
- [x] Unverified or suspended brokers cannot access marketplace distribution tools or generate share links.
- [x] A broker cannot publish or generate share links outside an active authorization and active commission agreement on that exact scope.
- [x] Broker views and endpoints strictly prevent leaking tenant names, contact details, lease contracts, or internal financial accounts.
- [x] Admins can authorize brokers only within their assigned property/block/unit scope.
- [x] Revocation or suspension takes effect immediately on publisher distribution.
- [x] Full Vitest test suite (206 files, 1,886 tests), TypeScript typecheck (`tsc --noEmit`), and Biome linting pass cleanly.

---

## 2. Domain Models & Schemas

### 2.1 `BrokerProfile` (`src/models/BrokerProfile.ts`)
```ts
export interface IBrokerProfile {
  userId: string;
  agencyName?: string;
  licenseNumber?: string;
  phone: string;
  email: string;
  counties: string[];
  specialties: string[];
  status: "pending" | "verified" | "rejected" | "suspended";
  payoutMethod?: {
    type: "mpesa" | "bank";
    details: Record<string, string>;
  };
  verifiedBy?: string;
  verifiedAt?: Date;
  verificationNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

### 2.2 `BrokerAuthorization` (`src/models/BrokerAuthorization.ts`)
```ts
export interface IBrokerAuthorization {
  brokerId: string; // userId of broker
  scopeType: "property" | "block" | "unit";
  scopeId: string; // propertyId, blockId, or unitId
  propertyId: string; // denormalized for index resolution
  status: "active" | "suspended" | "revoked";
  grantedBy: string; // admin userId
  grantedAt: Date;
  validFrom: Date;
  validTo?: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

### 2.3 `CommissionAgreement` (`src/models/CommissionAgreement.ts`)
```ts
export interface ICommissionAgreement {
  brokerId: string;
  scopeType: "property" | "block" | "unit";
  scopeId: string;
  propertyId: string;
  basis: "first_month_rent" | "percentage_of_rent" | "fixed";
  rateBps?: number; // basis points, e.g. 5000 = 50%
  fixedAmountMinor?: number; // e.g. in KES cents
  currency: string; // "KES"
  status: "draft" | "active" | "terminated";
  payerBillingAccountId?: string;
  termsAcceptedByBrokerAt?: Date;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

---

## 3. Services & Business Logic (`src/lib/brokers.ts`)

1. **`applyForBrokerProfile(userId, data)` & `updateBrokerProfile(userId, data)`**:
   - Handles onboarding submission and edits when in `pending` state.
2. **`verifyBrokerProfile(profileId, adminActor, decision, notes)`**:
   - Audited transition from `pending` to `verified` or `rejected`/`suspended`.
3. **`authorizeBroker(adminActor, { brokerId, scopeType, scopeId, validTo, notes })`**:
   - Validates that `adminActor` has active management assignment on the scope.
   - Validates that broker profile is `verified`.
   - Creates or updates `BrokerAuthorization`.
   - Emits an `AuditEvent`.
4. **`createCommissionAgreement(adminActor, agreementData)` & `acceptCommissionAgreement(brokerActor, agreementId)`**:
   - Sets terms and binds the agreement to the scope.
5. **`canBrokerDistributeListing(brokerUserId, listingId)`**:
   - Pure check: profile is `verified`, active `BrokerAuthorization` matches listing's property/block/unit, and active `CommissionAgreement` is attached.
6. **`createBrokerPublisher(brokerUserId, listingId)`**:
   - Verifies distribution eligibility.
   - Reuses or creates a `ListingPublisher` record with `role: "broker"`, generating a unique, opaque `shareCode`.
7. **`revokeBrokerAuthorization(adminActor, authId, reason)`**:
   - Marks authorization `revoked`.
   - Automatically suspends associated broker `ListingPublisher` records for that scope.
   - Writes `AuditEvent`.
8. **Redacted Prospect View Helper**:
   - Redacts any inquiry or prospect details so only anonymous/redacted identifiers and status are visible to the broker.

---

## 4. API Routes

1. **`GET /api/v1/brokers/profile` & `POST /api/v1/brokers/profile`**:
   - Current user's broker profile read/upsert.
2. **`GET /api/v1/brokers`**:
   - Admin listing of brokers with profile status and count of authorizations.
3. **`POST /api/v1/brokers/[id]/verify`**:
   - System admin verification/suspension endpoint.
4. **`GET /api/v1/brokers/[id]/authorizations` & `POST /api/v1/brokers/[id]/authorizations`**:
   - Admin authorization endpoint for a broker on a property/block/unit.
5. **`PATCH /api/v1/brokers/authorizations/[id]`**:
   - Revoke/suspend an authorization.
6. **`GET /api/v1/brokers/authorizations`**:
   - Broker's view of their active authorizations.
7. **`GET /api/v1/brokers/listings` & `POST /api/v1/brokers/listings/[id]/publish`**:
   - Broker discovers listings they are authorized to distribute and generates share links.

---

## 5. UI & Dashboards

1. **Broker Dashboard (`/dashboard/broker`)**:
   - Overview of broker verification state.
   - Tab for "Distributable Listings" where brokers can view available inventory matching their authorizations and copy share links (`/marketplace/<id>?ref=<shareCode>`).
   - Tab for "My Authorizations & Agreements".
2. **Admin Broker Controls (`/dashboard/admin/brokers` or within Property/Unit settings)**:
   - Interface for property admins to find verified brokers, grant authorizations on units/properties, and configure commission terms.

---

## 6. Implementation Steps

1. **Step 1: Domain Enums & Models**:
   - Update `src/lib/domain-enums.ts`.
   - Create `BrokerProfile`, `BrokerAuthorization`, and `CommissionAgreement` Mongoose models with unit tests.
2. **Step 2: Broker Service Logic & Model Stubs**:
   - Implement `src/lib/brokers.ts` and test suite `src/lib/brokers.test.ts`.
   - Update model mocks in `src/test/utils/model-mocks.ts`.
3. **Step 3: Route Handlers**:
   - Implement `/api/v1/brokers/*` route handlers with full unit test coverage.
4. **Step 4: Frontend UI Views**:
   - Add `/dashboard/broker` page and admin broker management view.
   - Ensure navigation and role-based permissions integrate cleanly.
5. **Step 5: Full Verification**:
   - Run `npm run typecheck`, Biome checks, and the full test suite (`npm test -- --run`).
   - Confirm all exit criteria are satisfied before committing.


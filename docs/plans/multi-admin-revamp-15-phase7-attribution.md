# Phase 7 — Acquisition Attribution

**Status:** Implemented — Verification Pending Review  
**Goal:** Reliably record who sourced a tenancy, enforce server-side attribution validation and conflict resolution, lock attribution on application submission, and confirm attribution upon unit lease allocation.  
**Depends on:** Phase 6 complete (`feat/revamp`, commit `8fcbf5c`)

> [!IMPORTANT]
> Authorization boundary: Local code, test fixtures, and scripts only. No live production database mutations or deployments.

---

## 1. Objectives & Exit Criteria

### 1.1 Objectives
1. **Canonical `Attribution` Domain Model**:
   - Create `src/models/Attribution.ts` capturing tenant acquisition lineage: `source` (`broker`, `direct`, `platform`, `admin`), `status` (`provisional`, `locked`, `confirmed`, `reversed`, `disputed`), `listingId`, `publisherUserId`, `brokerUserId`, `commissionAgreementId`, `applicationId`, `leaseId`, and dispute lineage (`supersededByAttributionId`).
   - Implement append-only integrity: historical records are never mutated in-place; disputes or adjustments create superseding records with clear audit justification.
2. **Server-Side Share-Code Validation & Provisional Touch Capture**:
   - Provide `/api/v1/attribution/touch` endpoint to validate public `ref` share codes server-side against active `ListingPublisher`s.
   - Enforce 30-day last-touch window and 90-day provisional attribution lifespan.
3. **Application Attribution Binding & Locking**:
   - On rental application submission (`POST /api/v1/applications`), bind the active attribution (from shareCode or direct platform default).
   - Lock attribution into state `locked` on submission so subsequent browsing or competing links cannot alter the applicant's sourcing origin.
4. **Lease Allocation Confirmation**:
   - Integrate with unit lease creation in `src/lib/allocation.ts`.
   - Transition `Attribution.status` from `locked` to `confirmed` upon lease creation and set `leaseId`.
   - Ensure unique constraint: maximum one confirmed attribution per lease/tenancy.
5. **Dispute & Resolution Workflow**:
   - Provide system-admin resolution mechanism (`/api/v1/attribution/[id]/resolve-dispute`) that records superseding attributions, preserving complete audit trails.
6. **Redacted Broker Prospect Visibility**:
   - Expose `/api/v1/brokers/prospects` returning anonymized/redacted applications originating from the broker's attributed share codes without exposing tenant PII.
7. **Attribution Reconciliation Tooling**:
   - Build `src/lib/attribution-reconciliation.ts` and CLI runner `scripts/reconcile-attributions.ts` verifying that every confirmed attribution maps to an active lease and no lease has multiple confirmed attributions.

### 1.2 Exit Criteria (from Multi-Admin Revamp Master Plan)
- [x] Every broker-sourced application has a validated server-side attribution record.
- [x] Direct and admin applications have explicit `direct` / `platform` attribution.
- [x] Confirmed attribution is strictly unique per tenancy/lease (enforced by schema and application logic).
- [x] Attribution history is append-only (disputes create superseding records).
- [x] Unit allocation automatically links application → lease and confirms attribution.
- [x] Broker prospect views strictly redact tenant contact info and PII.
- [x] Full Vitest test suite, TypeScript typecheck (`tsc --noEmit`), and Biome linting pass cleanly.

---

## 2. Domain Models & Schemas

### 2.1 `Attribution` (`src/models/Attribution.ts`)
```ts
export interface IAttribution {
  applicationId?: string;
  leaseId?: string;
  unitId: string;
  propertyId: string;
  listingId: string;
  publisherId?: string;
  publisherUserId?: string;
  brokerUserId?: string;
  commissionAgreementId?: string;
  shareCode?: string;
  source: "broker" | "direct" | "platform" | "admin";
  status: "provisional" | "locked" | "confirmed" | "reversed" | "disputed";
  touchTimestamp: Date;
  lockedAt?: Date;
  confirmedAt?: Date;
  reversedAt?: Date;
  reversalReason?: string;
  supersededByAttributionId?: string;
  disputeReason?: string;
  disputedByUserId?: string;
  disputeResolvedAt?: Date;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
```

#### Indexes:
- Partial unique index on `{ leaseId: 1 }` where `{ status: "confirmed" }`
- Partial unique index on `{ applicationId: 1 }` where `{ status: { $in: ["provisional", "locked"] } }`
- Index on `{ brokerUserId: 1, status: 1 }`
- Index on `{ listingId: 1, status: 1 }`

---

## 3. Services & Core Logic (`src/lib/attributions.ts`)

1. **`recordProvisionalTouch(shareCode: string, unitId: string)`**:
   - Looks up active `ListingPublisher` by `shareCode`.
   - Validates that listing is active and unit matches.
   - If broker publisher, verifies broker profile is verified and authorization is active.
   - Returns provisional attribution context token/payload.
2. **`bindApplicationAttribution(applicationId: string, input: { shareCode?: string; unitId: string; propertyId: string; listingId?: string; actorUserId?: string })`**:
   - Resolves share code if provided; falls back to `"direct"` / `"platform"`.
   - Creates `Attribution` record with `status: "locked"`, `lockedAt: new Date()`.
   - Emits `AuditEvent`.
3. **`confirmAttributionForLease(unitId: string, leaseId: string, applicationId?: string)`**:
   - Finds locked attribution matching `applicationId` or `unitId`.
   - Transitions state to `confirmed`, sets `confirmedAt: new Date()`, `leaseId`.
   - Writes `AuditEvent`.
4. **`resolveAttributionDispute(systemAdminActor, attributionId, { newBrokerUserId, newAgreementId, reason })`**:
   - Marks original attribution as `disputed` with `supersededByAttributionId`.
   - Creates new superseding `Attribution` record with `status: "confirmed"`.
   - Emits `AuditEvent`.
5. **`getBrokerProspects(brokerUserId: string, pagination)`**:
   - Queries attributions where `brokerUserId === brokerUserId`.
   - Joins application & unit details.
   - Projects through `toRedactedProspectView` to guarantee tenant PII protection.

---

## 4. API Endpoints

1. **`POST /api/v1/attribution/touch`**:
   - Validates public share code on listing open or prospect inquiry.
2. **`GET /api/v1/brokers/prospects`**:
   - Broker's view of attributed prospects and status pipeline.
3. **`GET /api/v1/admin/attributions`**:
   - Admin view of attributions across properties.
4. **`POST /api/v1/admin/attributions/[id]/dispute`**:
   - Dispute initiation and system-admin resolution endpoint.

---

## 5. Integration Hooks

1. **Application Submission Hook (`src/app/api/v1/applications/route.ts`)**:
   - Read `ref` query or body `shareCode` during application creation, calling `bindApplicationAttribution`.
2. **Lease Allocation Hook (`src/lib/allocation.ts`)**:
   - In `allocateUnit`, call `confirmAttributionForLease(unitId, createdLease._id, applicationId)`.

---

## 6. Implementation Steps

1. **Step 1: Domain Enums & Model**:
   - Add `ATTRIBUTION_SOURCES` and `ATTRIBUTION_STATUSES` to `src/lib/domain-enums.ts`.
   - Create `src/models/Attribution.ts` and `src/models/Attribution.test.ts`.
   - Update model stubs in `src/test/utils/model-mocks.ts`.
2. **Step 2: Attribution Service Layer**:
   - Implement `src/lib/attributions.ts` and unit tests in `src/lib/attributions.test.ts`.
   - Implement reconciliation logic in `src/lib/attribution-reconciliation.ts` + tests.
   - Create CLI runner `scripts/reconcile-attributions.ts`.
3. **Step 3: Allocation & Application Integration**:
   - Wire `bindApplicationAttribution` into application submission route.
   - Wire `confirmAttributionForLease` into `allocateUnit` in `src/lib/allocation.ts`.
4. **Step 4: API Routes**:
   - Implement `/api/v1/attribution/touch`, `/api/v1/brokers/prospects`, and admin attribution endpoints.
5. **Step 5: Broker Dashboard Prospects View**:
   - Wire prospects tab in `/dashboard/broker` to display redacted prospect pipeline.
6. **Step 6: Full Verification**:
   - Run typecheck, Biome linting, and full test suite (`npm test -- --run`).

---

## 7. Implementation Notes

**Delivered:**
- `Attribution` model, enums, service layer, reconciliation module, and CLI runner.
- Application submission binds and locks attribution (awaited, non-fatal).
- `allocateUnit` confirms attribution for the created/refreshed lease and links the application.
- API routes: `POST /api/v1/attribution/touch`, `GET /api/v1/brokers/prospects`,
  `GET /api/v1/admin/attributions`, `POST /api/v1/admin/attributions/[id]/dispute`.
- Marketplace applications forward `ref` share codes and listing ids; broker dashboard
  shows the redacted prospects pipeline.
- Route/service/model tests added; full Vitest suite (213 files / 1918 tests), `tsc --noEmit`,
  and Biome check pass.

**Deferred:**
- The 30-day last-touch window and 90-day provisional lifespan are not enforced yet.
  Touch validation is stateless, so application submission binds the share code directly.
  Enforcing the windows requires a persisted touch-session store and is tracked as a follow-up.


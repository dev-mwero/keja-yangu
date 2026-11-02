# Stage 1 — Authorization Design

**Status:** Phase 1 implementation authorized 2026-11-02; enforcement rollout incomplete
**Date:** 2026-11-01; decision reconciliation: 2026-11-02
**Depends on:** `multi-admin-revamp-03-domain-model.md`

> `multi-admin-revamp-09-approval.md` is authoritative for approved product
> decisions. The repository has an assignment-backed policy foundation, but
> most existing route families still use legacy checks or opt-in enforcement;
> this document describes the target, not current universal behavior.

---

## 1. Goals

1. Replace implicit owner/caretaker scoping with explicit, scoped assignments.
2. Make every API mutation enforce the same policy path.
3. Keep tenants and brokers inside narrow, explicit boundaries.
4. Make revocation immediate and auditable.
5. Keep system administration separate from customer administration.
6. Provide a frontend capability model without making the UI the security
   boundary.

Non-goals for the first release:

- attribute-based policy language or an external policy engine;
- per-field ACLs;
- delegated administration of system roles;
- cross-tenant identity merging.

---

## 2. Actors and authority sources

| Actor | Authority source | Notes |
| --- | --- | --- |
| `system-admin` | Global role | Platform operations only; not a property admin by default |
| `admin` | Active `ManagementAssignment` | Property/block/unit scope; may hold billing permissions |
| `custodian` | Active assignment | Owner/manager delegate with a narrower maximum |
| `caretaker` | Active assignment | Operational staff with explicit permissions |
| `broker` | Verified `BrokerProfile` + active `BrokerAuthorization` + active `CommissionAgreement` for publishing | No access to internal tenant/finance data |
| `tenant` | Own `Tenant`/`User` identity | Own records and permitted vacancies only |

**No role grants property access on its own**, except `system-admin`. In
particular, `User.role = admin` without an assignment can sign in but sees no
portfolio.

---

## 3. Role maximums

An assignment grants a subset of the role maximum. The effective permission is:

```text
effective = assignment.permissions ∩ roleMaximum(role)
```

| Capability group | admin | custodian | caretaker | broker | tenant | system-admin |
| --- | --- | --- | --- | --- | --- | --- |
| Property read | ✓ | ✓ | ✓ | listing subset | vacancy subset | ✓ |
| Property create/claim | ✓ | — | — | — | — | ✓ |
| Property edit/structure | ✓ | ✓ | optional | — | — | ✓ |
| Property archive/merge | ✓ | — | — | — | — | ✓ |
| Assignment read | ✓ | own scope | own scope | — | — | ✓ |
| Assignment grant/revoke | ✓ | optional, narrower | — | — | — | ✓ |
| Ownership read | ✓ | ✓ | — | — | — | ✓ |
| Ownership write | — | — | — | — | — | ✓ |
| Unit read | ✓ | ✓ | ✓ | listing subset | own/vacancy | ✓ |
| Unit manage | ✓ | ✓ | optional | — | — | ✓ |
| Tenant read/manage | ✓ | ✓ | optional | own prospects only | own | ✓ |
| Application read/decide | ✓ | ✓ | optional | own prospects only | own | ✓ |
| Move request read/decide | ✓ | ✓ | optional | — | own/create | ✓ |
| Lease read/manage | ✓ | ✓ | optional read | own tenancy summary only | own | ✓ |
| Allocation/vacate | ✓ | optional | — | — | — | ✓ |
| Invoice read/manage/generate | ✓ | ✓ | optional | — | own | ✓ |
| Payment config | billing permission | — | — | — | — | ✓ |
| Service fees | billing permission | optional | — | — | — | ✓ |
| Complaint/chat | ✓ | ✓ | optional | — | own | ✓ |
| Announcement | ✓ | ✓ | optional | — | read | ✓ |
| Documents | ✓ | ✓ | optional | listing/own docs | own | ✓ |
| Listing read | ✓ | ✓ | optional | authorised units | public/own | ✓ |
| Listing publish/pause | ✓ | ✓ | optional | authorised units | — | ✓ |
| Broker authorise | ✓ | optional | — | — | — | ✓ |
| Commission agreement | billing permission | — | — | accept own | — | ✓ |
| Commission read | ✓ | billing scope | — | own | — | ✓ |
| Commission approve | billing permission | — | — | — | — | ✓ |
| Commission payout | — | — | — | — | — | ✓ |
| Audit read | own property subset | — | — | own events subset | — | ✓ |
| Platform taxonomy/recycle bin | — | — | — | — | — | ✓ |

`optional` means the specific assignment must include the permission; the role
maximum alone does not grant it. The product may decide to exclude some
capabilities from a role permanently; this table is the proposed maximum.

---

## 4. Scope containment

### 4.1 Scope hierarchy

```text
property
  ├─ block
  │    └─ unit
  └─ unit (unit may exist without a block in legacy data; normalise first)
```

Assignment scopes are monotonic:

| Assignment scope | Covers |
| --- | --- |
| property | All blocks and units in the property |
| block | That block and its units |
| unit | That unit only |

A unit-scoped assignment never grants access to sibling units, the block
record, property financials, or tenant lists outside that unit.

### 4.2 Resource resolution

Every policy call receives a **server-loaded** resource. Never trust
`propertyId`, `unitId` or `ownerId` from the request body for authorisation.

| Resource | Resolution |
| --- | --- |
| `Property` | By `_id` |
| `Block` | By `_id`, then `propertyId` |
| `Unit` | By `_id`, then `propertyId` and `blockId` |
| `Tenant` | By `_id`, then `propertyId`; unit from active lease if present |
| `Application` | By `_id`, then `unitId` (preferred) or `propertyId` |
| `MoveRequest` | By `_id`, then `unitId` |
| `Lease` | By `_id`, then `unitId` |
| `Invoice` | By `_id`, then `unitId`; fall back to `leaseId` during migration |
| `Payment` | By `_id` → `invoiceId` → unit |
| `Listing` | By `_id` → `unitId` |
| `BrokerAuthorization` | Its own scope fields |
| `CommissionAgreement` | Its scope fields |
| `Attribution` | `unitId` |
| `CommissionAccrual` | `attributionId` → unit |
| `PropertyDocument` | `scopeType`/`scopeId`, then property |
| `Complaint` | `unitId` or `propertyId` |
| `ChatThread` | `unitId`/`tenantId` → property |

If a resource's parent chain is missing or inconsistent, deny with `403` and
record an audit anomaly. Do not infer a broader scope.

### 4.3 Effective scope for each actor

```text
system-admin:
  global, except actions explicitly reserved for tenant self-service

tenant:
  own User, own Tenant rows, own leases, own invoices/payments, own requests,
  own complaints/chat, public listings, and vacancies the product exposes at
  the tenant's own property

broker:
  own BrokerProfile, own authorisations, listings attached to authorised units,
  own publisher share codes, own leads/applications/attributions, own
  commission summaries; redacted tenant contact until conversion/consent

admin/custodian/caretaker:
  union of active assignment scopes, intersected with role maximum and
  assignment permissions
```

---

## 5. Policy algorithm

```text
authorize(actor, action, resource):
  if actor is missing/inactive: deny

  if actor.role == "system-admin":
      return systemAdminPolicy(action, resource)

  if actor.role == "tenant":
      return tenantPolicy(actor, action, resource)

  if actor.role == "broker":
      return brokerPolicy(actor, action, resource)

  if actor.role not in {admin, custodian, caretaker}: deny

  for assignment in activeAssignments(actor, now):
      if assignment.role != actor.role: continue
      if !contains(assignment.scope, resource): continue
      if action not in roleMaximum(actor.role): continue
      if action not in assignment.permissions: continue
      if action requires billing responsibility and !billingCovers(assignment, resource): continue
      return allow

  deny
```

Additional mandatory checks:

| Check | Enforcement |
| --- | --- |
| Same origin | All mutating API routes |
| Rate limit | Auth, public listing, application, payment, chat |
| Tenant identity | Tenant action must resolve to the actor's own `Tenant`/`User` |
| Broker ownership | Broker action must reference actor's own profile/authorisation |
| Listing eligibility | Unit available + active billing assignment; validate a separate active reservation record when reservations are implemented |
| Broker publishing | Verified profile + active authorisation + active agreement |
| Commission payment | `system-admin` only; no self-approval by broker |
| Billing separation | Actor approving commission cannot be the broker |
| Soft delete | Archived/merged records are read-only except restore/merge |

`activeAssignments` must exclude `pending`, `suspended`, `revoked` and
`expired`, and enforce `startsAt <= now < endsAt`.

Revocation takes effect on the next request. If an assignment cache is added, it
must be versioned and invalidated synchronously; the first release should read
from MongoDB per request to avoid stale authority.

---

## 6. Route enforcement standard

### 6.1 Required pattern

Every route must:

1. authenticate;
2. load the resource by id;
3. call `authorize(actor, action, resource)`;
4. validate the body;
5. perform the domain operation through a service;
6. write an audit event.

The current `requirePermission(request, action, { resource })` adapter can be
retained during migration, but its implementation must delegate to the policy
and its resource type must be explicit. Resource-free checks are allowed only
for:

- creating a new property/claim;
- listing the actor's own assignments/capabilities;
- public listing reads;
- tenant self-service routes that resolve the tenant from the actor.

### 6.2 Prohibited patterns

- `requirePermission(request, "unit:read")` without a resource for staff.
- Checking `resource.ownerId` directly in a route.
- Fetching a resource after a mutation has started.
- Using a body-supplied `propertyId` as the only authorisation input.
- Trusting `allowedRoles` on the client.
- Using `console.info` as the only audit record.

### 6.3 Action catalogue

Proposed action names (final naming may follow the existing `resource:verb`
convention):

```text
property:read, property:create, property:claim, property:edit,
property:structure:edit, property:archive, property:merge, property:verify
assignment:read, assignment:grant, assignment:revoke
ownership:read, ownership:manage
block:read, block:manage
unit:read, unit:manage, unit:allocate, unit:vacate
tenant:read, tenant:manage
application:read, application:manage
move-request:read, move-request:manage, move-request:create
lease:read, lease:manage
invoice:read, invoice:generate, invoice:manage, invoice:mark-paid
payment:read, payment:reconcile
billing:read, billing:manage, payment-config:manage, service-fee:manage
complaint:read, complaint:manage
chat:read, chat:manage
announcement:read, announcement:manage
document:read, document:manage
listing:read, listing:publish, listing:pause, listing:withdraw
broker:profile:read, broker:profile:manage, broker:verify,
broker:authorize, broker:agreement:manage
attribution:read, attribution:dispute, attribution:resolve
commission:read, commission:approve, commission:payout
audit:read
```

---

## 7. Tenant authorization

Tenant rules are intentionally narrow:

- A tenant may read/update only their own profile and contact preferences.
- A tenant may see only their own `Tenant` rows, leases, invoices, payments,
  move requests, complaints and chat threads.
- A tenant may see public listings and, if the product enables it, available
  units at their own property. This must be a deliberate route, not a by-product
  of `unit:read`.
- A tenant may create an application/lead inquiry; duplicate prevention is per
  property/listing.
- A tenant cannot list, manage, or see other tenants' contacts, invoices,
  documents or occupancy.
- Tenant document access is limited to own lease/receipt documents marked
  `tenant` visibility.

The current `unit:read` grant to tenants is replaced by explicit
`vacancy:read-own-property` semantics or a dedicated public detail route.

---

## 8. Broker authorization

### 8.1 Profile gate

Every broker request first checks:

1. `User.role = broker` and active user;
2. `BrokerProfile.status = verified`;
3. no suspension.

A broker with a pending/rejected/suspended profile can only manage their own
profile application.

### 8.2 Authorisation gate

For a unit/property action, the broker must have an active
`BrokerAuthorization` covering the resource. Authorisation does **not** grant:

- tenant lists or tenant contact details;
- invoice/payment records;
- internal notes, complaints, chat or documents;
- ownership, billing or assignment management;
- the right to change rent without a listing revision.

### 8.3 Publishing gate

To publish or distribute:

- active authorisation;
- active `CommissionAgreement` on the same scope;
- verified profile;
- listing is `draft`/`active` and unit is available; reservations are separate
  records and must not add `reserved` to `Unit.status` in the first release;
- no conflicting exclusive agreement (if exclusive is enabled);
- publisher share code created.

### 8.4 Broker data visibility

| Data | Visibility |
| --- | --- |
| Public listing fields | Full |
| Own publisher/share performance | Full |
| Own leads/applications | Own prospects, limited contact data |
| Tenant identity | Only after application consent or confirmed tenancy, and only fields needed for handover |
| Commission accrual/payout | Own only |
| Property internal notes | None |
| Other brokers' attribution | None |

### 8.5 Disputes

`attribution:dispute` can be raised by an admin, broker or tenant with
evidence. Only `system-admin` can `attribution:resolve`, and resolution creates
a new superseding record; it never edits the original history.

---

## 9. Frontend authorization

- The API remains the only security boundary.
- The session/capability endpoint returns the actor's role, active assignment
  scopes and effective actions. The UI uses this to render navigation and
  controls.
- Dashboard route guards must match **path prefixes**, not only exact base
  paths. `/dashboard/tenant/payments` must require the tenant role even if the
  base `/dashboard/tenant` is allowed.
- `AuthGuard` must handle nested segments and unknown roles by denying rather
  than defaulting to "any signed-in user".
- Public pages must not receive staff-only fields, even if the client does not
  render them.
- Broker pages use a separate dashboard namespace and never reuse admin tenant
  tables without redaction.
- Capability changes after revocation are reflected on the next session
  refresh; sensitive actions are re-authorised server-side regardless of UI
  state.

---

## 10. System administration

`system-admin` is not "super admin for every property" in the product UI. It
may:

- manage platform taxonomy, recycle bin, verification and merges;
- verify/suspend brokers;
- resolve attribution disputes;
- execute commission payouts;
- read audit events;
- perform emergency data repairs with an audited reason.

It should not routinely read tenant PII or mutate invoices. Break-glass access
must require a reason and produce a high-severity audit event. If the product
wants a separate platform-finance role, that is a new role decision.

---

## 11. Audit requirements

Every privileged action records:

| Field | Requirement |
| --- | --- |
| Actor | user id, role, assignment id(s) used |
| Action | canonical action name |
| Entity | type + id + property/unit scope |
| Before/after | Redacted diff; never passwords, tokens, full national IDs or payment secrets |
| Request | request id, ip hash, user-agent hash |
| Time | server UTC |
| Outcome | `allowed`, `denied`, `failed` |
| Reason | Required for deny on sensitive actions and all break-glass actions |

Mandatory audited events:

- role change, invitation, assignment grant/revoke/suspend;
- ownership change;
- property claim/merge/verify/archive;
- billing account or unit billing reassignment;
- service fee/payment config change;
- listing publish/pause/withdraw/expiry;
- broker verification/authorisation/agreement change;
- attribution lock/confirm/reject/dispute/resolve;
- commission accrual/approval/payout/reversal;
- invoice void/manual mark-paid;
- document visibility change;
- failed authorisation on sensitive endpoints (sampled to avoid abuse noise).

Audit storage is append-only in the first release. A durable outbox is required
if the audit write can fail independently of the domain write.

---

## 12. Test matrix

### 12.1 Scope tests

| Case | Expected |
| --- | --- |
| Admin A reads own property | allowed |
| Admin A reads Admin B's property | 403 |
| Admin with unit scope reads sibling unit | 403 |
| Admin with property scope reads all units | allowed |
| Custodian reads assigned property | allowed |
| Custodian reads unassigned property | 403 |
| Caretaker reads assigned unit | allowed |
| Caretaker reads another property in same portfolio | 403 |
| Assignment expired/revoked | 403 immediately |
| Assignment pending/suspended | 403 |
| System admin reads property | allowed, audited |
| Tenant reads another tenant's invoice | 403 |
| Tenant lists tenants | 403 |
| Broker reads unauthorised listing | 403 |
| Broker reads own attribution | allowed, redacted |
| Broker reads tenant contact before conversion | 403/redacted |
| Broker publishes without agreement | 403 |
| Admin grants permission they do not hold | 403 |
| Admin grants scope larger than own | 403 |
| Broker approves own commission | 403 |
| System admin pays commission | allowed, audited |

### 12.2 Regression tests for current P0 gaps

1. Caretaker cannot call `unit-summary` for an unassigned property.
2. Caretaker cannot call `unit-counts` for an unassigned property.
3. Custodian document list includes only assigned-property documents.
4. Public property detail never returns occupied unit rents/statuses via
   `includeUnits=all`.
5. Caretaker cannot decide an application/move request for an unassigned
   property.
6. Caretaker cannot edit an unassigned unit.
7. Nested tenant dashboard paths reject non-tenant roles.

### 12.3 Service tests

- Every policy action has allow/deny tests for each role and scope level.
- Resource loaders reject parent-chain mismatches.
- Revocation invalidates an in-flight cached capability.
- Audit events are written on allow and on sensitive deny.
- No route imports a legacy `requireOwner`-style helper after cutover.

---

## 13. Rollout strategy

1. Introduce assignments and policy alongside legacy fields.
2. Backfill assignments from `ownerId`, `custodianIds`, `caretakerIds` and
   `managedByOwnerId`.
3. Dual-read in the policy adapter: if an assignment exists, use it; otherwise
   fall back to legacy logic during the compatibility window.
4. Add capability endpoint and prefix-aware dashboard guards.
5. Close P0 gaps immediately, independent of the broader rollout.
6. Flip enforcement per route family with a feature flag and audit comparison.
7. Remove legacy fallback only after all routes and tests use assignments.

Exit criteria:

- no resource-free staff permission checks remain;
- all P0 regression tests pass;
- every route family has an allow/deny matrix;
- legacy fallback logs zero unexpected accesses for a full release cycle.

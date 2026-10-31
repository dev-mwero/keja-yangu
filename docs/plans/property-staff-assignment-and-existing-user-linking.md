# Plan — Property staff assignment and existing-user linking

**Status:** Proposed — planning only  
**Date:** 2026-10-31

## Goal

Allow an owner or custodian to assign one or more caretakers and custodians to a
property. When adding a caretaker or custodian, search for the person by email
and/or phone first; reuse and link an eligible existing account instead of
creating a duplicate.

## Current state

| Area | Existing behavior | Gap |
|---|---|---|
| Property assignments | `Property` stores `caretakerIds`. Owners can edit that field in the property dialog; caretakers see properties containing their user id. | There is no `custodianIds` relationship or property UI for assigning custodians. Custodians can edit owner-scoped properties, but the property PATCH route strips caretaker assignments for custodians. |
| Team accounts | Owner/custodian team forms invite caretakers and custodians. `resolveUserByContact` checks email and phone before account creation, and the invite APIs link a same-role, same-owner existing account or return a conflict. | The form does not search before submission or show that an account will be linked. The existing user-search route does not authorize custodians and currently searches by only one contact field at a time. |
| Portfolio boundary | Staff users are associated to an owner through `managedByOwnerId`; properties use `ownerId`. | Property assignment validation must ensure each assigned user belongs to the property owner's portfolio, not merely that the user's role matches. |
| Public property reads | Public property responses omit `ownerId` and `caretakerIds`. | If `custodianIds` is added, it must also be omitted from public property responses. |

Relevant existing code: `src/models/Property.ts`, `src/app/api/v1/properties/route.ts`,
`src/app/api/v1/properties/[id]/route.ts`, `src/components/dialogs/PropertyDialog.tsx`,
`src/app/api/v1/caretakers/route.ts`, `src/app/api/v1/custodians/route.ts`,
`src/app/api/v1/users/search/route.ts`, and `src/lib/user-identity.ts`.

## Proposed behavior

### Assign staff to a property

1. Add `custodianIds: string[]` to the property model, matching the existing
   `caretakerIds` convention. Existing records naturally read as having no assigned
   custodians; no account migration or duplicate-account merge is needed.
2. Add caretaker and custodian multi-selects to property create/edit. Populate them
   from the signed-in portfolio's eligible team lists; retain existing selections
   if a previously assigned user is no longer returned by the list.
3. Allow owners and custodians to manage both assignment arrays. Preserve existing
   system-admin behavior. Caretakers may not change either array.
4. Validate assignments on the server for both property creation and updates:
   - IDs must be valid, unique, active users with the requested role.
   - Each user's `managedByOwnerId` must match the property's `ownerId`.
   - Reject invalid or cross-owner IDs with a clear 400 response; do not silently
     discard assignments.
5. Keep caretaker property visibility based on `caretakerIds`. Do not expose either
   assignment array in public listing/detail responses.
6. Preserve current property scoping and role permissions; assignment must not
   become a way to change the property's owner or a user's owner binding.

### Search and link existing users before adding team members

1. Add an explicit search/check step to the owner and custodian team invite flow.
   Normalize email and phone using the existing identity helpers, and support
   checking both when both are supplied.
2. For a match, show only safe account-identifying details (name, email, role,
   active/verification state) and explain whether the account can be linked.
   Selecting a compatible account links it to the portfolio; it must not create
   another `User`.
3. If both supplied contacts resolve to different users, stop and show a conflict.
   If the match is another role or bound to a different owner, do not allow linking
   or account creation with those already-claimed contacts; show an actionable
   conflict instead.
4. If there is no match, continue through the existing invite flow. The API's
   `resolveUserByContact` check remains authoritative at submit time to handle
   concurrent signups/invites and prevent duplicates even if the pre-search is
   stale.
5. Reuse the current email invitation / phone-only account behavior and temporary
   password handling. Do not return password hashes, national IDs, or other
   sensitive fields from a search endpoint.
6. Authorize the pre-search for owner and custodian team managers, with custodian
   searches scoped to their bound owner's portfolio wherever the result can be
   portfolio-scoped.

## Proposed implementation phases

### Phase 1 — Identity lookup and invite UX

- Extend the existing user-search flow, or add a narrowly scoped team identity
  lookup, to accept both email and phone and detect conflicting matches.
- Add custodian authorization with owner binding checks; return an explicit,
  minimal response shape.
- Add the pre-search/link state to the shared team invite UI and keep server-side
  `resolveUserByContact` validation as the final guard.
- Test no match, compatible existing match, wrong-role match, other-owner match,
  conflicting email/phone matches, inactive account paths, and lookup failures.

### Phase 2 — Property custodian assignments

- Add `custodianIds` to the property model and client property types.
- Update property create/update schemas, assignment validation, permission checks,
  and public projections.
- Add caretaker/custodian selection controls to the property dialog; ensure the
  selection payload is preserved on create and edit.
- Test owner, custodian, and system-admin assignment success; caretaker rejection;
  role mismatch, inactive user, duplicate ID, cross-owner ID, and public response
  redaction.

### Phase 3 — Portfolio surfaces and regression checks

- Check property lists, property detail, caretaker/custodian team counts, filters,
  and dashboards for assumptions that only `caretakerIds` exist.
- Add or update tests for caretaker access remaining assignment-based and for
  custodian access retaining current owner-portfolio scope.
- Run the focused API and component tests, then the project's type-check/lint
  commands covering touched files.

## Confirmed access decision

Custodians continue to access the **entire owner's portfolio**. `custodianIds` is an
explicit property-team relationship only and does not change visibility or
permissions. Property-level custodian access restrictions are out of scope.

## Out of scope

- Merging separate pre-existing accounts or changing account identity.
- Changing how owner/custodian invitations, account activation, or phone-only
  credentials are delivered.
- Changing caretaker permissions or making a property assignment grant new
  privileges.
- Restricting custodians to assigned properties unless confirmed as a product
  requirement.

# E2E (Playwright)

Critical role flows run against a live dev server + database (unlike the
Vitest suite, which mocks the DB). All five flows self-skip unless their
seeded credentials are configured, so the suite stays green without seeds.

## Setup

1. Start the app with a live DB (`.env.local` with `MONGODB_URI`):

   ```bash
   npm run dev
   ```

2. Seed one account per role (admin with an active `ManagementAssignment`,
   custodian/caretaker bound to an owner, tenant linked to a tenancy,
   system-admin) — or point `PLAYWRIGHT_BASE_URL` at a seeded environment.

3. Export credentials and run:

   ```bash
   export E2E_ADMIN_EMAIL=admin@keja.co        E2E_ADMIN_PASSWORD=...
   export E2E_CUSTODIAN_EMAIL=...              E2E_CUSTODIAN_PASSWORD=...
   export E2E_CARETAKER_EMAIL=...              E2E_CARETAKER_PASSWORD=...
   export E2E_TENANT_EMAIL=...                 E2E_TENANT_PASSWORD=...
   export E2E_SYSTEM_ADMIN_EMAIL=...           E2E_SYSTEM_ADMIN_PASSWORD=...
   npm run test:e2e
   ```

   `PLAYWRIGHT_BASE_URL` (optional) points Playwright at an already-running
   server instead of booting `npm run dev` itself.

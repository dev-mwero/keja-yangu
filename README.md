# Keja Yangu

A modern property rental and tenant management platform built with Next.js, TypeScript, and MongoDB.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **UI Components:** Radix UI + shadcn/ui
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT with bcrypt + HTTP-only cookies
- **Form Handling:** React Hook Form + Zod validation
- **Theme:** next-themes (dark/light mode)
- **Email:** Nodemailer for verification and password reset
- **Rate Limiting:** In-memory (no external dependencies)
- **Testing:** Vitest + React Testing Library

## Features

### Dashboards
- **Owner** — Portfolio overview, property distribution, revenue tracking, tenant/caretaker/custodian management
- **Custodian** — Owner-delegated portfolio management (owner-like scope for a single owner)
- **Caretaker** — Assigned properties, tenant requests, status updates
- **Tenant** — Application tracking, unit details, payment history, move-out requests

### Property structure
- Property types: **apartment, villa, bungalow**
- Optional hierarchy of **blocks → floors → units**; units are auto-generated
  and named from the structure (e.g. `GA`, `3A`) and can be renamed/rented
  individually. Units are unique per block.
- Curated **amenities** with normalization/dedupe

### Core
- Role-based JWT authentication (owner, custodian, caretaker, tenant, system-admin)
- Owner-scoped **custodian** role (owner-delegated; cannot manage other owners)
- **Move requests** (move-in / move-out) with approval that occupies/frees units
  and opens/ends leases
- Global dashboard **search** across properties, units, tenants, and invoices
- Email verification with Nodemailer (phone-only staff accounts skip email verification; credentials are shared out-of-band)
- Sign in with email or phone number
- Protected dashboard routes with AuthGuard
- Property listings with search, filters, and pagination
- Rate-limited API endpoints (in-memory)
- **Dashboard notifications** — unread in-app notifications (payments, overdue invoices, lease expiry, complaints, chat replies, announcements, move requests) surface via a bell on every dashboard with an unread count badge and mark-as-read
- Responsive design with mobile navigation
- Dark/light theme support

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your MongoDB URI, JWT secret, email config, and UploadThing token


# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`UPLOADTHING_TOKEN` (from https://uploadthing.com/dashboard → API Keys) is required for the property image upload endpoint; without it `/api/uploadthing` responds with a clear configuration error. Property images can also be added as plain URLs in the property form.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format code with Biome |
| `npm run check` | Lint + format in one pass |
| `npm run test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run typecheck` | Type-check without emitting |

## API Routes

- `GET /api/v1/properties` — List properties with pagination (`page`, `limit` params)
- `POST /api/v1/properties` — Create property (owner/custodian/caretaker; accepts optional `blocks[]` that generates units)
- `GET /api/v1/properties/[id]` — Get single property
- `PATCH /api/v1/properties/[id]` — Update property (`property:edit`)
- `DELETE /api/v1/properties/[id]` — Delete property (`property:delete`; also removes its units)
- `GET /api/v1/units` — List units scoped per role (`propertyId`, `blockId`, `status`, `tenantId` filters)
- `GET /api/v1/units/[id]` — Get a single unit (`unit:read`; tenants only see the unit they occupy)
- `PATCH /api/v1/units/[id]` — Update status/rent/name/occupant (`unit:manage`; 409 on in-block name clash)
- `DELETE /api/v1/units/[id]` — Delete a vacant unit (`unit:manage`; 409 while occupied)
- `GET /api/v1/custodians` — List an owner's custodians (owner/system-admin only)
- `POST /api/v1/custodians` — Invite or link a custodian bound to an owner (owner/system-admin; rate-limited 20/min)
- `PATCH /api/v1/custodians/[id]` — Update a custodian's profile or grant `assign_privileges` (managing owner/system-admin)
- `DELETE /api/v1/custodians/[id]` — Revoke a custodian (unlinks from owner and deactivates; owner/system-admin)
- `GET /api/v1/move-requests` — List move-requests scoped per role (`status` filter)
- `POST /api/v1/move-requests` — File a move-in/move-out request (occupying tenant, owner, custodian, or privileged caretaker)
- `PATCH /api/v1/move-requests/[id]` — Decide a move-request (`move-request:manage`; approval occupies/frees the unit and opens/ends the lease)
- `GET /api/v1/search?q=` — Global dashboard search (properties, units, tenants, invoices; scoped per role)
- `GET /api/v1/tenants` — List tenants (owner/system-admin; caretakers with `manage_tenants` privilege)
- `POST /api/v1/tenants` — Create tenant (owner/system-admin; caretakers with `manage_tenants`; rate-limited 20/min)
- `GET /api/v1/tenants/[id]` — Get single tenant (same scope as tenant list)
- `PATCH /api/v1/tenants/[id]` — Update tenant (same scope as tenant list)
- `DELETE /api/v1/tenants/[id]` — Delete tenant (same scope as tenant list)
- `GET /api/v1/caretakers` — List caretakers with privileges (owner, custodian scoped to their owner, or system-admin)
- `GET /api/v1/users/search` — Exact case-insensitive email or exact phone match (owner/system-admin; caretakers with `manage_tenants`; returns `id, name, email, role, isActive, hasVerifiedEmail`)
- `POST /api/v1/caretakers` — Invite or link a caretaker by email or phone; phone-only creates an active, verified account and returns a one-time password (owner, custodian, or system-admin; rate-limited 20/min)
- `PUT /api/v1/caretakers/[id]/privileges` — Set caretaker privileges (owner/system-admin, or a privileged custodian scoped to their owner; rate-limited 20/min)
- `GET /api/v1/leases` — List leases (`lease:manage`; owner-scoped)
- `POST /api/v1/leases` — Create lease (`lease:manage`; validates tenant/property, rate-limited 20/min)
- `GET /api/v1/leases/[id]` — Get single lease (`lease:manage`)
- `PATCH /api/v1/leases/[id]` — Update lease (`lease:manage`; `active → ended` stamps `endDate`)
- `DELETE /api/v1/leases/[id]` — Delete lease (`lease:manage`; 409 while invoices reference it)
- `GET /api/v1/invoices` — List invoices with filters (`invoice:read`; scoped per role)
- `POST /api/v1/invoices` — Create manual invoice (`invoice:manage`; rate-limited 20/min)
- `PATCH /api/v1/invoices/[id]` — Update draft/pending invoice (`invoice:manage`)
- `DELETE /api/v1/invoices/[id]` — Delete draft invoice only (`invoice:manage`)
- `POST /api/v1/invoices/[id]/mark-paid` — Mark invoice paid (`invoice:mark-paid`; or tenant for own; rate-limited 20/min)
- `POST /api/v1/invoices/[id]/void` — Void invoice (`invoice:manage`; paid cannot be voided)
- `POST /api/v1/invoices/generate` — Generate invoices for the current month (idempotent; rate-limited 20/min)

> Legacy browser localStorage invoice history is not migrated (hard cutover).
- `GET /api/v1/tenant/me/invoices` — Tenant's own invoices (`invoice:read-own`)
- `POST /api/v1/tenant/me/invoices/[id]` — Tenant marks own invoice paid (honor system, audited)
- `POST /api/v1/tenant/me/invoices/[id]/pay-initiate` — Start a Paystack checkout for a tenant's pending invoice (`invoice:read-own`; rate-limited 5/min per user; returns `authorizationUrl`)
- `POST /api/v1/payments/paystack/webhook` — Paystack `charge.success` webhook (HMAC-SHA512 signature verified over the raw body; no cookie auth, no rate limit)
- `GET /api/v1/tenant/me/payments/status?reference=` — Server-side verify fallback for a lost webhook / callback return (`invoice:read-own`)
- `GET /api/v1/notifications` — List notifications (`page`, `limit`, `unread`, `type` params; `notification:read-own`)
- `GET /api/v1/notifications/unread-count` — Unread notification count (`notification:read-own`)
- `PATCH /api/v1/notifications/[id]` — Mark one notification read (own-scope; rate-limited 20/min)
- `POST /api/v1/notifications/mark-all-read` — Mark all own notifications read (`notification:read-own`)
- `GET /api/v1/settings` — Read notification/preference settings (defaults merged with stored values; `settings:read`)
- `PATCH /api/v1/settings` — Update notification/preference settings (`settings:write`; rate-limited 20/min)
- `GET /api/v1/complaints` — List complaints scoped per role (`complaint:read-own`; optional `status` filter)
- `POST /api/v1/complaints` — Submit a complaint (tenant only; single-property tenants auto-pin, multi-property tenants pass `propertyId`; rate-limited 20/min)
- `PATCH /api/v1/complaints/[id]` — Update complaint status/resolution (`complaint:manage`; caretakers only on assigned properties; rate-limited 20/min)
- `GET /api/v1/chat/threads` — List chat threads scoped per role with per-thread unread counts (`chat:read-own`)
- `POST /api/v1/chat/threads` — Create-or-get a thread with a landlord/caretaker (tenant only; rate-limited 20/min)
- `GET /api/v1/chat/threads/[id]/messages` — Newest 100 messages ascending (`chat:read-own`; participant only)
- `POST /api/v1/chat/threads/[id]/messages` — Send a message (participant; caretakers need `send_messages`; rate-limited 30/min)
- `POST /api/v1/chat/threads/[id]/read` — Mark a thread read (participant; idempotent)
- `GET /api/v1/announcements` — List announcements scoped per role (`announcement:read`; tenant audience/property filters)
- `POST /api/v1/announcements` — Post an announcement (owner; caretakers with `manage_announcements` for their managed properties; rate-limited 20/min)
- `GET /api/v1/documents` — List document metadata scoped per role (`document:read-own`; tenants see own + shared property docs)
- `POST /api/auth` — Auth actions (`signin`, `signup`, `verify-email`, `resend-verification`)
- `GET /api/auth/me` — Get current user
- `GET /api/auth/logout` — Sign out

### Invite-or-link onboarding

Tenants, custodians, and caretakers can join by either signing up first (and
being linked by email) or being invited first:

- `POST /api/v1/tenants` links the tenant to an existing active, verified user
  by email, otherwise creates the tenant with an empty `userId` and emails an
  invite to `/auth`. The tenant's later email verification binds `Tenant.userId`.
- `POST /api/v1/caretakers` links an existing user (binding `managedByOwnerId`,
  409 if already bound to a different owner) or pre-creates an inactive,
  unverified caretaker user with a random unguessable password hash plus an
  invite email carrying a verification token. When that person later signs up
  with the same email, the signup flow adopts the pre-created account instead
  of duplicating it. A phone-only invite creates an active, verified account
  immediately and returns a one-time temporary password.
- `GET /api/v1/users/search?email=|phone=` performs exact, case-insensitive
  email or phone lookups for owner/system-admin and caretakers with
  `manage_tenants`.

Invite emails are role-specific and instruct the recipient to create their
account via `/auth` using the same email address.

### Paystack webhook registration

Register `https://<your-domain>/api/v1/payments/paystack/webhook` on the Paystack
dashboard under the **test** secret matching `PAYSTACK_SECRET_KEY`. The webhook
is authenticated solely by the `x-paystack-signature` HMAC header — it must not
sit behind any cookie/session auth. Local development requires a public tunnel
(e.g. ngrok) so Paystack can reach the endpoint.

## Project Structure

```
src/
├── app/
│   ├── api/v1/properties/    # REST API routes
│   ├── auth/                 # Auth routes (signin, verify, logout)
│   ├── dashboard/
│   │   ├── owner/            # Owner dashboard + sub-pages
│   │   ├── custodian/        # Custodian dashboard + sub-pages
│   │   ├── caretaker/        # Caretaker dashboard + sub-pages
│   │   └── tenant/           # Tenant dashboard + sub-pages
│   └── properties/           # Public property listings
├── components/               # Reusable UI components
├── config/                   # Navigation config
├── lib/                      # Utilities (email, pagination, rate-limit)
├── models/                   # Mongoose schemas (Property, Unit, MoveRequest, User, …)
├── hooks/                    # Custom React hooks
├── test/                     # Test setup files
└── proxy.ts                  # Next.js middleware
```

## Environment Variables

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
JWT_SECRET=your-jwt-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=production

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=Keja Yangu <no-reply@keja.co>

# Paystack (test keys)
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=

# UploadThing (property image uploads)
UPLOADTHING_TOKEN=
```

## User Roles

| Role | Dashboard | Access |
|------|-----------|--------|
| Owner | `/dashboard/owner` | Portfolio, accounting, reports; manages custodians, caretakers and tenants |
| Custodian | `/dashboard/custodian` | Owner-delegated portfolio management for a single owner; cannot manage other owners |
| Caretaker | `/dashboard/caretaker` | Assigned properties, tenant requests; read-only unless granted privileges |
| Tenant | `/dashboard/tenant` | Applications, payments, complaints, move-out requests |
| system-admin | `/dashboard/system-admin` | Full control over properties, tenants, and caretaker privileges |

Caretakers are read-only by default. Owners grant granular privileges — create
property, edit property, delete assigned property, manage tenants, manage
invoices — from the team page; system-admin applies to all caretakers.
Custodians are **owner-delegates**: bound to one owner via `managedByOwnerId`
and scoped to that owner's portfolio. They can invite caretakers but cannot
invite, edit, or revoke other custodians. Owners can mark a custodian as
privileged (`assign_privileges`), letting that custodian manage caretaker
privileges within the owner's portfolio; only the owner/system-admin can grant
or revoke that token.
`custodian` and `system-admin` are invite/seed-only and cannot be selected at
public signup.

Phone-only accounts: staff roles (custodian, caretaker, tenant) can be created
without an email — the admin creates an active, verified user and shares the
generated password out-of-band. Sign in accepts either email or phone.
Email verification is required for email-based accounts.

## Deployment

### Docker
```bash
docker-compose up --build
```

### GitHub Actions
CI/CD pipeline runs on push to `dev` and `main` branches.

## License

Private — Keja Yangu
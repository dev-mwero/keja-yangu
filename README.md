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
- **Owner** — Portfolio overview, property distribution, revenue tracking, tenant/caretaker management
- **Caretaker** — Assigned properties, tenant requests, status updates
- **Tenant** — Application tracking, property recommendations, payment history

### Core
- Role-based JWT authentication (owner, caretaker, tenant)
- Email verification with Nodemailer
- Protected dashboard routes with AuthGuard
- Property listings with search, filters, and pagination
- Rate-limited API endpoints (in-memory)
- Responsive design with mobile navigation
- Dark/light theme support

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your MongoDB URI, JWT secret, and email config

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

## API Routes

- `GET /api/v1/properties` — List properties with pagination (`page`, `limit` params)
- `POST /api/v1/properties` — Create property (owner/caretaker only)
- `GET /api/v1/properties/[id]` — Get single property
- `PATCH /api/v1/properties/[id]` — Update property (owner only)
- `DELETE /api/v1/properties/[id]` — Delete property (owner only)
- `GET /api/v1/tenants` — List tenants (owner/system-admin; caretakers with `manage_tenants` privilege)
- `POST /api/v1/tenants` — Create tenant (owner/system-admin; caretakers with `manage_tenants`; rate-limited 20/min)
- `GET /api/v1/tenants/[id]` — Get single tenant (same scope as tenant list)
- `PATCH /api/v1/tenants/[id]` — Update tenant (same scope as tenant list)
- `DELETE /api/v1/tenants/[id]` — Delete tenant (same scope as tenant list)
- `GET /api/v1/caretakers` — List caretakers with privileges (owner/system-admin only)
- `PUT /api/v1/caretakers/[id]/privileges` — Set caretaker privileges (owner/system-admin only; rate-limited 20/min)
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
│   │   ├── caretaker/        # Caretaker dashboard + sub-pages
│   │   └── tenant/           # Tenant dashboard + sub-pages
│   └── properties/           # Public property listings
├── components/               # Reusable UI components
├── config/                   # Navigation config
├── lib/                      # Utilities (email, pagination, rate-limit)
├── models/                   # Mongoose schemas (Property, User)
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
```

## User Roles

| Role | Dashboard | Access |
|------|-----------|--------|
| Owner | `/dashboard/owner` | Portfolio, accounting, reports; manages caretakers and tenants |
| Caretaker | `/dashboard/caretaker` | Assigned properties, tenant requests; read-only unless granted privileges |
| Tenant | `/dashboard/tenant` | Applications, payments, complaints |
| system-admin | `/dashboard/system-admin` | Full control over properties, tenants, and caretaker privileges |

Caretakers are read-only by default. Owners grant granular privileges — create
property, edit property, delete assigned property, manage tenants, manage
invoices — from the team page; system-admin applies to all caretakers.
`system-admin` is invite/seed-only and cannot be selected at public signup.

Email verification is required for all accounts.

## Deployment

### Docker
```bash
docker-compose up --build
```

### GitHub Actions
CI/CD pipeline runs on push to `dev` and `main` branches.

## License

Private — Keja Yangu
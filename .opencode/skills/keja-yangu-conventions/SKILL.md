---
name: keja-yangu-conventions
description: Repo-specific conventions for keja-yangu (Kenyan rental/property platform). Use when working in /home/mds/Desktop/keja-yangu on Next.js App Router routes, Mongoose models, RBAC/auth guards, zod schemas, react-hook-form UI, or Vitest tests; also when verifying changes (biome check, tsc, vitest) or adding API endpoints.
---

# keja-yangu conventions

Kenyan rental/housing platform: role dashboards (tenant / caretaker / custodian / owner / system-admin), property hierarchy `blocks → floors → units`, leases & move requests, invoices (Paystack), chat/complaints/announcements, soft-delete + recycle bin.

Stack: Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind 4 · shadcn/ui · Mongoose 9 · zod 4 + react-hook-form · Vitest + Testing Library · Biome.

## Definition of done

Before claiming anything passes, run and report actual output:

```bash
npm run check      # biome check --write . (format + lint + import order)
npm run typecheck  # tsc --noEmit
npm run test       # vitest run  (single file: npx vitest run src/path/file.test.ts)
```

CI (`.github/workflows/ci.yml`) runs `biome check .`, `typecheck`, `build`, `test:coverage` on `dev`/`main`.

**Next.js 16 breaking changes:** before using unfamiliar Next APIs, read the relevant guide in `node_modules/next/dist/docs/` — APIs/conventions differ from older Next and training data.

## Layout

- `src/app/` – routes. REST API under `src/app/api/v1/**/route.ts`; dashboards under `src/app/dashboard/<role>/`. Client components start with `"use client"`.
- `src/models/` – Mongoose schemas (`Property`, `Unit`, `User`, `Tenant`, `Lease`, `Invoice`, `MoveRequest`, …).
- `src/lib/` – `permissions.ts` (RBAC + guards), `jwt.ts`, `mongoose.ts` (`connectToDatabase`), `crypto.ts` (national-ID encryption), `schemas/*` (zod), `pagination.ts`, `rate-limit.ts`, `utils.ts` (`cn`).
- `src/components/ui/` – shadcn primitives; feature components in `src/components/<feature>/`.
- `src/hooks/` – data fetching/mutations. `src/test/` – setup + factories/mocks (`src/test/utils/`).
- `src/proxy.ts` – middleware protecting `/dashboard/*` and gating `/api/*`.
- `docs/plans/*.md` – design intent for features; read the matching plan before large changes.

## API route pattern

```ts
import { authenticate, requirePermission } from "@/lib/permissions";
import { connectToDatabase } from "@/lib/mongoose";

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "property:create");
  if (authError) return authError;
  await connectToDatabase();
  // parse body with a local zod schema (z.coerce for numbers)
  // return NextResponse.json(created, { status: 201 });
}
```

- Auth: cookie `keja-token` via `authenticate(request)`; authorization actions like `property:create`, `unit:manage` (see `src/lib/permissions.ts`). Always return the guard's `NextResponse` on failure.
- Responses: success `{ data, pagination? }` (use `buildPaginationResult`/`parsePagination`); errors `{ error, issues? }` with correct status.
- Input: validate with zod (`.trim()`, `z.coerce.number()`, `.optional()`); never trust the client.
- Public listings must `.select("-ownerId -caretakerIds -createdById -__v")`.
- Paystack webhook: HMAC-SHA512 over the raw body, no cookie auth. Apply `rateLimit()` to abuse-prone endpoints.

## Data layer

- Always `await connectToDatabase()` before queries.
- Soft delete by default via the soft-delete plugin (`deletedAt`); filter `deletedAt: null` unless working in the recycle bin.
- `Unit` has a partial unique index on `{ blockId, name }` where `deletedAt: null`; unit names come from `src/lib/unit-naming.ts`.
- PII is encrypted at rest (`nationalId` via `src/lib/crypto.ts`); normalize phone/whatsapp to E.164. Never log PII or secrets.

## UI conventions

- Class names through `cn(...)` from `@/lib/utils`; styling via Tailwind tokens + shadcn variants (avoid ad-hoc hex colors).
- Forms: `useForm({ resolver: zodResolver(schema) })` with a zod schema in `src/lib/schemas/`, shadcn `Input`/`Label`/`Select`, `sonner` for toasts.

## Tests

- Colocated `*.test.ts(x)` next to the source; `vitest.config.ts` (jsdom, globals, setup `src/test/setup.ts`).
- Mock the DB/models with helpers in `src/test/utils/` (e.g. `model-mocks.ts`); render with auth via `render-with-auth`. Route tests may opt into the node environment.
- Cover happy path, edge cases and failures.

## Env (names only, never commit values)

`MONGODB_URI`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `EMAIL_*`, `PAYSTACK_*`, `UPLOADTHING_TOKEN`, `NOTIFICATION_RETENTION_DAYS`. See `.env.example` / `docker-compose.yml`.

## Unsolicited extras

Do not add comments, unrelated refactors, or new dependencies without being asked. Keep diffs scoped to the task.

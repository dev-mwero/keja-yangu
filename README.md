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
- **Rate Limiting:** @upstash/ratelimit with Redis
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
- Rate-limited API endpoints
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
- `POST /api/auth` — Auth actions (`signin`, `signup`, `verify-email`, `resend-verification`)
- `GET /api/auth/me` — Get current user
- `GET /api/auth/logout` — Sign out

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

# Rate Limiting (Upstash)
UPSTASH_REST_URL=your-upstash-redis-url
UPSTASH_REST_TOKEN=your-upstash-token
```

## User Roles

| Role | Dashboard | Access |
|------|-----------|--------|
| Owner | `/dashboard/owner` | Portfolio, accounting, reports |
| Caretaker | `/dashboard/caretaker` | Property management, tenant requests |
| Tenant | `/dashboard/tenant` | Applications, payments, complaints |

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

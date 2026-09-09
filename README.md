# Keja Yangu

A modern property rental and tenant management platform built with Next.js, TypeScript, and MongoDB.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** Radix UI + shadcn/ui
- **Database:** MongoDB with Mongoose
- **Form Handling:** React Hook Form + Zod validation
- **Theme:** next-themes (dark/light mode)

## Features

### Dashboards
- **Owner** — Portfolio overview, property distribution, revenue tracking, tenant/caretaker management
- **Caretaker** — Assigned properties, tenant requests, status updates
- **Tenant** — Application tracking, property recommendations, payment history

### Core
- Role-based authentication (owner, caretaker, tenant)
- Protected dashboard routes with AuthGuard
- Property listings with search and filters
- Responsive design with mobile navigation
- Dark/light theme support

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your MongoDB URI

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

## Project Structure

```
src/
├── app/
│   ├── api/v1/properties/    # REST API routes
│   ├── auth/                 # Sign in / sign up
│   ├── dashboard/
│   │   ├── owner/            # Owner dashboard + sub-pages
│   │   ├── caretaker/        # Caretaker dashboard + sub-pages
│   │   └── tenant/           # Tenant dashboard + sub-pages
│   └── properties/           # Public property listings
├── components/               # Reusable UI components
├── config/                   # Navigation config
├── data/                     # Mock data (tenants, caretakers)
├── hooks/                    # Custom React hooks
├── lib/                      # Utilities, DB connection
└── models/                   # Mongoose schemas
```

## Environment Variables

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
```

## User Roles

| Role | Dashboard | Access |
|------|-----------|--------|
| Owner | `/dashboard/owner` | Portfolio, accounting, reports |
| Caretaker | `/dashboard/caretaker` | Property management, tenant requests |
| Tenant | `/dashboard/tenant` | Applications, payments, complaints |

Role is determined by email prefix on sign-in:
- `owner*` → Owner
- `care*` → Caretaker
- Everything else → Tenant

## License

Private — Keja Yangu

# TribalConnect

TribalConnect is a mobile-first tribal welfare portal for family onboarding, scheme eligibility, applications, field work, reporting, notifications, and family self-service.

## Project structure

```text
apps/web  React + TypeScript + Material UI client
apps/api  Express + Prisma + PostgreSQL API
docs      Architecture, API, and operating guidance
```

## Run locally

Use Node.js 20.12 or later and Docker (or another reachable PostgreSQL 16+ instance).

1. Copy `apps/api/.env.example` to `apps/api/.env` and set non-default local secrets.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install workspace packages: `npm install`.
4. Apply the reviewed schema migration: `npm run db:deploy --workspace @tribalconnect/api`.
5. Load development data: `npm run seed`.
6. In separate terminals, start `npm run dev:api` and `npm run dev:web`.

The web client is available at `http://localhost:5173`; its Vite development proxy forwards `/api` to `http://localhost:4000`. The API health check is `http://localhost:4000/health` and the OpenAPI document is `http://localhost:4000/api/openapi.json`.

For iterative local schema work, use `npm run db:migrate --workspace @tribalconnect/api`; use `db:deploy` for a clean or release database.

## Quality checks

```text
npm run lint
npm run typecheck
npm run build
npm run check
```

## Development login

The seed creates one account for each role on mobile `9876543210`. With the development OTP adapter enabled, use code `123456` after selecting the intended role.

## Deployment notes

Raw Aadhaar values are not returned by the API: the system stores a salted lookup hash and masked display value. Production deployments must configure a real OTP delivery provider, an HTTPS notification adapter, managed document storage with malware scanning, secrets management, encrypted backups, HTTPS, and a shared rate-limit store. See [operations guidance](docs/OPERATIONS.md) and the [API reference](docs/API.md).

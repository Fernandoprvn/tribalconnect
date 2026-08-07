# TribalConnect API

Express + TypeScript + Prisma API for the TribalConnect welfare portal.

## Run locally

From the repository root:

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Run `npm install`.
4. Run `npm run db:deploy --workspace @tribalconnect/api`, then `npm run seed`.
5. Run `npm run dev:api`.

The API listens on port `4000` by default. `GET /health` verifies database connectivity; `GET /api/openapi.json` exposes the machine-readable API overview. The complete route reference is in [docs/API.md](../../docs/API.md).

## API areas

- Password/JWT authentication with rotating refresh tokens
- Scoped family onboarding, documents, workflow, visits, and eligibility
- Scheme, application, village/map, dashboard, report, and global-search APIs
- Notifications, announcements, field volunteer sync, family portal, and administration APIs

## Quality checks

```text
npm run lint --workspace @tribalconnect/api
npm run typecheck --workspace @tribalconnect/api
npm run build --workspace @tribalconnect/api
```

## Security and operations

The service returns masked Aadhaar values and stores only salted lookup hashes. Passwords are bcrypt-hashed and refresh tokens are held in HttpOnly cookies. Production deployments need restrictive CORS origins, managed object storage with malware scanning, production secrets, and a shared rate-limit store. Backup records in the application track controlled configuration snapshots; database recovery remains the responsibility of managed PostgreSQL backups or scheduled `pg_dump` operations.

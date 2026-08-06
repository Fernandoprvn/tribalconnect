# Local operations

## Services

| Service | Default address | Purpose |
| --- | --- | --- |
| Web client | `http://localhost:5173` | Vite development server |
| API | `http://localhost:4000/api` | JSON API base path |
| API health | `http://localhost:4000/health` | Database-backed readiness check |
| API documentation | `http://localhost:4000/api/openapi.json` | OpenAPI overview |
| PostgreSQL | `localhost:5432` | Application data |

Start the database with `docker compose up -d postgres`. The local connection string is in `apps/api/.env.example`.

## Database lifecycle

Apply committed migrations before seeding or starting a new database:

```text
npm run db:deploy --workspace @tribalconnect/api
npm run seed
```

For iterative development, create a reviewed migration with `npm run db:migrate --workspace @tribalconnect/api`. Do not use `db push` as a production-release procedure.

## CI checks

The CI workflow installs workspace dependencies, runs lint, TypeScript, and production builds, applies the committed Prisma migration to a temporary PostgreSQL service, then starts the compiled API and checks `/health`.

## Offline behaviour

The production web shell caches static assets. Family onboarding keeps a privacy-sanitised draft in local storage; original files must be selected again after a browser reload. The field volunteer workspace uses an IndexedDB queue (with a browser-storage fallback) for unsent visit records, GPS capture, and idempotent sync after connectivity returns.

## Reporting and notifications

Reports are generated server-side as PDF, XLSX, or CSV. In-app notifications are written immediately; SMS, WhatsApp, and email delivery are sent through the configured HTTPS notification adapter. Queue status and delivery history remain visible when an external provider is not configured.

## Recovery

Use managed PostgreSQL point-in-time recovery or scheduled encrypted `pg_dump` backups for production data. Enable versioning for managed document storage. Test restores only against an isolated staging database, verify checksums and access controls, then record the recovery decision in the audit log.

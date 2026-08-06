# TribalConnect architecture

```text
React web client (apps/web)
  - Material UI responsive/dark-mode views, React Query, Redux session state
  - OTP sign-in, protected routes, onboarding drafts, document previews
  - Leaflet village map and IndexedDB-backed volunteer sync queue
                    | HTTPS / Bearer access token
                    v
Express API (apps/api)
  - JWT access tokens, hashed rotating refresh tokens, OTP challenges
  - Scoped route modules, validation, rate limiting, audit logging
  - PDF/XLSX/CSV generation and notification delivery adapter boundary
                    |
                    v
PostgreSQL via Prisma
  - Geography, families, documents, schemes, applications, visits,
    notifications, preferences, permissions, audit, and recovery metadata
```

## Roles and data scope

| Role | Access model |
| --- | --- |
| `SUPER_ADMIN` | Cross-district administration, schemes, reports, users, settings, and audit history. |
| `DEVELOPMENT_OFFICER` | Assigned-district families, workflows, villages, applications, reports, and notifications. |
| `FIELD_VOLUNTEER` | Assigned-district family work and own field-visit workspace/sync records. |
| `FAMILY` | Only the linked family portal profile, applications, eligibility, notifications, and announcements. |

Authentication always reloads the active user from PostgreSQL, and route handlers apply district/family access checks before returning records.

## Eligibility rules

Schemes store validated JSON criteria. The evaluator reports passed and failed conditions for community, income, occupation, student, farmer, widow, senior-citizen, disability, age, landholding, house type, gender, and bank-account requirements.

## Operational boundaries

- Aadhaar lookup uses a salted hash and masked presentation value; add KMS-backed field encryption when required by deployment policy.
- The local OTP adapter and notification webhook adapter are integration boundaries. Configure approved providers before production.
- Local file uploads are intentionally limited to development. Use signed managed storage, malware scanning, retention, and access review in production.
- The in-process rate limiter is suitable for one API process. Use Redis or an API gateway for horizontally scaled deployment.
- Database backup/restore must be performed through managed PostgreSQL recovery or a controlled `pg_dump`/restore process; the application records controlled configuration-snapshot events.

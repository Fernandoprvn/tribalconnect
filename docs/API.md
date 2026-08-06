# TribalConnect API reference

Base URL: `http://localhost:4000/api` in local development. Protected routes require `Authorization: Bearer <access-token>`. Successful resource responses use `{ "data": ... }`; collections also include `meta` with pagination. Validation failures use a structured `error` object.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/request-otp` | Request an OTP for an active mobile/role account. Development responses may include `developmentCode`. |
| `POST` | `/auth/verify-otp` | Verify OTP and receive an access token, rotating refresh token, and masked user profile. |
| `POST` | `/auth/refresh` | Rotate a valid refresh token and issue a new access token. |
| `POST` | `/auth/logout` | Revoke the supplied refresh token. |
| `POST` | `/auth/logout-all` | Revoke every refresh session for the authenticated user. |
| `GET` | `/auth/me` | Return the current authenticated user. |

## Geography and families

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/geography/districts` | List districts visible to the caller. |
| `GET` | `/geography/blocks` | List scoped blocks; accepts `districtId`. |
| `GET` | `/geography/panchayats` | List scoped panchayats; accepts `districtId` and `blockId`. |
| `GET` | `/geography/villages` | List scoped villages for lightweight selectors. |
| `GET` | `/families` | Search/filter scoped families with `page`, `limit`, `search`, `districtId`, `villageId`, and `status`. |
| `POST` | `/families` | Create a staff-entered family draft. |
| `GET` | `/families/:id` | Get a scoped family profile. |
| `PATCH` | `/families/:id` | Update a staff-entered family profile. |
| `POST` | `/families/:id/submit` | Validate and submit a family draft. |
| `POST` | `/families/:id/status` | Move a family through a permitted workflow transition. |
| `POST` | `/families/:id/documents` | Upload one PDF/JPEG/PNG/WebP document as multipart form data. |
| `GET` | `/families/:id/documents/:documentId/file` | Stream an authorised uploaded document. |
| `PATCH` | `/families/:id/documents/:documentId` | Verify or reject a document. |
| `POST` | `/families/:id/field-visits` | Schedule or record a family field visit. |
| `GET` | `/families/:id/eligibility` | Evaluate every active scheme for a scoped family. |
| `GET` | `/families/:id/timeline` | Return family workflow, application, and visit history. |
| `GET` | `/families/:id/qr` | Return the scoped family QR payload. |

## Schemes and applications

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/schemes` | List schemes with pagination, search, department, and status filters. |
| `POST` | `/schemes` | Create a scheme and validated eligibility criteria (super admin). |
| `GET` | `/schemes/:id` | Get one visible scheme. |
| `PATCH` | `/schemes/:id` | Update a scheme (super admin). |
| `DELETE` | `/schemes/:id` | Delete an unused scheme or archive one with history (super admin). |
| `POST` | `/schemes/:id/activate` | Activate a scheme. |
| `POST` | `/schemes/:id/deactivate` | Deactivate/archive a scheme. |
| `GET` | `/schemes/:id/eligibility/:familyId` | Evaluate one scheme for one scoped family. |
| `GET` | `/applications` | List scoped applications with family, scheme, district, village, officer, status, and search filters. |
| `POST` | `/applications` | Create an eligible recommendation or family-submitted application. |
| `GET` | `/applications/:id` | Get one scoped application. |
| `POST` | `/applications/:id/status` | Move an application through a permitted review transition. |
| `GET` | `/applications/:id/history` | Return status and workflow history. |
| `GET` | `/applications/:id/approval-letter` | Download an approval PDF once approved. |

## Villages, GIS, dashboard, and reports

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/villages` | Paginated village directory with population and workflow statistics. |
| `POST` | `/villages` | Create a village (super admin/development officer). |
| `GET` | `/villages/map` | Return scoped mapped villages and GIS statistics. |
| `GET` | `/villages/:id` | Get one scoped village and statistics. |
| `PATCH` | `/villages/:id` | Update a village. |
| `POST` | `/villages/:id/assign-officer` | Assign or clear a development officer. |
| `DELETE` | `/villages/:id` | Delete an unused village (super admin). |
| `GET` | `/dashboard` | Get live KPIs, trends, outcomes, coverage, and attention items. Accepts district, village, officer, scheme, and date filters. |
| `GET` | `/dashboard/filters` | Get filter options within the caller’s scope. |
| `GET` | `/reports` | Get a beneficiary, officer, or monthly report as JSON. |
| `GET` | `/reports/summary` | Get report aggregate totals. |
| `GET` | `/reports/export` | Download report output using `format=csv`, `xlsx`, or `pdf`. |

## Notifications, search, field work, and family portal

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/notifications` | List notification history; accepts pagination, delivery status, and `unread=true`. |
| `POST` | `/notifications` | Send in-app and configured external notifications (super admin/development officer). |
| `GET` | `/notifications/history` | Alias for notification history. |
| `GET`/`PATCH` | `/notifications/preferences` | Read or update delivery preferences. |
| `PATCH` | `/notifications/:id/read` | Mark an authorised notification as read. |
| `POST` | `/notifications/read-all` | Mark in-app notifications read for the current user. |
| `POST` | `/notifications/:id/retry` | Retry an external delivery (super admin). |
| `GET` | `/announcements` | List scoped published announcements. |
| `POST`/`PATCH`/`DELETE` | `/announcements[/:id]` | Manage announcements (super admin). |
| `POST` | `/announcements/:id/publish` | Publish an announcement. |
| `POST` | `/announcements/:id/unpublish` | Unpublish an announcement. |
| `GET` | `/search` | Global scoped search across families, schemes, villages, applications, mobile numbers, and Aadhaar hashes. |
| `GET`/`POST` | `/volunteer/visits` | List or create scoped volunteer field visits. |
| `GET`/`PATCH` | `/volunteer/visits/:id` | Get or update a scoped visit. |
| `POST` | `/volunteer/sync` | Idempotently sync queued offline volunteer visits. |
| `GET` | `/portal/overview` | Get a linked family account’s profile, applications, eligible schemes, and announcements. |
| `GET` | `/portal/profile` | Get the linked family profile. |

## Settings, audit, and administration

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`/`PUT`/`PATCH` | `/settings` | Read or update the current user’s portal preferences and notification settings. |
| `GET` | `/audit-logs` | Read own audit history; super admins can filter wider activity. |
| `GET` | `/audit-logs/activity-logs` | Activity-history alias. |
| `GET`/`POST` | `/admin/users` | List or create user accounts (super admin). |
| `PATCH` | `/admin/users/:id` | Update a user account. |
| `POST` | `/admin/users/:id/status` | Change user status and revoke sessions when appropriate. |
| `GET` | `/admin/permissions` | List managed permissions. |
| `PATCH` | `/admin/permissions/:id` | Update assigned roles for a permission. |
| `GET` | `/admin/audit-logs` | Read global audit history. |
| `GET` | `/admin/activity-logs` | Global activity-history alias. |
| `GET`/`PUT`/`PATCH` | `/admin/settings` | Read or update system configuration. |
| `GET`/`POST` | `/admin/backups` | List or record a controlled configuration snapshot. |
| `POST` | `/admin/backups/:id/restore` | Restore a recorded system-settings snapshot under controlled operations. |

## Health and documentation

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Unversioned API/database health check. |
| `GET` | `/api/health` | Versioned health check. |
| `GET` | `/api/openapi.json` | Machine-readable OpenAPI overview. |

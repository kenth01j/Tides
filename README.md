# TIDES — Kimud Shoal Tourism Management

TIDES (Tourism Information, Divers Entry & Scheduling) is a mobile-first LGU tourism platform for Kimud Shoal, Tabango, Leyte. It provides visitor accounts and diver reservations, staff-verified payment receipts and QR permits, field enforcement, and reporting.

## Requirements

- Node.js 18 or newer
- MongoDB (local or hosted)
- npm

## Install and run

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to your MongoDB connection string and set `JWT_SECRET` to a unique random value of at least 32 characters. To seed the initial administrator, also set `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and a unique `SEED_ADMIN_PASSWORD` of at least 16 characters.
3. Install dependencies and initialize the database:

   ```sh
   npm ci
   npm run seed
   ```

4. Start the server:

   ```sh
   npm start
   ```

5. Visit `http://localhost:3000`.

The seed command creates the initial administrator with the credentials configured in the seed-only environment variables, PHP 300 per diver and 30 divers/day as defaults. The initial administrator must change the temporary password before using the staff portal; admin-created accounts must also change their temporary password at first sign-in. Seeding does not overwrite the password of an existing administrator. Demo bookings are omitted by default; set `SEED_DEMO_DATA=true` only in a local/demo database to add sample reservations.

## Environment variables

All configuration is listed in `.env.example`. Copy it to `.env` locally, or configure the same variables in your hosting provider's secret/environment settings. Never commit `.env` or paste secret values into source control.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production`; defaults to `development`. Production enables secure authentication cookies. |
| `PORT` | No | HTTP listener port; defaults to `3000`. |
| `MONGODB_URI` | Yes | MongoDB connection string. Use an Atlas `mongodb+srv://` URI in hosted deployments and restrict Atlas network/database-user access. |
| `JWT_SECRET` | Yes | Unique signing key, at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Use a different secret per environment. |
| `TRUST_PROXY` | No | Express trusted proxy setting (`false`, `true` for one hop, a hop count, or a trusted subnet such as `loopback`). Set only to match the real hosting proxy topology. |
| `PUBLIC_BASE_URL` | Production | Public HTTPS origin (for example `https://tides.example.gov.ph`) used to create QR receipt links. Required in production. |
| `PAYMENT_PROOF_DIR` | No | Private receipt-image storage path. Defaults to `server/private/payment-proofs`; production must mount durable, access-controlled storage at this path. Relative paths resolve from the project directory. |
| `SEED_ADMIN_NAME` | For first seed | Name for the initial administrator account. |
| `SEED_ADMIN_EMAIL` | For first seed | Email used for the initial administrator. |
Tides admin account
username=kenth
email=thefalls.kenthjohn@gmail.com
password=qwertyuiopas
| `SEED_ADMIN_PASSWORD` | For first seed | Unique initial password, at least 16 characters. Keep secret and rotate after first sign-in. Existing accounts are not reset by rerunning the seed. |
| `SEED_DEMO_DATA` | No | Set `true` only for local/demo data; defaults to no sample bookings. |

### Production deployment checklist

1. Use a managed Node.js host with HTTPS and a supported Node version (`>=18`), and install from the lockfile with `npm ci`.
2. Create a MongoDB Atlas database user with only the permissions the app needs, allow only the hosting service's required network access, and set the Atlas URI as `MONGODB_URI`.
3. Set `NODE_ENV=production`, `PORT` if required by the host, a generated `JWT_SECRET`, the public HTTPS `PUBLIC_BASE_URL`, and a correctly scoped `TRUST_PROXY`.
4. Configure `PAYMENT_PROOF_DIR` to a private persistent volume. Do not rely on an ephemeral container filesystem for uploaded payment receipts, and do not expose this directory as static content.
5. Only for a fresh database without an administrator, set the three `SEED_ADMIN_*` variables in the host's protected environment configuration and run `npm run seed` once with `SEED_DEMO_DATA=false`. Do not rerun seeding against an initialized production database. Remove the bootstrap password from the host environment after the administrator changes it.
6. Configure MongoDB backups, deployment monitoring against `GET /healthz`, log retention, HTTPS, and the LGU's applicable privacy/retention notices before inviting the public.

The app's built-in rate limiter uses in-memory counters. For multiple replicas, use a shared rate-limit store or keep a single app instance. Payment proof upload is manual verification only; the application does not currently integrate with a GCash/Maya payment gateway. Production readiness also depends on the chosen host's persistent storage, TLS, database controls, backup, monitoring, and LGU operational policies.

## Portals

- **Public visitor portal:** `/` and `/book.html`; visitors create an account or sign in at `/login.html` before reserving. Booking dates are limited to the next 90 days and reservations are atomically checked against date capacity. Bookings collect the lead diver's scuba license number and let the lead choose group coverage or individual licenses. Additional divers always provide their full names; individual license numbers are required only when individual mode is selected. Visitors can see their reservations at `/my-bookings.html`.
- **Visitor experience:** the homepage features a responsive Kimud Shoal hero with selectable animated image cards and booking links, followed by a continuously scrolling two-row photo gallery moving in opposite directions. Motion respects reduced-motion preferences.
- **Marine-protection rules:** the public homepage summarizes the penalties and prohibited activities in Municipal Ordinance No. 2025-07. Booking slots stay within the stated 6:00 AM–2:00 PM operating window; freediving and snorkeling are not offered as booking types.
- **Kimud Shoal maps and directions:** the overview and directions popup use Leaflet with OpenStreetMap tiles, zoom controls, and expand-to-screen controls. The directions map displays the OSRM road route to Tabango and an approximate boat leg to the offshore shoal. Current location is requested on demand with high accuracy and refined for up to 12 seconds; the reported accuracy is shown with a map radius. Real-world precision depends on the device, browser permission, and GPS conditions. The maps require an internet connection and no map API key.
- **Payment and permit:** checkout accepts GCash or Maya payment receipt images (JPEG, PNG, or WebP, up to 5 MB). The visitor sees the selected filename and image preview, then an upload confirmation, complete booking receipt, QR, and download action after submission. This app does not connect to either payment network, and no receiving account is configured; visitors must obtain current official payment instructions from the Tabango Tourism Office before transferring. Uploaded proof remains pending until authorized staff approve or reject it. A signed QR opens the complete public receipt; it is a valid visit permit only after payment approval. Receipts download as HTML with the QR embedded or can be printed/saved as PDF.
- **LGU dashboard:** staff sign in at the permanent `/admin-login.html` URL (or `/admin-login`) and continue to `/admin.html`; visitor navigation does not expose the staff login. Admin and staff can create same-day walk-in bookings paid on-site, review visitor bookings and payment proof, approve/reject receipts, manage capacity, and triage incidents. Admins can classify visits as ongoing, done, or cancelled, and download CSV reports containing only Done bookings for a selected date, month, calendar year, or trailing one-, two-, or three-year period. Marking a visit done requires a paid booking with check-in and check-out recorded. **Cancel booking** invalidates the permit and releases future capacity when the visitor has not checked in; the booking remains in the audit/history tables and no automatic refund is issued. Admins can create staff accounts, change system fee/capacity defaults, and review the staff action audit trail.
- **Enforcement:** `/enforcement.html`; signed QR payloads are valid only on the booking's visit date. Authorized users can log entry/exit and incident reports.
- **Analytics:** `/reports.html`; daily, seven-day, and 30-day KPIs, charts, and CSV exports are available to admin/staff.

The initial administrator account is created from the `SEED_ADMIN_*` environment variables; never store its credentials in the repository. The administrator must change the temporary password at first sign-in. There is no public staff registration; admins create individual staff accounts from the dashboard after verifying personnel through LGU processes, and new accounts must change their temporary password. Visitor and staff accounts use separate collections and audience-scoped, expiring JWTs in `HttpOnly`, `SameSite=Strict` cookies (secure cookies are enabled when `NODE_ENV=production`). Password hashes use bcrypt; staff routes enforce role checks. Configure HTTPS, `PUBLIC_BASE_URL`, and `TRUST_PROXY` for the actual trusted reverse proxy, plus production secrets, database access controls/backups, and applicable Data Privacy Act notices/retention policies before production use.

The admin audit trail records account/password changes, booking classifications and cancellations, capacity/system-setting changes, violation reports/resolutions, and visitor check-in/check-out events. It retains actor name/role, event details, and timestamp; admins can view the latest 300 events in the dashboard. The sign-in limiter uses in-memory storage; use a shared rate-limit store if deploying multiple server instances.

## API overview

- `GET /healthz` (deployment health check; returns 200 only while MongoDB is connected)
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (staff)
- `POST /api/visitors/register`, `/login`, `/logout`; `GET /api/visitors/me`, `/bookings`, `/bookings/:bookingId`
- `GET /api/bookings/availability?date=YYYY-MM-DD`, `POST /api/bookings` (visitor session required)
- `POST /api/payments/:bookingId` (visitor multipart receipt upload)
- `GET /api/payments/:bookingId/proof` (visitor-owned uploaded receipt image)
- `GET /api/receipts/:bookingId?token=...` (signed full booking and payment receipt)
- `GET /api/admin/stats`, `/bookings`, `/capacity`, `/settings`, `/users`, `/violations`
- `GET /api/admin/done-bookings` (all bookings classified as done)
- `GET /api/admin/cancelled-bookings` (all bookings classified or recorded as cancelled)
- `GET /api/admin/audit-logs` (admin only; latest 300 audited staff actions)
- `POST /api/admin/walk-ins` (staff-created, same-day booking recorded as paid on-site)
- `GET /api/admin/done-bookings/export.csv?period=daily|monthly|yearly|1-year|2-year|3-year` (admin only; daily requires `date=YYYY-MM-DD`, monthly requires `month=YYYY-MM`, and yearly requires `year=YYYY`)
- `PATCH /api/admin/bookings/:bookingId/visit-status` (admin only; ongoing, done, cancelled)
- `GET /api/admin/bookings/:bookingId/payment-proof`, `PATCH /api/admin/bookings/:bookingId/payment-review`
- `PUT /api/admin/capacity/:date`, `PUT /api/admin/settings`, `POST /api/admin/users`
- `POST /api/enforcement/verify`, `/checkin`, `/checkout`, `/violations`
- `GET /api/reports?period=daily|weekly|monthly`, `GET /api/reports/export.csv?period=...`

Visitor registration, sign-in, booking, proof upload, and staff sign-in endpoints are rate limited. Payment proof images are stored outside the public web root and are served only to authorized staff. All API errors are returned as JSON with a user-facing message. The website does not collect payment credentials or directly process transfers.

Run the built-in unit tests for CSV safety, report date boundaries, diver-name validation, and booking status transition rules with `npm test`.

## KPI definitions

- **Platform adoption:** paid online diver count divided by that count plus recorded no-permit incidents, an operational estimate rather than a population-wide survey.
- **Compliance:** checked-in active paid bookings divided by active paid bookings in the reporting period.
- **Cashless transaction rate:** paid booking value recorded through GCash or Maya divided by paid booking value; on-site cash is excluded.
- **Processing time:** average time from reservation creation to staff approval of payment proof.
- **Revenue accuracy:** comparison of paid booking totals with successful payment ledger totals for the same bookings.

Visitor totals in analytics exclude cancelled visits. Revenue/payment totals continue to include paid bookings even when later cancelled and do not account for refunds; they represent recorded booking/payment values rather than net cash collected. Daily capacity usage counts reservations, including bookings awaiting payment or payment review, until the reservation is cancelled. System defaults apply to dates without an individual capacity record; per-date overrides remain intact when defaults change.

# Niyamstack Propel

Coaching & Placement Operating System for institute owners and placement heads: **Institute OS**, **LMS**, and **Placement OS** on one Niyamstack stack.

This repository is the production codebase for product #1 — not a rewrite and not a student-training site. Hosting target is **Niyamstack Cloud (India)** or a customer VPS over SSH.

## Stack

- Frontend: Vite + React + TypeScript + Tailwind
- Backend: Java 21 + Spring Boot 3.4 + JWT + validation
- Database: PostgreSQL 16 + Flyway (`ddl-auto: validate`)
- Local stores: Docker Compose for Postgres and Redis (MinIO optional via `storage` profile)
- H2 is a **local fallback only** (`dev` profile)

## Production-like local run (default)

1. Start data stores:

```bash
docker compose up -d postgres redis
```

2. Backend (Java 21). Default datasource is PostgreSQL. Seed is **off** (empty tenant after migrations):

```bash
cd backend
mvn spring-boot:run
```

3. Load the Aarohan demo tenant on Postgres (local only):

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=seed
```

4. Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### H2 fallback (no Docker)

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

`dev` enables H2, Hibernate `update`, and demo seed. Do not use this profile in production.

### Production profile

```bash
export PROPEL_JWT_SECRET='a-32-byte-or-longer-secret'
export PROPEL_CORS='https://propel.yourdomain'
export SPRING_PROFILES_ACTIVE=prod
mvn spring-boot:run
```

The `prod` profile refuses to start if `PROPEL_JWT_SECRET` is missing or still the repo default. Seed stays off.

## Demo logins (seed / dev only)

Password: `Propel@123`

| Email | Role |
|---|---|
| deepak@yopmail.com | Institute owner |
| placement@aarohan.demo | Placement head |
| faculty@aarohan.demo | Faculty |
| counselor@aarohan.demo | Counselor |
| accounts@aarohan.demo | Accountant |
| student@aarohan.demo | Student |
| parent@aarohan.demo | Parent |
| recruiter@aarohan.demo | Recruiter |

Demo hints on the login screen appear only in the Vite **dev** server, not in a production frontend build.

## Commercial packages

Basic / Pro / Plus map to **Starter / Growth / Enterprise** on `organizations.package_tier`. APIs enforce tier for Growth+ and Plus/Enterprise features (live class scheduling, refunds, SCORM package module, AI stubs, salary benchmarks, biometric attendance).

## Integrations

Interfaces exist for Razorpay/Cashfree, WhatsApp Business, Zoom/Meet, local/MinIO storage, and mail. Until credentials are set, `/api/actions/integrations` reports **demo** and the product does not claim a live send/capture.

| Variable | Purpose |
|---|---|
| `PROPEL_PAYMENTS_PROVIDER` | `demo` / `razorpay` / `cashfree` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live payments only when both set |
| `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` | Same for Cashfree |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | Meetings |
| `PROPEL_STORAGE_DIR` | Local file root |
| `docker compose --profile storage up -d minio` | Optional MinIO |

## API

Authenticated JSON under `/api/...`. Public admission form: `POST /api/public/orgs/{orgId}/admission-forms`.

Production-depth actions:

- LMS: `POST /api/actions/content/upload`, assignment submit/grade, exam start/submit, LMS package register/launch
- Fees: collect (ledger + receipt), installment schedule, refund request/approve
- Placement: eligibility check, apply, ATS advance, round templates/outcomes, offers

## What is in the catalog

All **95 features** remain the commercial source of truth (`Features.java` / Features page). Foundation/Starter is implemented deepest; Growth and Scale/Enterprise are gated and incrementally deepened (LMS engine, fee ledger, ATS first).

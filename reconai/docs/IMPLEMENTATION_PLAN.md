# ReconAI — Repository Audit & Implementation Plan

> Audit performed: 2026-09-13. Author: primary coding agent.

## 1. Audit findings

### Source-of-truth materials read (100%)
- `ReconAI_prd.md` — full PRD (scope, users, requirements, AI guardrails)
- `ReconAI_trd.md` — full TRD (architecture, DB schema, API, matching engine, queue, security)
- `ReconAI_app_flow.md` — the authoritative **Application Flow** (must not be changed)
- `ReconAI_implementation.md` — phased plan (14 phases), release sequence, standards
- All 8 design exports (`*/code.html` + `screen.png`) — the **UI source of truth**
- `reconai/DESIGN.md` — Material-3 theme tokens

### Codebase state
**Greenfield.** `reconai/` contains only `DESIGN.md`. No code exists. The two `stitch_*.zip`
files are duplicate single-page exports of the screen designs. Nothing to preserve or migrate.

### Runtime infra (already running locally — verified healthy)
| Service | Container | Endpoint | Credentials |
|---|---|---|---|
| PostgreSQL 15+ — **Supabase** (authoritative DB) | remote Supabase project (`db.<project>.supabase.co`:5432) | via `DATABASE_URL` in gitignored `apps/api/.env`, `sslmode=require` | credentials exist only in `.env`, never committed/shared |
| Redis 7 | `recon-platform-redis-1` | localhost:6379 | — |
| MinIO | `recon-platform-minio-1` | localhost:9000/9001 | `minioadmin` / `minioadmin` |

### Tooling
Node v24.15.0, npm 11.12.1, Python 3.9.13, Docker 29 (running), git 2.47.

## 2. Design system (consolidated from the 8 exports)

Two shells are in the exports — a **desktop sidebar shell**
(`engagement_command_center`, `statutory_working_papers`) and a **narrow bottom-dock shell**
(dashboard, clients, GST, report detail). Both share one dark "asset-defense" palette; I will
implement the desktop sidebar shell at `lg+` and collapse to the bottom-dock on mobile to
satisfy both designs and the responsive requirement.

**Tokens**
- Background `#07090e` + fixed aurora radial gradients (mint/teal/blue/cyan glows).
- Card `rgba(13,18,26,0.72)` backdrop-blur, border `rgba(255,255,255,0.08)`, `rounded-2xl`.
- Sidebar/raised surface `#0b1019`; headers translucent `#07090e/80` blurred.
- Text: `#f8fafc` / `#94a3b8` / `#64748b` / ghost `#334155`.
- Accents: cyan `#00f0ff`, blue `#0077ff`, teal `#4ecdc4`, mint `#94bda4`.
- Status: success `#34d399`, warning `#fbbf24`, error `#f87171`; rose for systemic risk.
- Fonts: Geist/Inter (sans) + JetBrains Mono (mono labels, numerals); Material Symbols icons.
- Type roles: `label-caps` 10px mono uppercase letter-spaced; `data-metric` 22–28px mono;
  headings 16/20/32px sans; body 13px.
- Badges/pills: 9–11px mono uppercase, colored tint bg + border; active filter pill = white bg.
- Components: glass stat tiles, ring charts (circular SVG progress), horizontal segmented
  controls, comparison "diff boxes", pipeline progress overlay, glowing status pips, toast.
- Headings render with a white→mint `hero-title-gradient`.

Nav model: Dashboard · Clients · Engagements · Documents · Reconciliations · Exceptions ·
Working Papers · Reports · Team · Settings. Bottom dock (mobile): Overview · Reconcile ·
Clients · Reports.

## 3. Architecture (per TRD)

```
apps/web       Next.js 15 + React 19 + TS + Tailwind 3.4 + TanStack Query + RHF + Zod
apps/api       Express 4 + TS + Prisma 6 (PostgreSQL via Supabase) + JWT httpOnly cookies + RBAC
apps/api/worker BullMQ 5 (ioredis/Redis) — job queue, retries, calls Python engine
services/engine FastAPI + pandas + openpyxl + PyMuPDF + pydantic — parsing/recon/risk/AI
storage        MinIO via a storage abstraction (swap to S3 later; presigned URLs, private)
packages/shared TS types + zod schemas shared web↔api
```

Service boundaries honored: authoritative financial logic only in the Python engine;
domain/auth/workflow only in the Node API; UI has no authoritative logic; worker owns async
jobs. AI is an abstraction (Gemini primary, Qwen/Groq fallback, env-configured) and never
computes authoritative values.

## 4. Implementation checklist (built from the docs' 14 phases)

- [ ] **P0 Foundation** — monorepo + workspaces, lint/type/format, `.env.example`,
      request-id + error contract, structured logging, Prisma migrations.
- [ ] **P1 Auth & tenancy** — signup, login, logout, `/api/auth/me`, firm creation/profile,
      invitations, roles (firm_admin/partner/senior/article/viewer), RBAC + tenant-scoped
      query protection, password hashing, deactivation, rate limiting, auth audit logs.
- [ ] **P2 Clients & engagements** — client CRUD w/ PAN/GSTIN/TAN/CIN validation + duplicate
      detection + contacts + archive; engagement CRUD + status lifecycle + team assignment +
      setup checklist + overview; engagement isolation.
- [ ] **P3 Documents & storage** — upload (drag-drop, multi), categories, private MinIO,
      presigned URLs, file hash + dup detection, size/mime limits, status machine, archive,
      reprocess, download audit log.
- [ ] **P4 Processing pipeline** — FastAPI engine: type detection, XLSX/XLS/CSV/PDF parse,
      OCR hook, classification, header/column detection + mapping UI, normalization (date/
      GSTIN/PAN/invoice/amount), duplicate rows, `source_records` w/ page+row+confidence,
      idempotent jobs + processing_stages.
- [ ] **P5 Reconciliation framework** — run creation, source A/B selection, persisted
      configuration (tolerances), progress, items w/ match_status+score+reasons, tabs,
      pagination, summary metrics, export abstraction, retry/cancel.
- [ ] **P6 GST module** — purchase↔2B, sales↔1A; GSTIN/invoice normalization; exact→date→
      fuzzy→tolerance match scoring per TRD 2.7; duplicates; exception generation; report.
- [ ] **P7 Bank module** — statement↔book, debit/credit, ref/cheque/UTR, date+amount tolerance,
      outstanding, duplicates/reversals/round/weekend risk rules, bank report.
- [ ] **P8 26AS/AIS module** — PAN/TAN/section/quarter normalization, deductor+section-wise
      matching, tax credit loss summary, tax exceptions.
- [ ] **P9 Exceptions & review** — queue/filters, assignment, comments/internal notes,
      evidence upload, status transitions w/ server-side validation, high-risk approval rules
      (Article cannot close high-risk; senior/partner gates), reopen, activity history.
- [ ] **P10 Risk & verification** — versioned rule engine (journal/invoice/expense risk),
      additive scoring, explainable reasons, exception creation from findings.
- [ ] **P11 AI features** — provider abstraction (gemini/qwen fallback), classification
      suggestion, mismatch explanation, structured validated responses, labels + confidence +
      source refs + human approval status; no silent overrides.
- [ ] **P12 Working papers & reports** — generation from run/exception data, procedures,
      conclusion, review status workflow, PDF/XLSX/CSV export, partner sign-off.
- [ ] **P13 Dashboard/tasks** — role-specific views, metrics that reconcile to data.
- [ ] **P14 Hardening** — tenant-isolation tests, RBAC tests, job retry/DLQ, large files.

## 5. Build order in this session

Build bottom-up and verify each layer before the next, keeping every documented flow intact:

1. Monorepo scaffold + shared package + Prisma schema + migrate against live Postgres.
2. Express API: auth → tenancy/RBAC → clients → engagements → documents → reconciliation →
   exceptions → working papers → reports → audit logs; BullMQ worker.
3. FastAPI engine: parsing/normalization → reconciliation modules → risk → AI abstraction.
4. Next.js web: design system → auth screens → dashboard → clients → engagements →
   documents → reconciliation (GST/Bank/26AS) → exceptions → working papers → reports →
   settings/team.
5. End-to-end smoke: create firm→client→engagement→upload→process→reconcile→exceptions→
   review→working paper→report, verifying tenant isolation and audit log.

## 6. Definition of done per feature
UI → API → DB → Worker → Engine → (AI where required) → Result → Exception → Review →
Audit log, plus loading/empty/error states, validation, authorization, tests, traceability.
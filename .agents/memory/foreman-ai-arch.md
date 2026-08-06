---
name: Foreman AI architecture
description: Key decisions, entities, and demo data for the Foreman AI app
---

## Stack
- Frontend: React + Vite at `artifacts/foreman-ai/` (port 23323, previewPath `/`)
- API: Express 5 at `artifacts/api-server/` (port 8080, prefix `/api`)
- DB: PostgreSQL + Drizzle ORM at `lib/db/`
- Auth: Clerk (Replit-managed)
- State: Zustand for active company, React Query for server state
- Type gen: Orval from `lib/api-spec/openapi.yaml` → `lib/api-client-react/` and `lib/api-zod/`

## Routes
All API routes are registered in `artifacts/api-server/src/routes/index.ts`:
- me, companies, crews, projects, reports (includes time-entries, materials, equipment, photos, signature sub-routes), catalog, dictation, dashboard

## Auth middleware
`requireAuth` in `artifacts/api-server/src/middlewares/requireAuth.ts` — gets clerkUserId from Clerk, does JIT user provisioning.

## Demo data (seeded — "Prairie Line Contractors")
- Company ID: 1
- 2 projects: Southgate Substation Rebuild (PLC-2026-001), Rural Distribution Upgrade (PLC-2026-002)
- 2 crews: Crew Alpha (5 members), Crew Bravo (4 members)
- 3 reports: 1 complete (2 days ago), 2 drafts (yesterday + today)
- 18 catalog materials, 10 catalog equipment items
- 4 demo users (admin, supervisor, 2 foremen) — no Clerk IDs; prefixed `seed_*`

## Voice dictation
`POST /api/parse-dictation` — rule-based mock parser, labeled `isMocked: true`. Real AI integration (OpenAI) is a planned follow-up.

## Photo storage
MVP: base64 dataUrl stored directly in `photos.url` column. Object storage is a planned follow-up.

# Stellora — Phase 1 Repository Audit

**Audit date:** 2026-10-16
**Auditor:** Engineering (Phase 1)
**Repository:** https://github.com/hsscoders/Stellora.git
**Scope:** Repository state, local runtime, tooling, database feasibility, brand references, risk register. No implementation was performed in this phase.

---

## 1. Repository State

| Item | Finding |
|---|---|
| Clone target | `https://github.com/hsscoders/Stellora.git` → cloned successfully to `/home/z/my-project/stellora-repo` |
| Branch | `main` (HEAD = `origin/main`, working tree clean) |
| Commit history | 1 commit — `e9057ba` "Initial commit" by hsscoders <HSSCODERS@GMAIL.COM> |
| Tracked files | `README.md` only (2 lines: brand name + business categories) |
| Existing code | **None.** No package.json, no framework, no CI, no configs |
| Existing user work at risk | **None.** Greenfield repository; nothing to preserve or migrate |
| Architectural debt | None — no stack to migrate away from |

**Conclusion:** Stellora is a greenfield project. The full architecture defined in `docs/ARCHITECTURE.md` can be established without any destructive rewrite. The original README content (brand name + category line) is preserved in the expanded README.

---

## 2. Local Runtime & Tooling Audit (verified by execution)

| Component | Verified State | Assessment |
|---|---|---|
| OS | Debian GNU/Linux 13 (trixie), glibc 2.41 | Modern, supported |
| Node.js | v24.21.0 | Current major; fully compatible with Next.js 16 |
| npm | 11.19.0 | Current |
| Bun | 1.3.14 | Available; used by the sandbox dev pipeline |
| Git | 2.47.3 | Current |
| Python | 3.12.15 | Available (utility scripts) |
| CPU / RAM / Disk | 2 vCPU / 4.1 GiB / ~9.3 GiB free | Sufficient for dev builds and test runs |
| Docker | Not installed | Not required; noted as unavailable |
| sudo / root | Not available | Constrains system package installs (see DB strategy) |
| MySQL / MariaDB server | Not installed; `apt` has `mariadb-server 11.8.6` but install requires root | Blocker resolved by user-space strategy below |
| Network | npm registry reachable (npm ping 197 ms), GitHub HTTPS reachable (200), MariaDB archive reachable (HTTP 200) | No connectivity blockers |

### 2.1 Database Feasibility (verified)

A rootless sandbox cannot install MySQL via apt. Feasibility of a user-space MySQL-compatible server was verified:

- Portable **MariaDB 11.8.2** Linux tarball (glibc-compatible, 424 MB) confirmed downloadable from `archive.mariadb.org` (HTTP 200).
- MariaDB is a MySQL drop-in; **Prisma ORM officially supports it through its `mysql` provider**, so the application code targets MySQL semantics while the development database runs MariaDB.
- Planned layout: server binary in the user home (`~/.local/`), data directory inside the workspace (gitignored), started with a custom `mysqld` invocation on a non-privileged port (e.g., 33061).

**Decision:** Development DB = portable MariaDB 11.8 (MySQL wire/SQL compatibility). Production DB = MySQL 8. Both accessed by the same Prisma client configured with `provider = "mysql"` and `DATABASE_URL` from environment. Documented fallback: if the user-space server proves unstable in this sandbox, development temporarily targets SQLite with the identical Prisma schema minus MySQL-specific attributes, and the MySQL provider is restored for deployment — this fallback is a last resort only.

### 2.2 Environment Package Versions (verified via npm registry)

| Package | Latest (verified) | Intended |
|---|---|---|
| next | 16.4.1 (v15 line: 15.5.28) | Next.js 16 line (sandbox-standard, App Router) |
| prisma / @prisma/client | 7.10.0 latest; 6.19.3 stable v6 line | **Prisma 6.x (latest 6)** — mature MySQL tooling; v7 changed its config/generator model and is very new; upgrade documented as post-launch work |
| zod | 4.6.7 | v4 |
| tailwindcss | 4.3.3 | v4 |

The sandbox also ships a ready Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui baseline with 50+ pre-built UI primitives (buttons, dialogs, sheets, tables, forms, toasts, skeletons), Prisma 6, next-themes, zod, react-hook-form, TanStack Query, Zustand, framer-motion, and sonner. Reusing this baseline shortens Phase 3 and keeps the preview pipeline (auto dev server on port 3000 behind a gateway) working.

### 2.3 Preview / Dev-Server Constraint (important)

The sandbox auto-runs `bun install → db:push → next dev -p 3000` from the workspace root and exposes **only port 3000** through a gateway. To honor the project rule "work inside the cloned repository," the plan is:

- All application code lives in `/home/z/my-project/stellora-repo/` (this repo) — canonical source of truth, pushed to GitHub.
- The workspace root keeps a thin launcher whose `dev` / `db:push` scripts delegate into `stellora-repo/`, so the auto-served app **is** the Stellora app (single port 3000, single preview).
- No parallel demo project, no duplicated code paths.

---

## 3. Brand Reference Analysis (from the 3 supplied storefront photographs)

Observed and adopted as design direction (photographs are references only — they will not be reproduced as the website):

| Observation from photos | Design translation |
|---|---|
| "Stellora" signage: dark charcoal panel, white elegant lettering, tagline "Sterling Silver, Artificial Jewellery, Vanity and Hand Bags" | Charcoal + warm ivory palette; white serif display type for the wordmark; exact category set adopted in navigation |
| Sehgal Jewellers facade: warm ivory/cream panels, champagne-gold framing, diamond geometric motif | Champagne-gold accent line work, thin gold borders on cards, subtle diamond/geometric motifs in section dividers |
| Glass display windows, warm interior lighting | Editorial product photography on warm ivory backgrounds, generous whitespace |
| Black-and-white checkered entrance tiles, potted greenery | Possible subtle checker texture accent in promo sections; restrained use |
| Stocked brands visible on facade: NYXAA, Swiss Beauty, Recode, Dot & Key | **Flagged for confirmation** — not advertised on the site until ownership confirms brand relationships |
| Category signboard confirms "Hair Extensions" category | Four confirmed categories: Jewellery, Hair Extensions, Vanity, Handbags |

Palette direction (design tokens to be finalized in Phase 3): champagne gold `#C6A15B`-range, warm ivory `#FAF7F1`, cream `#F3EDE3`, charcoal `#201E1B`, refined neutrals; both light (default) and dark themes must meet WCAG AA contrast.

Typography direction: an elegant serif display face for headings/wordmark paired with a clean humanist sans for UI/body; tabular figures for prices. Final selections confirmed in Phase 3 design system.

---

## 4. Unknown Business Details — Flagged for Confirmation (not invented anywhere)

The site will keep every item below configurable (admin settings / environment) with safe placeholders. Nothing fabricated:

1. Legal business name, registered address, shop address shown on Contact page
2. Contact phone numbers and email addresses (visible on the physical facade — require owner confirmation before publishing)
3. GSTIN / tax registration display
4. Shipping rates, zones, free-shipping threshold, delivery time promises
5. Return / refund / exchange policy text
6. Payment gateway choice and credentials (e.g., Razorpay — common for Indian retail — but no keys exist yet)
7. Real product photography and official brand logo (replaceable assets; interim imagery clearly managed as placeholder content)
8. Brand partnership claims (NYXAA, Swiss Beauty, Recode, Dot & Key)
9. Social media handles and WhatsApp support number
10. Store hours and any offline-store visit policies

---

## 5. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | No MySQL server installable (no root) | High | Portable MariaDB 11.8 user-space server (verified downloadable); Prisma `mysql` provider; SQLite fallback documented |
| R2 | Payment gateway credentials unavailable | High | Build a clearly labelled "Pending payment / Pay on confirmation" flow; gateway integration behind an env flag with webhook HMAC verification + idempotency, disabled until keys are provided. No simulated success states |
| R3 | Playwright E2E may lack system libraries (no sudo) | Medium | Attempt bundled headless Chromium; if blocked, E2E coverage via API-level integration tests (Vitest + real test DB) and report honestly |
| R4 | 2 vCPU / 4 GB RAM — production builds and test suites are slow | Medium | Phase-wise verification; prefer targeted test runs; production build only at phase gates |
| R5 | No real product imagery or logo | Medium | Generate category-appropriate placeholder imagery (replaceable via admin uploads); text wordmark until official logo arrives |
| R6 | Secrets hygiene — credentials must never enter the repo | High | All secrets via `.env` (gitignored); `.env.example` committed without values; logging avoids sensitive fields |
| R7 | Preview pipeline expects workspace-root dev server | Low | Thin launcher delegation from workspace root into this repo (single port 3000) |
| R8 | Next.js 16 + Prisma 6 combination is current but fast-moving | Low | Pin exact versions in package.json; lockfile committed; documented upgrade path |
| R9 | Scoped GitHub token shared in chat | Medium | Use token transiently for push only, remove from remote config immediately after; **recommend the owner rotate/revoke the token after this session** |

---

## 6. Phase 1 Completion Summary

- [x] Repository cloned; Git status, history, and tracked files verified
- [x] README.md and entire repo contents inspected (README only — greenfield)
- [x] Local runtime, package manager, and tooling confirmed
- [x] MySQL availability gap identified and resolved via verified user-space MariaDB strategy
- [x] Reference photographs reviewed; brand direction extracted; sensitive/unknown business details flagged
- [x] Proposed architecture documented (`docs/ARCHITECTURE.md`)
- [x] Phased implementation plan with acceptance criteria (`docs/IMPLEMENTATION_PLAN.md`)
- [ ] Implementation intentionally **not started** (per project instructions — awaiting Phase 1 sign-off)

**Next recommended step:** On Phase 1 sign-off, begin **Phase 3 (Foundation)** — scaffold the Next.js 16 app inside this repository, provision the MariaDB data directory, connect Prisma with the MySQL provider, set up the design-system tokens, theme infrastructure, health check, and test harness. (Phase 2 architecture is already drafted in `docs/ARCHITECTURE.md`.)

# Stellora

Sterling Artificial jewellery , hair extensions , vanity & hand bags

Stellora is a premium retail brand's official e-commerce platform — a modern, luxury web store for sterling & artificial jewellery, hair extensions, vanity products and handbags, backed by a complete order, inventory and content management system.

> **Status: Phase 1 (Repository Audit & Architecture) complete.** Implementation has not started yet, by design. See the documents below.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/REPOSITORY_AUDIT.md`](docs/REPOSITORY_AUDIT.md) | Phase 1 audit: repo state, environment, tooling, database feasibility, brand references, risk register |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Proposed stack, repository layout, data model, API conventions, security architecture |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Phased plan (Phases 2–7) with acceptance criteria and completion-report protocol |

## Brand

- **Categories:** Jewellery (sterling & artificial) · Hair Extensions · Vanity · Handbags
- **Design direction:** champagne gold, warm ivory, cream, charcoal; elegant serif display type; premium product presentation; light mode default with complete dark mode
- **Language:** English only throughout the UI

## Planned Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma ORM · MySQL 8 (MariaDB user-space in the dev sandbox) · Zod validation · server-managed sessions (scrypt) · Vitest + Playwright

## Engineering Principles

- Server-side authority for all prices, stock, discounts and order states — the client is never trusted.
- Truthful order and payment states only. No simulated checkout success; the payment gateway activates only after merchant credentials are configured.
- Security built into the architecture: RBAC, ownership checks, rate limiting, CSRF-safe cookies, parameterized queries, audit logs.
- Unknown business details (address, phones, policies, shipping rates, GSTIN) remain configurable placeholders until confirmed by the owner — never invented.

## Setup

Setup instructions will be added in Phase 3 (Foundation) once the application scaffold and database provisioning scripts land. Environment variables are documented in `.env.example` (to be created in Phase 3); no secrets are ever committed.

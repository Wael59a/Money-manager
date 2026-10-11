# Money Manager

A personal finance app for understanding spending, managing monthly budgets, and making progress toward savings goals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/money-manager` — React dashboard and finance management pages
- `artifacts/api-server/src/routes/finance.ts` — finance API handlers
- `lib/api-spec/openapi.yaml` — source of truth for finance API contracts
- `lib/db/src/schema` — transaction, budget, savings goal, and money owed tables

## Architecture decisions

- A single shared Express API serves the web app through the `/api` path.
- Dashboard budget spending is calculated from current-month expense transactions so it stays current after edits.
- The first-run seed is idempotent and only inserts starter data when the transaction table is empty.

## Product

- Overview dashboard with balance, monthly income/spending, category breakdown, recent activity, budget pulse, and savings progress
- Searchable and filterable transaction ledger with create, edit, and delete actions
- Monthly budget and savings goal management with progress tracking
- Money owed tracking with people, amount lent, repayments, due dates, notes, and remaining balances

## User preferences

No standing preferences recorded.

## Gotchas

- Run API codegen after OpenAPI changes so the frontend hooks and server schemas stay aligned.
- Finance data is currently a single personal workspace; bank connections and multi-user accounts are not included in the MVP.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

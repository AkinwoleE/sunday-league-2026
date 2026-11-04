# Sunday League Tournament 2026

Mobile-first league site with an admin dashboard. Static front end (`public/`), Vercel Node functions (`api/`), Neon Postgres.

- `/` public site (hash routes: matches, table, stats, teams, title race/bracket, rules)
- `/#/admin` admin dashboard (password from the `ADMIN_PASSWORD` env var)

## Env vars (set in Vercel, never committed)
- `DATABASE_URL` — Neon Postgres (added by the Vercel Neon integration)
- `ADMIN_PASSWORD` — admin sign-in password
- `SESSION_SECRET` — signs admin session tokens

## Seeding
`data/seed.json` was parsed from the organisers' spreadsheet.
`DATABASE_URL=... npm run seed` creates the tables and seeds if empty (`-- --reset` wipes and reseeds).

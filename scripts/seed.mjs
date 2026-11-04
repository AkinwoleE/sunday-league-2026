// Seeds the database from data/seed.json (parsed from the original spreadsheet).
// Usage: DATABASE_URL=... node scripts/seed.mjs [--reset]
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
const sql = neon(process.env.DATABASE_URL);
const seed = JSON.parse(fs.readFileSync(new URL('../data/seed.json', import.meta.url)));
const schema = fs.readFileSync(new URL('../lib/schema.sql', import.meta.url), 'utf8');
if (process.argv.includes('--reset')) {
  for (const t of ['events', 'fixtures', 'players', 'teams', 'settings']) await sql(`DROP TABLE IF EXISTS ${t} CASCADE`);
}
for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) await sql(stmt);
const [{ n }] = await sql`SELECT count(*)::int AS n FROM teams`;
if (n > 0) { console.log('Already seeded; use --reset to wipe and reseed.'); process.exit(0); }
// Colours/short codes are site styling defaults (not in the sheet); editable in admin.
const palette = { 'El Nino': ['#00b8ff', 'ELN'], 'Legacy FC': ['#f5c400', 'LEG'], 'Venom FC': ['#19d27a', 'VEN'], 'Super Strikas FC': ['#ff3d6e', 'SSF'], 'Lion Stars FC': ['#ff8a1f', 'LSF'] };
const ids = {};
for (const name of seed.teams) {
  const [c, s] = palette[name] || ['#8aa0ff', name.slice(0, 3).toUpperCase()];
  const [r] = await sql`INSERT INTO teams (name, short, color) VALUES (${name}, ${s}, ${c}) RETURNING id`;
  ids[name] = r.id;
}
for (const f of seed.fixtures) {
  await sql`INSERT INTO fixtures (match_no, date, slot, stage, home_id, away_id, home_goals, away_goals, status)
    VALUES (${f.match_no}, ${f.date}, ${f.slot}, 'league', ${ids[f.home]}, ${ids[f.away]}, ${f.home_goals}, ${f.away_goals}, ${f.status})`;
}
for (const p of seed.scorers) {
  await sql`INSERT INTO players (name, team_id, seed_goals, seed_apps, notes)
    VALUES (${p.name}, ${p.team ? ids[p.team] ?? null : null}, ${p.goals || 0}, ${p.matches || 0}, ${p.notes || null})`;
}
const info = seed.info;
const settings = { league_name: seed.league_name, info: Object.entries(info), rules: seed.rules }; // info stored as ordered pairs
for (const [k, v] of Object.entries(settings)) await sql`INSERT INTO settings (key, value) VALUES (${k}, ${JSON.stringify(v)}::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
console.log('Seeded', seed.teams.length, 'teams,', seed.fixtures.length, 'fixtures,', seed.scorers.length, 'players');

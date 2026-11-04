import { db } from '../lib/db.js';
export default async function handler(req, res) {
  try {
    const sql = db();
    const [settings, teams, players, fixtures, events] = await Promise.all([
      sql`SELECT key, value FROM settings`,
      sql`SELECT * FROM teams ORDER BY name`,
      sql`SELECT * FROM players ORDER BY name`,
      sql`SELECT id, match_no, to_char(date,'YYYY-MM-DD') AS date, slot, stage, home_id, away_id, home_goals, away_goals, status, notes FROM fixtures ORDER BY date NULLS LAST, match_no NULLS LAST, id`,
      sql`SELECT * FROM events ORDER BY fixture_id, minute NULLS LAST, id`,
    ]);
    const s = Object.fromEntries(settings.map((r) => [r.key, r.value]));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ settings: s, teams, players, fixtures, events });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load league data' });
  }
}

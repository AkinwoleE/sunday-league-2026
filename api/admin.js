import { db } from '../lib/db.js';
import { verify } from '../lib/auth.js';

const str = (v, max = 120) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));
const int = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));
const STATUSES = ['upcoming', 'live', 'completed', 'postponed', 'cancelled'];
const STAGES = ['league', 'SF1', 'SF2', 'F', '3P'];
const EVENT_TYPES = ['goal', 'assist', 'own_goal', 'penalty', 'yellow', 'red'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verify(req)) return res.status(401).json({ error: 'Not signed in' });
  const { action, data = {} } = req.body || {};
  const sql = db();
  try {
    switch (action) {
      case 'ping':
        return res.json({ ok: true });

      case 'saveTeam': {
        const name = str(data.name, 60);
        if (!name) throw new Error('Team name is required');
        const short = str(data.short, 4), color = str(data.color, 9), captain = str(data.captain, 60);
        const r = data.id
          ? await sql`UPDATE teams SET name=${name}, short=${short}, color=${color}, captain=${captain} WHERE id=${int(data.id)} RETURNING id`
          : await sql`INSERT INTO teams (name, short, color, captain) VALUES (${name}, ${short}, ${color}, ${captain}) RETURNING id`;
        return res.json({ ok: true, id: r[0]?.id });
      }
      case 'deleteTeam':
        await sql`DELETE FROM teams WHERE id=${int(data.id)}`;
        return res.json({ ok: true });

      case 'savePlayer': {
        const name = str(data.name, 60);
        if (!name) throw new Error('Player name is required');
        const v = [name, int(data.team_id), str(data.position, 20), int(data.number), int(data.seed_goals) || 0, int(data.seed_assists) || 0, int(data.seed_apps) || 0, str(data.notes, 200)];
        const r = data.id
          ? await sql`UPDATE players SET name=${v[0]}, team_id=${v[1]}, position=${v[2]}, number=${v[3]}, seed_goals=${v[4]}, seed_assists=${v[5]}, seed_apps=${v[6]}, notes=${v[7]} WHERE id=${int(data.id)} RETURNING id`
          : await sql`INSERT INTO players (name, team_id, position, number, seed_goals, seed_assists, seed_apps, notes) VALUES (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${v[6]}, ${v[7]}) RETURNING id`;
        return res.json({ ok: true, id: r[0]?.id });
      }
      case 'deletePlayer':
        await sql`DELETE FROM players WHERE id=${int(data.id)}`;
        return res.json({ ok: true });

      case 'saveFixture': {
        const home = int(data.home_id), away = int(data.away_id);
        if (!home || !away || home === away) throw new Error('Pick two different teams');
        const stage = STAGES.includes(data.stage) ? data.stage : 'league';
        const status = STATUSES.includes(data.status) ? data.status : 'upcoming';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : null;
        const r = data.id
          ? await sql`UPDATE fixtures SET match_no=${int(data.match_no)}, date=${date}, slot=${str(data.slot, 40)}, stage=${stage}, home_id=${home}, away_id=${away}, status=${status}, notes=${str(data.notes, 200)}, updated_at=now() WHERE id=${int(data.id)} RETURNING id`
          : await sql`INSERT INTO fixtures (match_no, date, slot, stage, home_id, away_id, status, notes) VALUES (${int(data.match_no)}, ${date}, ${str(data.slot, 40)}, ${stage}, ${home}, ${away}, ${status}, ${str(data.notes, 200)}) RETURNING id`;
        return res.json({ ok: true, id: r[0]?.id });
      }
      case 'deleteFixture':
        await sql`DELETE FROM fixtures WHERE id=${int(data.id)}`;
        return res.json({ ok: true });

      case 'saveResult': {
        const id = int(data.id);
        const hg = int(data.home_goals), ag = int(data.away_goals);
        let status = STATUSES.includes(data.status) ? data.status : 'completed';
        if ((hg == null || ag == null) && status === 'completed') throw new Error('Enter both scores to complete a match');
        if ((hg != null && hg < 0) || (ag != null && ag < 0)) throw new Error('Scores cannot be negative');
        const evs = (Array.isArray(data.events) ? data.events : [])
          .filter((e) => EVENT_TYPES.includes(e.type))
          .slice(0, 80)
          .map((e) => ({ type: e.type, team_id: int(e.team_id), player_id: int(e.player_id), minute: int(e.minute), note: str(e.note, 80) }));
        const q = [
          sql`UPDATE fixtures SET home_goals=${hg}, away_goals=${ag}, status=${status}, updated_at=now() WHERE id=${id}`,
          sql`DELETE FROM events WHERE fixture_id=${id}`,
          ...evs.map((e) => sql`INSERT INTO events (fixture_id, team_id, player_id, type, minute, note) VALUES (${id}, ${e.team_id}, ${e.player_id}, ${e.type}, ${e.minute}, ${e.note})`),
        ];
        await sql.transaction(q);
        return res.json({ ok: true });
      }
      case 'clearResult': {
        const id = int(data.id);
        await sql.transaction([
          sql`UPDATE fixtures SET home_goals=NULL, away_goals=NULL, status='upcoming', updated_at=now() WHERE id=${id}`,
          sql`DELETE FROM events WHERE fixture_id=${id}`,
        ]);
        return res.json({ ok: true });
      }
      case 'saveSettings': {
        const allowed = ['league_name', 'info', 'rules', 'notice'];
        const q = [];
        for (const k of allowed) if (k in data) q.push(sql`INSERT INTO settings (key, value) VALUES (${k}, ${JSON.stringify(data[k])}::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`);
        if (q.length) await sql.transaction(q);
        return res.json({ ok: true });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    console.error(e);
    const msg = /duplicate key/.test(e.message) ? 'That name already exists' : e.message;
    return res.status(400).json({ error: msg });
  }
}

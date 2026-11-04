'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let D = null; // league data
const TOKEN_KEY = 'sl_admin_token';

/* ---------- data ---------- */
async function load() {
  const r = await fetch('/api/data?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load data');
  D = await r.json();
  if (Array.isArray(D.settings.info)) D.settings.info = Object.fromEntries(D.settings.info);
  D.team = Object.fromEntries(D.teams.map((t) => [t.id, t]));
  D.player = Object.fromEntries(D.players.map((p) => [p.id, p]));
  D.eventsBy = {};
  for (const e of D.events) (D.eventsBy[e.fixture_id] ||= []).push(e);
  const league = D.fixtures.filter((f) => f.stage === 'league');
  const dates = [...new Set(league.map((f) => f.date).filter(Boolean))].sort();
  D.matchday = Object.fromEntries(dates.map((d, i) => [d, i + 1]));
  D.totalMd = dates.length;
  const name = D.settings.league_name || 'Sunday League';
  const m = name.match(/^(.*?)(\s+(Tournament|Cup|League)?\s*\d{4})?$/i);
  $('#brand-name').textContent = (m && m[1]) || name;
  $('#brand-sub').textContent = (m && m[2] ? m[2].trim() : 'Season');
  document.title = name;
}
const done = (f) => f.status === 'completed' && f.home_goals != null && f.away_goals != null;

function standings() {
  const rows = new Map(D.teams.map((t) => [t.id, { team: t, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [], left: 0 }]));
  const lf = D.fixtures.filter((f) => f.stage === 'league');
  const played = lf.filter(done).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.match_no || 0) - (b.match_no || 0));
  for (const f of lf) if (!done(f) && f.status !== 'cancelled') { rows.get(f.home_id) && rows.get(f.home_id).left++; rows.get(f.away_id) && rows.get(f.away_id).left++; }
  for (const f of played) {
    const h = rows.get(f.home_id), a = rows.get(f.away_id);
    if (!h || !a) continue;
    h.mp++; a.mp++; h.gf += f.home_goals; h.ga += f.away_goals; a.gf += f.away_goals; a.ga += f.home_goals;
    if (f.home_goals > f.away_goals) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
    else if (f.home_goals < f.away_goals) { a.w++; h.l++; a.pts += 3; a.form.push('W'); h.form.push('L'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  }
  const list = [...rows.values()];
  list.forEach((r) => (r.gd = r.gf - r.ga));
  const key = (r) => `${r.pts}|${r.gd}|${r.gf}`;
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
  // head-to-head among fully tied teams
  const groups = {};
  list.forEach((r) => (groups[key(r)] ||= []).push(r));
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const ids = new Set(g.map((r) => r.team.id));
    g.forEach((r) => (r.h2h = 0));
    for (const f of played) {
      if (!ids.has(f.home_id) || !ids.has(f.away_id)) continue;
      const h = g.find((r) => r.team.id === f.home_id), a = g.find((r) => r.team.id === f.away_id);
      if (f.home_goals > f.away_goals) h.h2h += 3; else if (f.home_goals < f.away_goals) a.h2h += 3; else { h.h2h++; a.h2h++; }
    }
  }
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || (y.h2h || 0) - (x.h2h || 0) || x.team.name.localeCompare(y.team.name));
  list.forEach((r, i) => (r.pos = i + 1));
  return list;
}

function playerStats() {
  const s = new Map(D.players.map((p) => [p.id, { p, goals: p.seed_goals || 0, assists: p.seed_assists || 0, yellow: 0, red: 0, apps: new Set() }]));
  for (const e of D.events) {
    const r = s.get(e.player_id);
    if (!r) continue;
    r.apps.add(e.fixture_id);
    if (e.type === 'goal' || e.type === 'penalty') r.goals++;
    else if (e.type === 'assist') r.assists++;
    else if (e.type === 'yellow') r.yellow++;
    else if (e.type === 'red') r.red++;
  }
  return [...s.values()];
}

/* ---------- helpers ---------- */
const fmtDate = (d, long) => {
  if (!d) return 'Date TBC';
  const x = new Date(d + 'T12:00:00');
  return x.toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
};
function crest(t, cls = '') {
  if (!t) return `<span class="crest ${cls}" style="background:#334">?</span>`;
  const short = t.short || t.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return `<span class="crest ${cls}" style="background:${esc(t.color || '#8aa0ff')}">${esc(short)}</span>`;
}
const tName = (id) => (D.team[id] ? D.team[id].name : 'TBD');
function matchRow(f) {
  const h = D.team[f.home_id], a = D.team[f.away_id];
  const fin = done(f);
  const hl = fin && f.home_goals < f.away_goals ? 'lose' : '', al = fin && f.away_goals < f.home_goals ? 'lose' : '';
  let mid;
  if (fin) mid = `<div class="score">${f.home_goals} – ${f.away_goals}<span class="lbl">FT</span></div>`;
  else if (f.status === 'live') mid = `<div class="score">${f.home_goals ?? 0} – ${f.away_goals ?? 0}<span class="lbl"><span class="badge live">Live</span></span></div>`;
  else if (f.status === 'postponed' || f.status === 'cancelled') mid = `<div class="score ko">${f.status === 'postponed' ? 'PPD' : 'CANC'}</div>`;
  else mid = `<div class="score ko">${esc((f.slot || 'TBC').split(/[–-]/)[0].trim())}<span class="lbl">${f.slot && /PM|AM/i.test(f.slot) && !/PM|AM/i.test(f.slot.split(/[–-]/)[0]) ? esc(f.slot.match(/AM|PM/i)[0]) : 'KO'}</span></div>`;
  return `<a class="match" href="#/match/${f.id}">
    <div class="t ${hl}">${crest(h)}<span>${esc(h ? h.name : 'TBD')}</span></div>${mid}
    <div class="t away ${al}">${crest(a)}<span>${esc(a ? a.name : 'TBD')}</span></div></a>`;
}
function dayGroups(fixtures) {
  const g = new Map();
  for (const f of fixtures) { const k = f.date || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.entries()].map(([date, fx]) => `<div class="card" style="margin-bottom:12px">
    <div class="md-head"><span>${D.matchday[date] ? `<b>Matchday ${D.matchday[date]}</b> · ` : ''}${esc(fmtDate(date))}</span><span>${fx.every(done) ? '<span class="badge ft">Full time</span>' : ''}</span></div>
    ${fx.map(matchRow).join('')}</div>`).join('');
}
const formHtml = (arr) => `<div class="form">${arr.slice(-5).map((x) => `<i class="${x}">${x}</i>`).join('') || '<span style="color:var(--muted)">–</span>'}</div>`;
function tableHtml(rows, compact) {
  return `<table class="tbl"><thead><tr><th class="pos">#</th><th class="l">Team</th><th>P</th>${compact ? '' : '<th>W</th><th>D</th><th>L</th><th class="hide-s">GF</th><th class="hide-s">GA</th>'}<th>GD</th><th>Pts</th>${compact ? '' : '<th class="hide-s">Form</th>'}</tr></thead><tbody>
  ${rows.map((r) => `<tr class="${r.pos === 1 && r.mp ? 'lead' : ''}" onclick="location.hash='#/team/${r.team.id}'" style="cursor:pointer">
    <td class="pos">${r.pos}</td><td class="l"><span class="tm">${crest(r.team, 'sm')}${esc(r.team.name)}</span></td><td>${r.mp}</td>
    ${compact ? '' : `<td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td class="hide-s">${r.gf}</td><td class="hide-s">${r.ga}</td>`}
    <td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td>${compact ? '' : `<td class="hide-s">${formHtml(r.form)}</td>`}</tr>`).join('')}
  </tbody></table>`;
}
function leaders(list, field, label, n = 10) {
  const l = list.filter((x) => x[field] > 0).sort((a, b) => b[field] - a[field] || a.p.name.localeCompare(b.p.name)).slice(0, n);
  if (!l.length) return `<div class="empty">No ${label.toLowerCase()} recorded yet.</div>`;
  let rank = 0, prev = null;
  return l.map((x, i) => { if (x[field] !== prev) { rank = i + 1; prev = x[field]; }
    const t = D.team[x.p.team_id];
    return `<a class="leader ${rank === 1 ? 'top' : ''}" href="#/player/${x.p.id}"><span class="rk">${rank}</span>${crest(t, 'sm')}<span class="nm"><b>${esc(x.p.name)}</b><small>${esc(t ? t.name : 'Team not set')}</small></span><span class="val">${x[field]}</span></a>`; }).join('');
}
const ring = `<svg class="ring" viewBox="0 0 200 200">${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2, x = 100 + 72 * Math.cos(a), y = 100 + 72 * Math.sin(a); return `<path transform="translate(${x - 12} ${y - 12}) scale(1)" d="M12 1l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L12 17.5 5.5 21l1.3-7.2L1.5 8.6l7.3-1z" fill="#fff"/>`; }).join('')}</svg>`;

/* ---------- views ---------- */
const V = {};
V.home = () => {
  const st = standings(), ps = playerStats();
  const league = D.fixtures.filter((f) => f.stage === 'league');
  const upcoming = D.fixtures.filter((f) => !done(f) && f.status !== 'cancelled');
  const nextDate = upcoming.map((f) => f.date).filter(Boolean).sort()[0];
  const next = upcoming.filter((f) => f.date === nextDate);
  const doneDates = D.fixtures.filter(done).map((f) => f.date).sort();
  const lastDate = doneDates[doneDates.length - 1];
  const last = D.fixtures.filter((f) => done(f) && f.date === lastDate);
  const played = league.filter(done).length;
  const goals = league.filter(done).reduce((s, f) => s + f.home_goals + f.away_goals, 0);
  const info = D.settings.info || {};
  return `
  <section class="hero">${ring}
    <div class="eyebrow">${esc(info['Match day'] || 'Matchday')} · ${esc(info['Playing window'] || '')}</div>
    <h1>${esc(D.settings.league_name || 'Sunday League')}</h1>
    <p>${esc(info['Tournament dates'] || '')}</p>
    <div class="stats-row" style="margin-top:16px">
      <div class="stat"><b>${D.teams.length}</b><small>Teams</small></div>
      <div class="stat"><b>${played}/${league.length}</b><small>Played</small></div>
      <div class="stat"><b>${goals}</b><small>Goals</small></div>
      <div class="stat"><b>${played ? (goals / played).toFixed(1) : '0'}</b><small>Per game</small></div>
    </div>
  </section>
  ${D.settings.notice ? `<div class="card pad" style="margin-top:12px;border-color:rgba(0,224,255,.4)">📣 ${esc(D.settings.notice)}</div>` : ''}
  ${next.length ? `<div class="h-sec"><h2>Next up</h2><a href="#/matches">All fixtures</a></div>${dayGroups(next)}` : `<div class="h-sec"><h2>Season complete</h2></div>`}
  ${last.length ? `<div class="h-sec"><h2>Latest results</h2><a href="#/matches/results">All results</a></div>${dayGroups(last)}` : ''}
  <div class="grid2">
    <div><div class="h-sec"><h2>Standings</h2><a href="#/table">Full table</a></div><div class="card">${tableHtml(st, true)}</div></div>
    <div><div class="h-sec"><h2>Golden boot</h2><a href="#/stats">All stats</a></div><div class="card">${leaders(ps, 'goals', 'Goals', 5)}</div></div>
  </div>
  <div class="h-sec"><h2>More</h2></div>
  <div class="card"><a class="teamtile" href="#/race"><span class="crest" style="background:var(--gold)">🏆</span><span class="nm"><b>Title race &amp; bracket</b><small>Who can still win it</small></span><span class="chev">›</span></a>
  <a class="teamtile" href="#/rules"><span class="crest" style="background:var(--accent)">📋</span><span class="nm"><b>Rules &amp; format</b><small>Tie-breakers, match length, eligibility</small></span><span class="chev">›</span></a></div>`;
};
V.matches = (filter = 'all') => {
  let fx = D.fixtures;
  if (filter === 'results') fx = fx.filter(done).slice().reverse();
  else if (filter === 'upcoming') fx = fx.filter((f) => !done(f));
  else if (/^\d+$/.test(filter)) fx = fx.filter((f) => f.home_id == filter || f.away_id == filter);
  const chip = (k, l) => `<a class="chip ${filter === k ? 'on' : ''}" href="#/matches/${k}">${esc(l)}</a>`;
  return `<div class="h-sec" style="margin-top:6px"><h2>Matches</h2></div>
  <div class="chips">${chip('all', 'All')}${chip('upcoming', 'Upcoming')}${chip('results', 'Results')}${D.teams.map((t) => chip(String(t.id), t.name)).join('')}</div>
  <div class="sp"></div>${fx.length ? dayGroups(fx) : '<div class="card empty">No matches here yet.</div>'}`;
};
V.match = (id) => {
  const f = D.fixtures.find((x) => x.id == id);
  if (!f) return '<div class="card empty">Match not found.</div>';
  const h = D.team[f.home_id], a = D.team[f.away_id];
  const evs = (D.eventsBy[f.id] || []).slice();
  const icon = { goal: '⚽', penalty: '⚽ (P)', own_goal: '⚽ (OG)', assist: '🅰️', yellow: '<span class="card-y"></span>', red: '<span class="card-r"></span>' };
  const label = (e) => `${icon[e.type] || ''} ${esc(D.player[e.player_id] ? D.player[e.player_id].name : e.note || 'Unknown')}`;
  const stage = { league: D.matchday[f.date] ? `Matchday ${D.matchday[f.date]}` : 'League', SF1: 'Semi-final 1', SF2: 'Semi-final 2', F: 'Final', '3P': 'Third place' }[f.stage];
  return `<div class="hero" style="text-align:center">${ring}
    <div class="eyebrow">${esc(stage)}${f.match_no ? ` · Match ${f.match_no}` : ''}</div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin-top:14px">
      <a href="#/team/${f.home_id}">${crest(h, 'lg')}<div style="font-weight:700;margin-top:6px">${esc(h ? h.name : 'TBD')}</div></a>
      <div style="font-family:'Barlow Condensed';font-weight:800;font-size:44px">${done(f) || f.status === 'live' ? `${f.home_goals ?? 0}–${f.away_goals ?? 0}` : 'vs'}</div>
      <a href="#/team/${f.away_id}">${crest(a, 'lg')}<div style="font-weight:700;margin-top:6px">${esc(a ? a.name : 'TBD')}</div></a>
    </div>
    <p style="margin-top:12px">${esc(fmtDate(f.date, true))} · ${esc(f.slot || 'Time TBC')}</p>
    <p style="margin-top:6px">${done(f) ? '<span class="badge ft">Full time</span>' : f.status === 'live' ? '<span class="badge live">Live</span>' : `<span class="badge">${esc(f.status)}</span>`}</p>
  </div>
  <div class="h-sec"><h2>Match events</h2></div>
  <div class="card">${evs.length ? `<div class="timeline">${evs.map((e) => { const side = e.team_id === f.away_id ? 'a' : 'h';
    return `<div class="ev"><div class="l">${side === 'h' ? label(e) : ''}</div><div class="m">${e.minute != null ? e.minute + "'" : '•'}</div><div class="r">${side === 'a' ? label(e) : ''}</div></div>`; }).join('')}</div>`
    : `<div class="empty">${done(f) ? 'No scorers or cards were recorded for this match.' : 'Events appear here once the result is entered.'}</div>`}</div>
  ${f.notes ? `<p class="note">${esc(f.notes)}</p>` : ''}`;
};
V.table = () => {
  const st = standings();
  return `<div class="h-sec" style="margin-top:6px"><h2>League table</h2></div>
  <div class="card">${tableHtml(st)}<div class="legend">Tie-breakers: ${esc((D.settings.rules || []).find((r) => /tie/i.test(r.rule))?.details || 'Points, goal difference, goals scored, head-to-head')}. ${esc((D.settings.info || {}).Points || '')}</div></div>
  <p class="note">Tap a team for its fixtures and squad. Rotate your phone or use a wider screen to see GF, GA and form.</p>`;
};
V.stats = () => {
  const ps = playerStats();
  const anyCards = ps.some((x) => x.yellow || x.red);
  const cards = ps.map((x) => ({ ...x, cards: x.yellow + x.red * 2 }));
  return `<div class="h-sec" style="margin-top:6px"><h2>Golden boot</h2></div><div class="card">${leaders(ps, 'goals', 'Goals', 20)}</div>
  <div class="h-sec"><h2>Top assists</h2></div><div class="card">${leaders(ps, 'assists', 'Assists')}</div>
  <div class="h-sec"><h2>Discipline</h2></div><div class="card">${anyCards ? cards.filter((x) => x.cards).sort((a, b) => b.cards - a.cards).map((x) => `<a class="leader" href="#/player/${x.p.id}">${crest(D.team[x.p.team_id], 'sm')}<span class="nm"><b>${esc(x.p.name)}</b><small>${esc(D.team[x.p.team_id]?.name || 'Team not set')}</small></span><span>${x.yellow ? `<span class="card-y"></span> ${x.yellow} ` : ''}${x.red ? ` <span class="card-r"></span> ${x.red}` : ''}</span></a>`).join('') : '<div class="empty">No cards recorded yet.</div>'}</div>
  <p class="note">Goals from Matchday 1 come from the organisers' scorer sheet. From Matchday 2, stats update automatically from each result.</p>`;
};
V.teams = () => {
  const st = standings();
  return `<div class="h-sec" style="margin-top:6px"><h2>Teams</h2></div><div class="card">${st.map((r) => `<a class="teamtile" href="#/team/${r.team.id}">${crest(r.team)}<span class="nm"><b>${esc(r.team.name)}</b><small>${r.pos}${['st', 'nd', 'rd'][r.pos - 1] || 'th'} · ${r.pts} pts · ${D.players.filter((p) => p.team_id === r.team.id).length} players listed</small></span><span class="chev">›</span></a>`).join('')}</div>`;
};
V.team = (id) => {
  const t = D.team[id];
  if (!t) return '<div class="card empty">Team not found.</div>';
  const r = standings().find((x) => x.team.id === t.id);
  const ps = playerStats().filter((x) => x.p.team_id === t.id).sort((a, b) => b.goals - a.goals || a.p.name.localeCompare(b.p.name));
  const fx = D.fixtures.filter((f) => f.home_id === t.id || f.away_id === t.id);
  return `<div class="card"><div class="teamhead">${crest(t, 'lg')}<div><h1>${esc(t.name)}</h1><div style="color:var(--muted)">${r.pos}${['st', 'nd', 'rd'][r.pos - 1] || 'th'} place${t.captain ? ` · Captain: ${esc(t.captain)}` : ''}</div><div style="margin-top:6px">${formHtml(r.form)}</div></div></div>
  <div class="pad" style="padding-top:0"><div class="stats-row"><div class="stat"><b>${r.pts}</b><small>Pts</small></div><div class="stat"><b>${r.w}-${r.d}-${r.l}</b><small>W-D-L</small></div><div class="stat"><b>${r.gf}</b><small>Scored</small></div><div class="stat"><b>${r.ga}</b><small>Conceded</small></div></div></div></div>
  <div class="h-sec"><h2>Squad</h2></div><div class="card">${ps.length ? ps.map((x) => `<a class="leader" href="#/player/${x.p.id}"><span class="rk">${x.p.number ?? ''}</span><span class="nm"><b>${esc(x.p.name)}</b><small>${esc(x.p.position || '')}</small></span><span style="color:var(--muted);font-size:13px">⚽ ${x.goals} · 🅰️ ${x.assists}</span></a>`).join('') : '<div class="empty">Squad not added yet.</div>'}</div>
  <div class="h-sec"><h2>Fixtures</h2></div>${dayGroups(fx)}`;
};
V.player = (id) => {
  const x = playerStats().find((s) => s.p.id == id);
  if (!x) return '<div class="card empty">Player not found.</div>';
  const t = D.team[x.p.team_id];
  const evs = D.events.filter((e) => e.player_id === x.p.id);
  return `<div class="hero">${ring}<div class="eyebrow">${esc(t ? t.name : 'Team not set')}${x.p.position ? ' · ' + esc(x.p.position) : ''}</div><h1>${x.p.number != null ? '#' + x.p.number + ' ' : ''}${esc(x.p.name)}</h1>
  <div class="stats-row" style="margin-top:14px"><div class="stat"><b>${x.goals}</b><small>Goals</small></div><div class="stat"><b>${x.assists}</b><small>Assists</small></div><div class="stat"><b>${x.yellow}</b><small>Yellow</small></div><div class="stat"><b>${x.red}</b><small>Red</small></div></div></div>
  ${x.p.seed_goals ? `<p class="note">Includes ${x.p.seed_goals} goal${x.p.seed_goals > 1 ? 's' : ''} from the organisers' scorer sheet (not linked to a specific match).</p>` : ''}
  <div class="h-sec"><h2>Match log</h2></div><div class="card">${evs.length ? evs.map((e) => { const f = D.fixtures.find((z) => z.id === e.fixture_id); return f ? `<a class="leader" href="#/match/${f.id}"><span class="nm"><b>${esc(tName(f.home_id))} ${done(f) ? f.home_goals + '–' + f.away_goals : 'vs'} ${esc(tName(f.away_id))}</b><small>${esc(fmtDate(f.date))}${e.minute != null ? ` · ${e.minute}'` : ''}</small></span><span class="badge">${esc(e.type.replace('_', ' '))}</span></a>` : ''; }).join('') : '<div class="empty">No match events yet.</div>'}</div>`;
};
V.race = () => {
  const st = standings();
  const lead = st[0];
  const ko = D.fixtures.filter((f) => f.stage !== 'league');
  const by = (s) => ko.find((f) => f.stage === s);
  const slot = (f, side, placeholder) => {
    const id = f && (side === 'h' ? f.home_id : f.away_id);
    const g = f && done(f) ? (side === 'h' ? f.home_goals : f.away_goals) : '';
    return id ? `<div class="row"><span style="display:flex;gap:6px;align-items:center">${crest(D.team[id], 'sm')}${esc(tName(id))}</span><b>${g}</b></div>` : `<div class="row tbd"><span>${esc(placeholder)}</span></div>`;
  };
  const nm = (i) => (st[i] ? `${['1st', '2nd', '3rd', '4th'][i]} (now ${st[i].team.name})` : 'TBD');
  const box = (s, lab, p1, p2, cls = '') => { const f = by(s); return `<${f ? `a href="#/match/${f.id}"` : 'div'} class="bk ${cls}"><div class="lab">${lab}</div>${slot(f, 'h', p1)}${slot(f, 'a', p2)}</${f ? 'a' : 'div'}>`; };
  const fin = by('F');
  const champ = fin && done(fin) && fin.home_goals !== fin.away_goals ? tName(fin.home_goals > fin.away_goals ? fin.home_id : fin.away_id) : null;
  return `<div class="h-sec" style="margin-top:6px"><h2>Title race</h2></div>
  <div class="card">${st.map((r) => { const max = r.pts + 3 * r.left; const alive = max >= lead.pts; return `<a class="leader ${r.pos === 1 ? 'top' : ''}" href="#/team/${r.team.id}"><span class="rk">${r.pos}</span>${crest(r.team, 'sm')}<span class="nm"><b>${esc(r.team.name)}</b><small>${r.left} games left · max ${max} pts</small></span><span class="badge ${alive ? 'ft' : ''}">${alive ? 'In the race' : 'Out'}</span></a>`; }).join('')}</div>
  <p class="note">${esc((D.settings.info || {}).Format || '')}. The team top of the table after the last match wins the title.</p>
  <div class="h-sec"><h2>Knockout bracket</h2></div>
  <div class="card">${ko.length ? '' : '<div class="legend" style="border-top:0">This season has no knockout stage. The bracket is here in case organisers add one. Semi-final and final fixtures created in admin appear here automatically.</div>'}
    <div class="bracket"><div class="col">${box('SF1', 'Semi-final 1', nm(0), nm(3))}${box('SF2', 'Semi-final 2', nm(1), nm(2))}</div>
    <div class="col"><div class="trophy">🏆</div>${box('F', 'Final', 'Winner SF1', 'Winner SF2', 'final')}${champ ? `<div style="text-align:center;font-weight:800;color:var(--gold)">Champions: ${esc(champ)}</div>` : ''}</div></div></div>`;
};
V.rules = () => {
  const info = D.settings.info || {};
  return `<div class="h-sec" style="margin-top:6px"><h2>Format</h2></div><div class="card"><ul class="rules">${Object.entries(info).map(([k, v]) => `<li><b>${esc(k)}</b>${esc(v)}</li>`).join('')}</ul></div>
  <div class="h-sec"><h2>Rules</h2></div><div class="card"><ul class="rules">${(D.settings.rules || []).map((r) => `<li><b>${esc(r.rule)}</b>${esc(r.details)}</li>`).join('')}</ul></div>`;
};

/* ---------- admin ---------- */
const token = () => localStorage.getItem(TOKEN_KEY);
async function api(action, data) {
  const r = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() }, body: JSON.stringify({ action, data }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); route(); throw new Error('Session expired, sign in again'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 2600); }
let adminTab = 'results';
V.admin = (tab) => {
  if (tab) adminTab = tab;
  if (!token()) return `<div class="hero" style="margin-top:6px">${ring}<div class="eyebrow">Organisers only</div><h1>Admin</h1><p>Sign in to enter results and manage teams, players and fixtures.</p></div>
    <form class="card pad form-grid" id="login" style="margin-top:12px"><div class="fld"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div><button class="btn block" type="submit">Sign in</button></form>`;
  const tabs = [['results', 'Results'], ['fixtures', 'Fixtures'], ['teams', 'Teams'], ['players', 'Players'], ['settings', 'Settings']];
  let body = '';
  if (adminTab === 'results') {
    const pending = D.fixtures.filter((f) => !done(f));
    const fin = D.fixtures.filter(done).slice().reverse();
    const item = (f) => `<div class="list-item" data-result="${f.id}"><div class="grow"><b>${esc(tName(f.home_id))} ${done(f) ? f.home_goals + '–' + f.away_goals : 'vs'} ${esc(tName(f.away_id))}</b><br><small>${esc(fmtDate(f.date))} · ${esc(f.slot || '')} · ${(D.eventsBy[f.id] || []).length} events</small></div><span class="badge ${done(f) ? 'ft' : ''}">${done(f) ? 'Edit' : 'Enter'}</span></div>`;
    body = `<div class="h-sec"><h2>Awaiting result</h2></div><div class="card">${pending.map(item).join('') || '<div class="empty">All results entered.</div>'}</div>
      <div class="h-sec"><h2>Completed</h2></div><div class="card">${fin.map(item).join('') || '<div class="empty">None yet.</div>'}</div>`;
  } else if (adminTab === 'fixtures') {
    body = `<div class="actions" style="margin:6px 0 12px"><button class="btn" data-newfixture>+ Add fixture</button></div><div class="card">${D.fixtures.map((f) => `<div class="list-item" data-fixture="${f.id}"><div class="grow"><b>${f.match_no ? '#' + f.match_no + ' ' : ''}${esc(tName(f.home_id))} vs ${esc(tName(f.away_id))}</b><br><small>${esc(fmtDate(f.date))} · ${esc(f.slot || '')} · ${esc(f.stage)} · ${esc(f.status)}</small></div><span class="chev">›</span></div>`).join('')}</div>`;
  } else if (adminTab === 'teams') {
    body = `<div class="actions" style="margin:6px 0 12px"><button class="btn" data-newteam>+ Add team</button></div><div class="card">${D.teams.map((t) => `<div class="list-item" data-team="${t.id}">${crest(t)}<div class="grow"><b>${esc(t.name)}</b><br><small>${D.players.filter((p) => p.team_id === t.id).length} players${t.captain ? ' · Capt. ' + esc(t.captain) : ''}</small></div><span class="chev">›</span></div>`).join('')}</div>`;
  } else if (adminTab === 'players') {
    const ps = D.players.slice().sort((a, b) => tName(a.team_id).localeCompare(tName(b.team_id)) || a.name.localeCompare(b.name));
    body = `<div class="actions" style="margin:6px 0 12px"><button class="btn" data-newplayer>+ Add player</button></div><div class="card">${ps.map((p) => `<div class="list-item" data-player="${p.id}">${crest(D.team[p.team_id], 'sm')}<div class="grow"><b>${esc(p.name)}</b><br><small>${esc(D.team[p.team_id]?.name || '⚠ No team set')}${p.seed_goals ? ` · ${p.seed_goals} sheet goals` : ''}</small></div><span class="chev">›</span></div>`).join('') || '<div class="empty">No players yet.</div>'}</div>`;
  } else {
    const s = D.settings;
    body = `<form class="card pad form-grid" id="settings">
      <div class="fld"><label>League name</label><input name="league_name" value="${esc(s.league_name || '')}" required></div>
      <div class="fld"><label>Notice banner (optional, shown on home)</label><input name="notice" value="${esc(s.notice || '')}" placeholder="e.g. Kick-off moved to 3pm this Sunday"></div>
      <div class="fld"><label>Format info (one "Label: value" per line)</label><textarea name="info" rows="8">${esc(Object.entries(s.info || {}).map(([k, v]) => `${k}: ${v}`).join('\n'))}</textarea></div>
      <div class="fld"><label>Rules (one "Rule: details" per line)</label><textarea name="rules" rows="10">${esc((s.rules || []).map((r) => `${r.rule}: ${r.details}`).join('\n'))}</textarea></div>
      <button class="btn block">Save settings</button></form>
      <div class="sp"></div><button class="btn ghost block" data-logout>Sign out</button>`;
  }
  return `<div class="h-sec" style="margin-top:6px"><h2>Admin</h2><a href="#/">View site</a></div>
  <div class="tabs chips">${tabs.map(([k, l]) => `<a class="chip ${adminTab === k ? 'on' : ''}" href="#/admin/${k}">${l}</a>`).join('')}</div>${body}`;
};
function sheet(html, onMount) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
  document.body.appendChild(back);
  onMount && onMount(back.firstChild, () => back.remove());
}
const teamOpts = (sel) => D.teams.map((t) => `<option value="${t.id}" ${t.id == sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
async function saveAnd(action, data, close, msg = 'Saved') {
  try { await api(action, data); await load(); close && close(); route(); toast(msg); } catch (e) { toast(e.message, true); }
}
function editTeam(t = {}) {
  sheet(`<h3>${t.id ? 'Edit team' : 'New team'}</h3><form class="form-grid">
    <div class="fld"><label>Name</label><input name="name" value="${esc(t.name || '')}" required></div>
    <div class="row2"><div class="fld"><label>Short code</label><input name="short" maxlength="4" value="${esc(t.short || '')}"></div><div class="fld"><label>Colour</label><input name="color" type="color" value="${esc(t.color || '#00b8ff')}"></div></div>
    <div class="fld"><label>Captain</label><input name="captain" value="${esc(t.captain || '')}"></div>
    <div class="actions"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button>${t.id ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}</div></form>`,
  (el, close) => {
    $('form', el).onsubmit = (e) => { e.preventDefault(); saveAnd('saveTeam', { id: t.id, ...Object.fromEntries(new FormData(e.target)) }, close); };
    const d = $('[data-del]', el); if (d) d.onclick = () => confirm(`Delete ${t.name}? Its fixtures are deleted too.`) && saveAnd('deleteTeam', { id: t.id }, close, 'Deleted');
  });
}
function editPlayer(p = {}) {
  sheet(`<h3>${p.id ? 'Edit player' : 'New player'}</h3><form class="form-grid">
    <div class="fld"><label>Name</label><input name="name" value="${esc(p.name || '')}" required></div>
    <div class="fld"><label>Team</label><select name="team_id"><option value="">— No team —</option>${teamOpts(p.team_id)}</select></div>
    <div class="row2"><div class="fld"><label>Position</label><select name="position">${['', 'GK', 'DEF', 'MID', 'FWD'].map((x) => `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="fld"><label>Shirt no.</label><input name="number" type="number" inputmode="numeric" value="${esc(p.number ?? '')}"></div></div>
    <div class="row2"><div class="fld"><label>Extra goals (not from match entry)</label><input name="seed_goals" type="number" inputmode="numeric" min="0" value="${esc(p.seed_goals ?? 0)}"></div><div class="fld"><label>Extra assists</label><input name="seed_assists" type="number" inputmode="numeric" min="0" value="${esc(p.seed_assists ?? 0)}"></div></div>
    <div class="fld"><label>Notes</label><input name="notes" value="${esc(p.notes || '')}"></div>
    <div class="actions"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button>${p.id ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}</div></form>
    <p class="note">Goals entered with match results are counted automatically. Use "extra goals" only for goals that are not linked to a match (like the Matchday 1 sheet totals).</p>`,
  (el, close) => {
    $('form', el).onsubmit = (e) => { e.preventDefault(); saveAnd('savePlayer', { id: p.id, ...Object.fromEntries(new FormData(e.target)) }, close); };
    const d = $('[data-del]', el); if (d) d.onclick = () => confirm(`Delete ${p.name}?`) && saveAnd('deletePlayer', { id: p.id }, close, 'Deleted');
  });
}
function editFixture(f = { status: 'upcoming', stage: 'league' }) {
  sheet(`<h3>${f.id ? 'Edit fixture' : 'New fixture'}</h3><form class="form-grid">
    <div class="row2"><div class="fld"><label>Home</label><select name="home_id" required><option value="">Pick…</option>${teamOpts(f.home_id)}</select></div><div class="fld"><label>Away</label><select name="away_id" required><option value="">Pick…</option>${teamOpts(f.away_id)}</select></div></div>
    <div class="row2"><div class="fld"><label>Date</label><input name="date" type="date" value="${esc(f.date || '')}"></div><div class="fld"><label>Kick-off slot</label><input name="slot" value="${esc(f.slot || '')}" placeholder="2:00–2:35 PM"></div></div>
    <div class="row3"><div class="fld"><label>Match #</label><input name="match_no" type="number" inputmode="numeric" value="${esc(f.match_no ?? '')}"></div>
      <div class="fld"><label>Stage</label><select name="stage">${[['league', 'League'], ['SF1', 'Semi 1'], ['SF2', 'Semi 2'], ['F', 'Final'], ['3P', '3rd place']].map(([v, l]) => `<option value="${v}" ${f.stage === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="fld"><label>Status</label><select name="status">${['upcoming', 'live', 'completed', 'postponed', 'cancelled'].map((x) => `<option ${f.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div class="fld"><label>Notes</label><input name="notes" value="${esc(f.notes || '')}"></div>
    <div class="actions"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button>${f.id ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}</div></form>`,
  (el, close) => {
    $('form', el).onsubmit = (e) => { e.preventDefault(); saveAnd('saveFixture', { id: f.id, ...Object.fromEntries(new FormData(e.target)) }, close); };
    const d = $('[data-del]', el); if (d) d.onclick = () => confirm('Delete this fixture and its events?') && saveAnd('deleteFixture', { id: f.id }, close, 'Deleted');
  });
}
function editResult(f) {
  const evs = (D.eventsBy[f.id] || []).map((e) => ({ ...e }));
  const sideOf = (e) => (e.team_id === f.away_id ? 'a' : 'h');
  const playerOpts = (side, sel) => {
    const tid = side === 'a' ? f.away_id : f.home_id;
    const mine = D.players.filter((p) => p.team_id === tid), loose = D.players.filter((p) => !p.team_id), other = D.players.filter((p) => p.team_id && p.team_id !== tid);
    const o = (arr) => arr.map((p) => `<option value="${p.id}" ${p.id == sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    return `<option value="">Player…</option>${mine.length ? `<optgroup label="${esc(tName(tid))}">${o(mine)}</optgroup>` : ''}${loose.length ? `<optgroup label="No team set">${o(loose)}</optgroup>` : ''}${other.length ? `<optgroup label="Other teams">${o(other)}</optgroup>` : ''}<option value="__new">+ New player…</option>`;
  };
  const evRow = (e, i) => `<div class="card pad" style="margin-top:8px;padding:10px" data-i="${i}">
    <div class="row2"><select data-k="side"><option value="h" ${sideOf(e) === 'h' ? 'selected' : ''}>${esc(tName(f.home_id))}</option><option value="a" ${sideOf(e) === 'a' ? 'selected' : ''}>${esc(tName(f.away_id))}</option></select>
    <select data-k="type">${[['goal', '⚽ Goal'], ['penalty', '⚽ Penalty'], ['own_goal', '⚽ Own goal'], ['assist', '🅰️ Assist'], ['yellow', '🟨 Yellow'], ['red', '🟥 Red']].map(([v, l]) => `<option value="${v}" ${e.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="evrow" style="grid-template-columns:1fr 70px 44px"><select data-k="player_id">${playerOpts(sideOf(e), e.player_id)}</select><input data-k="minute" type="number" inputmode="numeric" placeholder="Min" value="${esc(e.minute ?? '')}"><button type="button" class="x" data-rm aria-label="Remove">×</button></div></div>`;
  sheet(`<h3>Result</h3><form class="form-grid" id="resform">
    <div class="scorebox"><div class="fld"><label>${esc(tName(f.home_id))}</label><input name="home_goals" type="number" inputmode="numeric" min="0" value="${esc(f.home_goals ?? '')}"></div><div class="vs">–</div><div class="fld"><label>${esc(tName(f.away_id))}</label><input name="away_goals" type="number" inputmode="numeric" min="0" value="${esc(f.away_goals ?? '')}"></div></div>
    <div class="fld"><label>Status</label><select name="status">${['completed', 'live', 'upcoming', 'postponed', 'cancelled'].map((x) => `<option ${(done(f) ? 'completed' : f.status === 'upcoming' ? 'completed' : f.status) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div><div class="fld"><label>Goals, assists &amp; cards</label></div><div id="evs"></div><div class="sp"></div>
    <div class="actions"><button type="button" class="btn ghost sm" data-add="goal">+ Goal</button><button type="button" class="btn ghost sm" data-add="assist">+ Assist</button><button type="button" class="btn ghost sm" data-add="yellow">+ Card</button></div></div>
    <p class="note" id="chk"></p>
    <div class="actions"><button class="btn">Save result</button><button type="button" class="btn ghost" data-close>Cancel</button>${done(f) || f.status === 'live' ? '<button type="button" class="btn danger" data-clear>Clear result</button>' : ''}</div></form>`,
  (el, close) => {
    const box = $('#evs', el), form = $('#resform', el);
    const read = () => [...box.children].forEach((row) => { const e = evs[row.dataset.i]; row.querySelectorAll('[data-k]').forEach((inp) => { const k = inp.dataset.k; if (k === 'side') e.team_id = inp.value === 'a' ? f.away_id : f.home_id; else e[k] = inp.value; }); });
    const check = () => { read(); const hg = +form.home_goals.value || 0, ag = +form.away_goals.value || 0; const g = (side) => evs.filter((e) => (['goal', 'penalty'].includes(e.type) && e.team_id === side) || (e.type === 'own_goal' && e.team_id !== side)).length;
      const gh = g(f.home_id), ga = g(f.away_id); $('#chk', el).textContent = evs.length && (gh !== hg || ga !== ag) ? `Heads up: scorers entered add up to ${gh}–${ga}, score is ${hg}–${ag}. Own goals are listed under the team that conceded the goal.` : ''; };
    const draw = () => { box.innerHTML = evs.map(evRow).join(''); check(); };
    draw();
    box.addEventListener('change', async (e) => {
      const row = e.target.closest('[data-i]');
      if (e.target.dataset.k === 'side') { read(); draw(); return; }
      if (e.target.dataset.k === 'player_id' && e.target.value === '__new') {
        read();
        const ev = evs[row.dataset.i];
        const name = prompt('New player name');
        if (!name) { ev.player_id = ''; draw(); return; }
        try { const r = await api('savePlayer', { name, team_id: ev.team_id }); await load(); ev.player_id = r.id; draw(); toast('Player added'); } catch (err) { toast(err.message, true); }
        return;
      }
      check();
    });
    box.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { read(); evs.splice(+e.target.closest('[data-i]').dataset.i, 1); draw(); } });
    form.addEventListener('input', (e) => { if (e.target.name) check(); });
    el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { read(); evs.push({ type: b.dataset.add, team_id: f.home_id, player_id: '', minute: '' }); draw(); }));
    form.onsubmit = (e) => { e.preventDefault(); read(); const fd = Object.fromEntries(new FormData(form));
      saveAnd('saveResult', { id: f.id, ...fd, events: evs.map((x) => ({ type: x.type, team_id: x.team_id, player_id: x.player_id || null, minute: x.minute })) }, close, 'Result saved · table updated'); };
    const c = $('[data-clear]', el); if (c) c.onclick = () => confirm('Clear the score and all events for this match?') && saveAnd('clearResult', { id: f.id }, close, 'Result cleared');
  });
}
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'login') {
    e.preventDefault();
    const b = $('button', e.target); b.disabled = true;
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Sign-in failed');
      localStorage.setItem(TOKEN_KEY, j.token); toast('Signed in'); route();
    } catch (err) { toast(err.message, true); b.disabled = false; }
  }
  if (e.target.id === 'settings') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const pairs = (txt) => txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });
    saveAnd('saveSettings', { league_name: fd.get('league_name'), notice: fd.get('notice') || '', info: pairs(fd.get('info')), rules: pairs(fd.get('rules')).map(([rule, details]) => ({ rule, details })) });
  }
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-result],[data-fixture],[data-team],[data-player],[data-newteam],[data-newplayer],[data-newfixture],[data-logout]');
  if (!t || !location.hash.startsWith('#/admin')) return;
  const d = t.dataset;
  if (d.result) editResult(D.fixtures.find((f) => f.id == d.result));
  else if (d.fixture) editFixture(D.fixtures.find((f) => f.id == d.fixture));
  else if (d.team) editTeam(D.team[d.team]);
  else if (d.player) editPlayer(D.player[d.player]);
  else if ('newteam' in d) editTeam();
  else if ('newplayer' in d) editPlayer();
  else if ('newfixture' in d) editFixture();
  else if ('logout' in d) { localStorage.removeItem(TOKEN_KEY); route(); }
});

/* ---------- router ---------- */
function route() {
  const [, view = '', arg] = (location.hash || '#/').split('/');
  const fn = V[view || 'home'] || V.home;
  const navKey = { '': 'home', home: 'home', matches: 'matches', match: 'matches', table: 'table', stats: 'stats', player: 'stats', teams: 'teams', team: 'teams' }[view];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === navKey));
  try { app.innerHTML = fn(arg ? decodeURIComponent(arg) : undefined); } catch (err) { console.error(err); app.innerHTML = '<div class="card empty">Something went wrong showing this page.</div>'; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
load().then(route).catch(() => { app.innerHTML = '<div class="card empty">Could not load league data. Pull down to refresh.</div>'; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && D && !location.hash.startsWith('#/admin')) load().then(route).catch(() => {}); });

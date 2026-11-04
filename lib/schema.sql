CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS teams (
  id serial PRIMARY KEY, name text NOT NULL UNIQUE, short text, color text, captain text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS players (
  id serial PRIMARY KEY, name text NOT NULL, team_id int REFERENCES teams(id) ON DELETE SET NULL,
  position text, number int, seed_goals int NOT NULL DEFAULT 0, seed_assists int NOT NULL DEFAULT 0,
  seed_apps int NOT NULL DEFAULT 0, notes text, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS fixtures (
  id serial PRIMARY KEY, match_no int, date date, slot text, stage text NOT NULL DEFAULT 'league',
  home_id int REFERENCES teams(id) ON DELETE CASCADE, away_id int REFERENCES teams(id) ON DELETE CASCADE,
  home_goals int, away_goals int, status text NOT NULL DEFAULT 'upcoming', notes text, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS events (
  id serial PRIMARY KEY, fixture_id int NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id int REFERENCES teams(id) ON DELETE SET NULL, player_id int REFERENCES players(id) ON DELETE SET NULL,
  type text NOT NULL, minute int, note text);
CREATE INDEX IF NOT EXISTS events_fixture ON events(fixture_id);

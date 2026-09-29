-- ============================================================================
-- Bot memory — migration 005: thin inter-bot bus (P3.B1–B4)
-- A2A vocabulary only (presence / message / task / wake) — NOT full A2A wire.
-- Additive; v1.sql untouched. Target: Neon branch main (br-wandering-queen-b8sx7y0a).
--
-- Presence table matches PR #21 daemon_presence shape (IF NOT EXISTS) so that
-- branch can rebase/reuse without duplicating. sync_state + replica echo-guard
-- stay on #21 (X1/X2 sync) — not claimed here.
-- ============================================================================

-- Registry / presence (P3.B1) — one row per bot or daemon node.
CREATE TABLE IF NOT EXISTS daemon_presence (
  node       TEXT PRIMARY KEY,               -- e.g. 'daemon-primary', 'grok-coder-01'
  last_beat  TIMESTAMPTZ NOT NULL DEFAULT now(),
  version    TEXT,                            -- build/version string
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS daemon_presence_last_beat
  ON daemon_presence (last_beat DESC);

-- Contracted messages / handoffs (P3.B2) — fail closed on missing evidence.
CREATE TABLE IF NOT EXISTS bus_messages (
  id           TEXT PRIMARY KEY,
  msg_type     TEXT NOT NULL DEFAULT 'message.send'
                 CHECK (msg_type = 'message.send'),
  from_bot     TEXT NOT NULL,
  to_bot       TEXT NOT NULL,
  ask          TEXT NOT NULL,
  evidence     JSONB NOT NULL DEFAULT '[]'::jsonb,
  memory_refs  TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN (
                   'submitted','working','input-required',
                   'completed','failed','canceled'
                 )),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bus_messages_to_status
  ON bus_messages (to_bot, status, created_at DESC);
CREATE INDEX IF NOT EXISTS bus_messages_from
  ON bus_messages (from_bot, created_at DESC);

CREATE OR REPLACE FUNCTION bus_messages_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS bus_messages_updated_at ON bus_messages;
CREATE TRIGGER bus_messages_updated_at
  BEFORE UPDATE ON bus_messages
  FOR EACH ROW EXECUTE FUNCTION bus_messages_touch_updated_at();

-- Minimal tasks (P3.B3) — ids + status only; no workflow engine.
-- Also mirrored onto outbox (004) by the bus module for graph consumers.
CREATE TABLE IF NOT EXISTS bus_tasks (
  id           TEXT PRIMARY KEY,
  from_bot     TEXT NOT NULL,
  to_bot       TEXT,
  ask          TEXT NOT NULL,
  evidence     JSONB NOT NULL DEFAULT '[]'::jsonb,
  memory_refs  TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN (
                   'submitted','working','input-required',
                   'completed','failed','canceled'
                 )),
  result       JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_id       TEXT,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bus_tasks_status
  ON bus_tasks (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS bus_tasks_to
  ON bus_tasks (to_bot, status) WHERE to_bot IS NOT NULL;
CREATE INDEX IF NOT EXISTS bus_tasks_run
  ON bus_tasks (run_id) WHERE run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION bus_tasks_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS bus_tasks_updated_at ON bus_tasks;
CREATE TRIGGER bus_tasks_updated_at
  BEFORE UPDATE ON bus_tasks
  FOR EACH ROW EXECUTE FUNCTION bus_tasks_touch_updated_at();

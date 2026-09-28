-- Bot memory P0 schema (PLAN-bot-memory-graph-v2 §5)
-- Apply on a Neon BRANCH, never production main, until P1 gate.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  scope         text NOT NULL,
  namespace     text NOT NULL,
  bot_id        text,
  text          text NOT NULL,
  text_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  embedding     halfvec(384),
  embedding_model text,
  importance    smallint,
  strength      real,
  status        text NOT NULL DEFAULT 'staged',
  pinned        boolean DEFAULT false,
  source_session text NOT NULL,
  trajectory_ref text,
  author        text NOT NULL,
  origin        text NOT NULL,
  valid_from    timestamptz DEFAULT now(),
  valid_to      timestamptz,
  superseded_by uuid REFERENCES memories(id),
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT memories_type_check CHECK (type IN (
    'working','episodic','semantic','procedural','goals','reflective'
  )),
  CONSTRAINT memories_scope_check CHECK (scope IN ('global','node_local','edge'))
);

CREATE INDEX IF NOT EXISTS memories_embedding_hnsw
  ON memories USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 128);
CREATE INDEX IF NOT EXISTS memories_text_tsv_gin ON memories USING gin (text_tsv);
CREATE INDEX IF NOT EXISTS memories_ns_status_created
  ON memories (namespace, status, created_at);

CREATE TABLE IF NOT EXISTS sync_log (
  seq       bigserial PRIMARY KEY,
  memory_id uuid NOT NULL REFERENCES memories(id),
  op        text NOT NULL,
  ts        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz DEFAULT now()
);

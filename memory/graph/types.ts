/** P1.G1 graph types (FINAL-PLAN-V2.md §11). */

export type OutboxStatus = 'pending' | 'claimed' | 'done' | 'dead';

export type BlackboardRow = {
  id: number;
  run_id: string;
  key: string;
  value: unknown;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OutboxRow = {
  id: number;
  topic: string;
  payload: unknown;
  trace_id: string | null;
  from_node: string | null;
  to_node: string | null;
  run_id: string | null;
  status: OutboxStatus;
  created_at: string;
  claimed_at: string | null;
  done_at: string | null;
};

export type NodeDef = {
  node_id: string;
  role?: string;
  capabilities?: string[];
  /** Topics this node may claim from the outbox. */
  topics?: string[];
};

export type DispatchResult = {
  handled: boolean;
  node_id?: string;
  outbox_id?: number;
  detail?: string;
};

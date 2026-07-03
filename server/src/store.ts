import type { SessionState } from "./types.js";

// In-memory session store. Single-process; good enough for an enterprise
// demo / single-operator tool. Swap for Redis if you need multi-instance.
interface StoredSession {
  state: SessionState;
  // populated only for live sessions; opaque browser automation handle
  driver?: unknown;
}

const sessions = new Map<string, StoredSession>();

let counter = 0;

export function newSessionId(): string {
  counter += 1;
  // deterministic-ish id without Date.now/Math.random reliance in hot paths
  const stamp = Date.now().toString(36);
  return `s_${stamp}_${counter.toString(36)}`;
}

export function saveSession(state: SessionState, driver?: unknown): void {
  const existing = sessions.get(state.id);
  sessions.set(state.id, { state, driver: driver ?? existing?.driver });
}

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id)?.state;
}

export function getDriver(id: string): unknown | undefined {
  return sessions.get(id)?.driver;
}

export function setDriver(id: string, driver: unknown): void {
  const existing = sessions.get(id);
  if (existing) existing.driver = driver;
}

export function listSessions(): SessionState[] {
  return Array.from(sessions.values()).map((s) => s.state);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

// --- Batches (parallel multi-run execution) --------------------------------
export interface StoredBatch {
  id: string;
  runIds: string[];
  createdAt: number;
}

const batches = new Map<string, StoredBatch>();
let batchCounter = 0;

export function newBatchId(): string {
  batchCounter += 1;
  return `b_${Date.now().toString(36)}_${batchCounter.toString(36)}`;
}

export function saveBatch(batch: StoredBatch): void {
  batches.set(batch.id, batch);
}

export function getBatch(id: string): StoredBatch | undefined {
  return batches.get(id);
}

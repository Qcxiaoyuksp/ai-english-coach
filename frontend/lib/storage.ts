// ============================================================
// storage.ts — Local Persistence Layer
// ============================================================
// Centralizes all client-side persistence for the app:
//   - practice sessions (conversation logs)
//   - assessment reports
//   - user-defined custom scenarios
//
// Backed by localStorage (synchronous, SSR-safe). Conversation
// data is plain text and well within localStorage limits, which
// keeps the existing synchronous page-loading patterns intact.
// The API is intentionally storage-agnostic so it can be swapped
// to IndexedDB later without changing call sites.
// ============================================================

import { Session, Report, Scenario } from '@/types';
import { BUILT_IN_SCENARIOS } from '@/lib/scenarios';

const SESSIONS_KEY = 'practice-sessions';
const REPORTS_KEY = 'practice-reports';
const CUSTOM_SCENARIOS_KEY = 'custom-scenarios';

// ─── Low-level helpers (SSR-safe) ────────────────────────────

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[storage] Failed to write "${key}":`, err);
  }
}

/** Upsert an item into an array by a key field, returning the new array. */
function upsertBy<T>(items: T[], item: T, keyOf: (i: T) => string): T[] {
  const id = keyOf(item);
  const idx = items.findIndex((i) => keyOf(i) === id);
  if (idx === -1) return [...items, item];
  const next = items.slice();
  next[idx] = item;
  return next;
}

// ─── Sessions ────────────────────────────────────────────────

/** All practice sessions, newest first. */
export function listSessions(): Session[] {
  return readArray<Session>(SESSIONS_KEY).sort(
    (a, b) => b.startTime - a.startTime
  );
}

export function getSession(id: string): Session | null {
  return readArray<Session>(SESSIONS_KEY).find((s) => s.id === id) ?? null;
}

/** Insert or update a session (matched by id). */
export function saveSession(session: Session): void {
  const next = upsertBy(
    readArray<Session>(SESSIONS_KEY),
    session,
    (s) => s.id
  );
  writeArray(SESSIONS_KEY, next);
}

export function deleteSession(id: string): void {
  writeArray(
    SESSIONS_KEY,
    readArray<Session>(SESSIONS_KEY).filter((s) => s.id !== id)
  );
}

// ─── Reports ─────────────────────────────────────────────────

export function listReports(): Report[] {
  return readArray<Report>(REPORTS_KEY).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

/** Find the report associated with a given session. */
export function getReportBySession(sessionId: string): Report | null {
  return (
    readArray<Report>(REPORTS_KEY).find((r) => r.sessionId === sessionId) ??
    null
  );
}

/** Insert or update a report (matched by sessionId — one report per session). */
export function saveReport(report: Report): void {
  const next = upsertBy(
    readArray<Report>(REPORTS_KEY),
    report,
    (r) => r.sessionId
  );
  writeArray(REPORTS_KEY, next);
}

// ─── Custom Scenarios ────────────────────────────────────────

export function listCustomScenarios(): Scenario[] {
  return readArray<Scenario>(CUSTOM_SCENARIOS_KEY);
}

export function getCustomScenario(id: string): Scenario | null {
  return (
    readArray<Scenario>(CUSTOM_SCENARIOS_KEY).find((s) => s.id === id) ?? null
  );
}

export function saveCustomScenario(scenario: Scenario): void {
  const next = upsertBy(
    readArray<Scenario>(CUSTOM_SCENARIOS_KEY),
    scenario,
    (s) => s.id
  );
  writeArray(CUSTOM_SCENARIOS_KEY, next);
}

export function deleteCustomScenario(id: string): void {
  writeArray(
    CUSTOM_SCENARIOS_KEY,
    readArray<Scenario>(CUSTOM_SCENARIOS_KEY).filter((s) => s.id !== id)
  );
}

// ─── Convenience ─────────────────────────────────────────────

/** Resolve a scenario id against built-in scenarios first, then custom ones. */
export function resolveScenario(id: string): Scenario | null {
  const builtIn = BUILT_IN_SCENARIOS.find((s) => s.id === id);
  if (builtIn) return builtIn;
  return getCustomScenario(id);
}

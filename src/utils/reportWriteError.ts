import { Alert } from 'react-native';
import { GameUpdateRejected } from './updateGame';

/**
 * Making failed game writes *visible*.
 *
 * Every mutation goes through an RPC (`apply_game_update`, `submit_answer`,
 * `use_fifty`, `close_review`), and a failing RPC rejects the promise. In an
 * `onPress` handler that `await`s without catching, that rejection is unhandled:
 * React Native swallows it and the button simply appears dead — with no error
 * anywhere the player, or a developer watching the screen, can see.
 *
 * That is not hypothetical. The client shipped calls to `apply_game_update`
 * before `0004_validated_writes.sql` had been applied; PostgREST answered
 * `PGRST202` (no such function) on *every* mutation, and the whole app presented
 * as "the buttons don't work". See PROJECT_STATUS.md §4.2 C3.
 *
 * Rule of thumb for which helper to use:
 *  - `runGameWrite` — a write the player asked for. Alerts on failure.
 *  - `logWriteError` — an automatic/background write (timer auto-advance, the
 *    presence janitor) where every client fires the same thing and another one
 *    will usually cover it. Logs in dev, never alerts, so N clients hitting the
 *    same failure don't stack N dialogs on every tick.
 */

/**
 * Run a mutation, reporting a failure to the player instead of letting it vanish.
 *
 * `ok` is false when the call threw — the caller should roll back any optimistic
 * local state it set before the write (a selected answer, an activated help),
 * otherwise the player is left locked out of an action that never happened.
 * `value` carries the resolved value on success, for callers that need it (e.g.
 * `useFifty`'s eliminated options).
 *
 * Deliberately not a `{ ok: true; value: T } | { ok: false }` union: the Jest
 * transform compiles with `strict: false` (see the `jest` block in
 * package.json), and boolean-literal discriminants do not narrow without
 * `strictNullChecks` — the same reason `updateGame`'s `ApplyResult` is split.
 */
export async function runGameWrite<T>(
  action: string,
  fn: () => Promise<T>,
): Promise<{ ok: boolean; value?: T }> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (e: unknown) {
    reportWriteError(action, e);
    return { ok: false };
  }
}

/** Alert the player about a failed write. For use from a manual `catch`. */
export function reportWriteError(action: string, e: unknown): void {
  logWriteError(action, e);
  Alert.alert(`${action} απέτυχε`, describeWriteError(e));
}

/**
 * Record a failed write without interrupting the player. For automatic writes
 * that other clients also attempt — alerting there would fire on every device,
 * and on every timer tick that retries.
 */
export function logWriteError(action: string, e: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.error(`[${action}] game write failed:`, e);
  }
}

/** Greek, player-facing explanation of a failed write. */
export function describeWriteError(e: unknown): string {
  // The server refused the diff as illegal for this player — a client bug or a
  // stale build, never something a retry fixes.
  if (e instanceof GameUpdateRejected) {
    return 'Η ενέργεια απορρίφθηκε από τον διακομιστή. Ίσως η εφαρμογή χρειάζεται ενημέρωση.';
  }

  const code = (e as { code?: string } | null)?.code;

  // PGRST202 = the RPC does not exist in this database, i.e. the client build is
  // ahead of the applied migrations (see PROJECT_STATUS.md §1.7).
  if (code === 'PGRST202') {
    return 'Ο διακομιστής δεν υποστηρίζει αυτή την ενέργεια. Ενημέρωσε την εφαρμογή.';
  }
  // 42501 = RLS / permission refusal.
  if (code === '42501') {
    return 'Δεν έχεις δικαίωμα για αυτή την ενέργεια.';
  }

  const message = e instanceof Error ? e.message : '';
  if (/network|fetch|timeout/i.test(message)) {
    return 'Πρόβλημα σύνδεσης. Έλεγξε το ίντερνετ και δοκίμασε ξανά.';
  }

  return 'Κάτι πήγε στραβά. Δοκίμασε ξανά.';
}

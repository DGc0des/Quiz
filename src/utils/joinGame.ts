import { supabase } from '../config/supabase';
import { primeGame } from '../hooks/useGame';
import { Game } from '../types';

/**
 * Reasons the `join_game` RPC can refuse a join. Mirrors the values returned by
 * `supabase/migrations/0002_membership_scoped_rls.sql` — keep the two in step.
 */
export type JoinFailureReason = 'not_found' | 'started' | 'full' | 'invalid_name';

export type JoinResult =
  | { ok: true; game: Game }
  | { ok: false; reason: JoinFailureReason };

/** Greek message shown for each refusal. */
export const JOIN_ERROR_MESSAGES: Record<JoinFailureReason, string> = {
  not_found: 'Το παιχνίδι δεν βρέθηκε.',
  started: 'Το παιχνίδι έχει ήδη ξεκινήσει.',
  full: 'Το παιχνίδι είναι γεμάτο.',
  invalid_name: 'Εισάγετε το όνομά σας.',
};

/**
 * Join a game by code.
 *
 * This cannot go through `updateGame`: that helper reads the row first, and the
 * membership-scoped SELECT policy hides a game from anyone who is not already in
 * it. The `join_game` RPC is `SECURITY DEFINER`, so it can look the game up,
 * validate it, and add the caller in one locked transaction — which is also
 * atomic in a way the client's optimistic-concurrency loop never was.
 *
 * The caller is identified by `auth.uid()` server-side; `playerId` is never sent.
 */
export async function joinGame(code: string, name: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_game', {
    p_code: code,
    p_name: name,
  });
  if (error) throw error;

  const result = data as
    | { ok: true; game: Game }
    | { ok: false; reason: JoinFailureReason };

  if (result.ok) {
    // Seed the shared cache so the Lobby renders instantly, the same way
    // `updateGame` primes it after a successful write.
    primeGame(result.game.id, result.game);
  }
  return result;
}

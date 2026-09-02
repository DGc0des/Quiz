import { supabase } from '../config/supabase';
import { primeGame } from '../hooks/useGame';
import { Game, GameMode } from '../types';

/**
 * Wrappers for the three game RPCs that need the answer key, and therefore
 * cannot run on the client (see `0006_authoritative_scoring.sql`).
 *
 * Everything else still goes through `updateGame`. These follow the same shape
 * as `joinGame`: call, prime the shared cache on success so the status-watching
 * effects fire without waiting for the realtime echo, and let the caller decide
 * what to do about a refusal.
 */

/** Refusals these RPCs can return. Mirrors the `reason` values in 0006 + 0007. */
export type GameRpcReason =
  | 'not_found'
  | 'not_member'
  | 'wrong_status'
  | 'no_turn'
  | 'unknown_question'
  | 'bad_steal_target'
  | 'help_already_used'
  | 'not_a_choice_question'
  | 'unresolved_round'
  | 'empty_turn_order'
  // 0007 (team mode)
  | 'bad_mode'
  | 'not_host'
  | 'not_in_lobby'
  | 'uneven_teams'
  | 'not_team_mode'
  | 'leader_only';

type RpcOk<T> = { ok: true } & T;
type RpcFail = { ok: false; reason: GameRpcReason };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<RpcOk<T> | RpcFail> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;

  const result = data as RpcOk<T & { game?: Game }> | RpcFail;
  const success = result as { ok: boolean; game?: Game };
  if (success.ok && success.game) {
    primeGame(success.game.id, success.game);
  }
  return result;
}

/**
 * Submit this player's answer. Covers all four cases — a chosen option, a typed
 * number, a steal, and the timer running out with nothing selected.
 *
 * `isCorrect` is deliberately absent: the server decides it. When this is the
 * last answer of the round the server also resolves and reveals the round, so
 * the returned game may already be in `reviewing`.
 */
export function submitAnswer(
  gameId: string,
  answer: { index?: number | null; value?: number | null; stolenFrom?: string },
) {
  return call<{ game: Game }>('submit_answer', {
    p_game_id: gameId,
    p_answer_index: answer.index ?? null,
    p_answer_value: answer.value ?? null,
    p_stolen_from: answer.stolenFrom ?? null,
  });
}

/**
 * Nudge the server to close the round if every remaining player has answered.
 *
 * Normally the last answer triggers that flip inside `submitAnswer`. This covers
 * the case where the round becomes complete without a new answer — a player
 * leaves mid-question and the ones still there have all answered. The server
 * ignores the payload for a caller who has already answered, so this is exactly
 * a repeat submission.
 */
export function ensureRoundAdvanced(gameId: string) {
  return submitAnswer(gameId, {});
}

/**
 * Spend 50/50. Returns the two option indices to hide — the server picks them,
 * since choosing two *wrong* options requires knowing the right one. Spending
 * and recording happen in one transaction, so a dropped response cannot lose
 * the help.
 */
export function useFifty(gameId: string) {
  return call<{ game: Game; hidden: number[] }>('use_fifty', { p_game_id: gameId });
}

/**
 * End the review phase: bank the points the server computed, then either finish
 * the game or open the next turn. Called by the host's button and by any client
 * once the review timer expires; concurrent calls are safe.
 */
export function closeReview(gameId: string) {
  return call<{ game: Game }>('close_review', { p_game_id: gameId });
}

/**
 * Host-only: switch the lobby between solo and team mode.
 *
 * Refused with `uneven_teams` if the lobby cannot be split into two equal sides
 * of at least two — the button is disabled for that, but players join and leave
 * while the host is deciding, so the server checks too.
 */
export function setGameMode(gameId: string, mode: GameMode) {
  return call<{ game: Game }>('set_game_mode', {
    p_game_id: gameId,
    p_mode: mode,
  });
}

/**
 * Host-only: split the lobby into two sides and start.
 *
 * The team equivalent of the solo start, which posts a shuffled `turnOrder`
 * through `updateGame`. Teams cannot work that way — the split decides who
 * holds the leader's power, so the draw happens server-side where a client
 * cannot deal itself the deciding vote.
 */
export function startTeamGame(gameId: string) {
  return call<{ game: Game }>('start_team_game', { p_game_id: gameId });
}

import { supabase } from '../config/supabase';
import { primeGame } from '../hooks/useGame';
import { Game } from '../types';

const MAX_ATTEMPTS = 8;

/**
 * Shape returned by the `apply_game_update` RPC (0004_validated_writes.sql).
 *
 * Split into named halves rather than one union discriminated on `ok`: the Jest
 * transform compiles with `strict: false` (see the `jest` block in
 * package.json), and boolean-literal discriminants do not narrow without
 * `strictNullChecks`. Narrowing on the string `reason` works under both.
 */
type ApplySuccess = { ok: true; game: Game };
type ApplyFailure =
  | { ok: false; reason: 'conflict'; game: Game }
  | { ok: false; reason: 'not_found' | 'not_member' }
  | { ok: false; reason: 'rejected'; detail: string };
type ApplyResult = ApplySuccess | ApplyFailure;

/**
 * Thrown when the server refuses a write as illegal for this player. That is
 * never a normal runtime condition — it means either a client bug (a mutator
 * producing a shape the rules don't cover) or a tampering attempt, so it is
 * surfaced loudly rather than swallowed as a no-op.
 */
export class GameUpdateRejected extends Error {
  constructor(public detail: string) {
    super(`Game update rejected by the server: ${detail}`);
    this.name = 'GameUpdateRejected';
  }
}

/** Fetch the current game document. Returns null if the row does not exist. */
export async function fetchGame(gameId: string): Promise<Game | null> {
  const { data: row, error } = await supabase
    .from('games')
    .select('data')
    .eq('id', gameId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no row found
    throw error;
  }
  return (row?.data as Game) ?? null;
}

/**
 * Optimistic-concurrency update of the single JSONB game document.
 *
 * The whole `data` blob is replaced on every write, so two clients writing from
 * a stale snapshot would clobber each other's changes (lost answers, helps,
 * score, player removals). Every write is therefore guarded on the document
 * `version`.
 *
 * The write itself goes through the `apply_game_update` RPC, not a direct
 * UPDATE — clients no longer hold UPDATE on `games` at all. The RPC takes the
 * row lock, checks the version, and validates that the diff is a legal move for
 * this player before committing (see `0004_validated_writes.sql`). Two
 * consequences worth knowing:
 *
 *  - A lost race comes back as `conflict` **with the current blob attached**, so
 *    a retry re-applies `mutate` without a second round-trip.
 *  - An illegal write throws `GameUpdateRejected` instead of silently doing
 *    nothing, so a mutator producing an unrecognised shape fails loudly.
 *
 * `mutate` must be pure — it may run several times — and may return `null` to
 * abort without writing (e.g. the action is no longer valid). The optional
 * `base` is a starting snapshot used to skip the first read on the happy path;
 * a stale `base` is safe because a lost race just supplies a fresh one.
 *
 * Returns the written game, the unchanged game when `mutate` aborts, or `null`
 * if the game does not exist (or the caller is no longer a member of it).
 */
export async function updateGame(
  gameId: string,
  mutate: (game: Game) => Game | null,
  opts: { base?: Game | null } = {},
): Promise<Game | null> {
  let base: Game | null | undefined = opts.base;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!base) base = await fetchGame(gameId);
    if (!base) return null; // game gone

    const baseVersion = base.version ?? 0;
    const next = mutate(base);
    if (!next) return base; // mutate aborted — nothing to write

    const nextData: Game = { ...next, version: baseVersion + 1 };

    const { data, error } = await supabase.rpc('apply_game_update', {
      p_game_id: gameId,
      p_next: nextData,
    });
    if (error) throw error;

    const result = data as ApplyResult;

    if (result.ok) {
      // Won the race — update the shared cache so every mounted screen sees the
      // new state immediately (the realtime echo may lag or skip the writer).
      primeGame(gameId, result.game);
      return result.game;
    }

    const failure = result as ApplyFailure;
    if (failure.reason === 'conflict') {
      base = failure.game; // server handed back the current state — re-apply
      continue;
    }
    if (failure.reason === 'rejected') {
      // Guarded so the node test environment (no __DEV__) stays quiet. Worth
      // logging: on a device this otherwise surfaces only as an action that
      // silently did nothing.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('apply_game_update rejected:', failure.detail);
      }
      throw new GameUpdateRejected(failure.detail);
    }
    return null; // not_found | not_member
  }

  throw new Error(`updateGame: too many write conflicts for ${gameId}`);
}

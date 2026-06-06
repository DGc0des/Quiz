import { supabase } from '../config/supabase';
import { Game } from '../types';

const MAX_ATTEMPTS = 8;

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
 * The whole `data` blob is replaced on every write, so two clients writing
 * from a stale snapshot would clobber each other's changes (lost answers,
 * helps, score, player removals). To prevent that, every write is guarded on
 * the document `version`: we read the current state, apply `mutate`, then write
 * only if the version is still what we read. If another client wrote in the
 * meantime the guarded write matches 0 rows; we re-read and retry.
 *
 * `mutate` must be pure — it may run several times — and may return `null` to
 * abort without writing (e.g. the action is no longer valid). The optional
 * `base` is a starting snapshot used to skip the first read on the happy path;
 * a stale `base` is safe because a lost race just triggers a fresh re-read.
 *
 * Returns the written game, the unchanged game when `mutate` aborts, or `null`
 * if the game does not exist.
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
    // Guard on the version we read. A row created before versioning existed has
    // no `version` field, so guard on NULL for its first write — this self-heals
    // legacy rows without an unguarded (clobber-prone) write.
    let query = supabase.from('games').update({ data: nextData }).eq('id', gameId);
    query =
      base.version === undefined || base.version === null
        ? query.is('data->>version', null)
        : query.eq('data->>version', String(base.version));
    const { data, error } = await query.select('data');

    if (error) throw error;
    if (data && data.length > 0) return nextData; // won the race

    base = undefined; // lost the race — re-read and retry
  }

  throw new Error(`updateGame: too many write conflicts for ${gameId}`);
}

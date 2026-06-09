import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import { Game } from '../types';

// Module-level caches shared across all screens for the same gameId.
// This prevents the brief blank-screen flash that occurs when navigating
// between game screens because each new screen mounts with cached data
// instantly instead of waiting for a fresh Supabase fetch.
const gameCache = new Map<string, Game>();
const subscribers = new Map<string, Set<(g: Game | null) => void>>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const fetchPromises = new Map<string, Promise<Game | null>>();

function notify(gameId: string, game: Game | null) {
  if (game) gameCache.set(gameId, game);
  subscribers.get(gameId)?.forEach((cb) => cb(game));
}

/**
 * Push a freshly-written game into the shared cache and notify every mounted
 * screen synchronously. Called by `updateGame` right after a successful write so
 * the writer's screens reflect the new `status` immediately — without waiting
 * for the Supabase realtime echo, which may be delayed or never delivered to the
 * client that did the write. This makes the status-driven navigation effects
 * fire reliably (and avoids landing a freshly-navigated screen on stale state).
 */
export function primeGame(gameId: string, game: Game) {
  notify(gameId, game);
}

function ensureChannel(gameId: string) {
  if (channels.has(gameId)) return;
  const channel = supabase
    .channel(`game-${gameId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => {
        notify(gameId, (payload.new as { data: Game }).data);
      }
    )
    .subscribe();
  channels.set(gameId, channel);
}

/**
 * Fetch the game once per gameId (shared across hook instances). Resolves with
 * the game, or `null` when the row does not exist; rejects on a real error.
 * On rejection the cached promise is cleared so a later mount can retry — a
 * failed fetch must not leave every screen stuck on a spinner forever.
 */
function ensureFetch(gameId: string): Promise<Game | null> {
  const existing = fetchPromises.get(gameId);
  if (existing) return existing;

  const p = (async () => {
    const { data: row, error } = await supabase
      .from('games')
      .select('data')
      .eq('id', gameId)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row
    const fresh = (row?.data as Game) ?? null;
    if (fresh) notify(gameId, fresh);
    return fresh;
  })();

  fetchPromises.set(gameId, p);
  // Allow a retry after a failed fetch (keep successful/empty results cached).
  p.catch(() => {
    if (fetchPromises.get(gameId) === p) fetchPromises.delete(gameId);
  });
  return p;
}

export function useGame(gameId: string) {
  const [game, setGame] = useState<Game | null>(() => gameCache.get(gameId) ?? null);
  const [loading, setLoading] = useState(!gameCache.has(gameId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let active = true;

    // Hydrate from cache synchronously on mount
    const cached = gameCache.get(gameId);
    if (cached) {
      setGame(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    // Subscribe this hook instance to realtime/cache updates
    if (!subscribers.has(gameId)) subscribers.set(gameId, new Set());
    const cb = (g: Game | null) => {
      setGame(g);
      setLoading(false);
      setError(null);
    };
    subscribers.get(gameId)!.add(cb);

    ensureChannel(gameId);
    // Resolve loading/error from the fetch itself so a missing row or a network
    // error never leaves `loading` stuck true (notify only fires for real data).
    ensureFetch(gameId)
      .then((fresh) => {
        if (!active) return;
        setLoading(false);
        setError(fresh ? null : 'not-found');
      })
      .catch((e: unknown) => {
        if (!active) return;
        setLoading(false);
        setError(e instanceof Error ? e.message : 'fetch-error');
      });

    return () => {
      active = false;
      subscribers.get(gameId)?.delete(cb);
      // Note: keep the channel alive across screen transitions so cached
      // data stays current even between screens. Cleanup happens when the
      // app unmounts (acceptable for a session-scoped game).
    };
  }, [gameId]);

  return { game, loading, error };
}

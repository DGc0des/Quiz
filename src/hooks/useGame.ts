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
const fetchPromises = new Map<string, Promise<void>>();

function notify(gameId: string, game: Game | null) {
  if (game) gameCache.set(gameId, game);
  subscribers.get(gameId)?.forEach((cb) => cb(game));
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

function ensureFetch(gameId: string) {
  if (fetchPromises.has(gameId)) return fetchPromises.get(gameId)!;
  const p = supabase
    .from('games')
    .select('data')
    .eq('id', gameId)
    .single()
    .then(({ data: row }) => {
      const fresh = (row?.data as Game) ?? null;
      if (fresh) notify(gameId, fresh);
    });
  fetchPromises.set(gameId, p);
  return p;
}

export function useGame(gameId: string) {
  const [game, setGame] = useState<Game | null>(() => gameCache.get(gameId) ?? null);
  const [loading, setLoading] = useState(!gameCache.has(gameId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    // Hydrate from cache synchronously on mount
    const cached = gameCache.get(gameId);
    if (cached) {
      setGame(cached);
      setLoading(false);
    }

    // Subscribe this hook instance to updates
    if (!subscribers.has(gameId)) subscribers.set(gameId, new Set());
    const cb = (g: Game | null) => {
      setGame(g);
      setLoading(false);
    };
    subscribers.get(gameId)!.add(cb);

    ensureChannel(gameId);
    ensureFetch(gameId).catch((e) => setError(e?.message ?? 'fetch error'));

    return () => {
      subscribers.get(gameId)?.delete(cb);
      // Note: keep the channel alive across screen transitions so cached
      // data stays current even between screens. Cleanup happens when the
      // app unmounts (acceptable for a session-scoped game).
    };
  }, [gameId]);

  return { game, loading, error };
}

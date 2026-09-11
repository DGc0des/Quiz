import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../config/supabase';
import { Game } from '../types';

type Connection = 'connecting' | 'connected' | 'reconnecting';
type Snapshot = { game: Game | null; loading: boolean; error: string | null; connection: Connection };
const snapshots = new Map<string, Snapshot>();
const listeners = new Map<string, Set<() => void>>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const requests = new Map<string, Promise<void>>();
const monitors = new Map<string, () => void>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const empty: Snapshot = { game: null, loading: true, error: null, connection: 'connecting' };
function snapshot(id: string) { return snapshots.get(id) ?? empty; }
function publish(id: string, patch: Partial<Snapshot>) {
  snapshots.set(id, { ...snapshot(id), ...patch });
  listeners.get(id)?.forEach(cb => cb());
}
export function primeGame(id: string, game: Game) {
  const previous = snapshot(id).game;
  if (previous && previous.version > game.version) return;
  publish(id, { game, loading: false, error: null });
}

/** Only concurrent requests are cached. Every reconnect fetches fresh state. */
export function refreshGame(id: string): Promise<void> {
  const pending = requests.get(id);
  if (pending) return pending;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // get_game also distinguishes expired games/lost membership from a network failure.
      const { data, error } = await supabase.rpc('get_game', { p_game_id: id }).abortSignal(controller.signal);
      if (error) throw error;
      if (!data) {
        publish(id, { game: null, loading: false, error: 'not-found', connection: 'connected' });
        return;
      }
      primeGame(id, data as Game);
      const tick = await supabase.rpc('tick_game', { p_game_id: id }).abortSignal(controller.signal);
      if (tick.error) throw tick.error;
      if (!tick.data?.ok || !tick.data.game) throw new Error('refresh-failed');
      primeGame(id, tick.data.game as Game);
      publish(id, { connection: 'connected', error: null });
    } catch {
      publish(id, { loading: false, error: 'connection-error', connection: 'reconnecting' });
    } finally { clearTimeout(timeout); }
  })();
  requests.set(id, request);
  void request.finally(() => { if (requests.get(id) === request) requests.delete(id); });
  return request;
}
function ensureChannel(id: string) {
  if (channels.has(id)) return;
  const channel = supabase.channel(`game-${id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, () => { void refreshGame(id); })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') void refreshGame(id);
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        publish(id, { connection: 'reconnecting' });
      }
    });
  channels.set(id, channel);
}
export function useGame(gameId: string) {
  const [, render] = useState(0);
  useEffect(() => {
    if (!gameId) return;
    const cleanup = cleanupTimers.get(gameId);
    if (cleanup) clearTimeout(cleanup);
    cleanupTimers.delete(gameId);
    if (!listeners.has(gameId)) listeners.set(gameId, new Set());
    const cb = () => render(n => n + 1);
    listeners.get(gameId)!.add(cb);
    ensureChannel(gameId);
    void refreshGame(gameId);
    if (!monitors.has(gameId)) {
      const poll = setInterval(() => {
        if (AppState.currentState === 'active') void refreshGame(gameId);
      }, 3000);
      const foreground = AppState.addEventListener('change', state => {
        if (state === 'active') {
          publish(gameId, { connection: 'reconnecting' });
          void refreshGame(gameId);
        }
      });
      monitors.set(gameId, () => { clearInterval(poll); foreground.remove(); });
    }
    return () => {
      listeners.get(gameId)?.delete(cb);
      if (!listeners.get(gameId)?.size) {
        // Brief grace period preserves the channel through screen replacements.
        cleanupTimers.set(gameId, setTimeout(() => {
          cleanupTimers.delete(gameId);
          if (listeners.get(gameId)?.size) return;
          const channel = channels.get(gameId);
          channels.delete(gameId);
          monitors.get(gameId)?.();
          monitors.delete(gameId);
          listeners.delete(gameId);
          if (channel) void supabase.removeChannel(channel);
        }, 1000));
      }
    };
  }, [gameId]);
  return { ...snapshot(gameId), retry: () => refreshGame(gameId) };
}

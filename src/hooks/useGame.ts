import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../config/supabase';
import { Game, GamePresence } from '../types';
import { parsePresence } from '../utils/presence';

type Connection = 'connecting' | 'connected' | 'reconnecting';
type Snapshot = { game: Game | null; loading: boolean; error: string | null; connection: Connection; presence: GamePresence | null };
const snapshots = new Map<string, Snapshot>();
const listeners = new Map<string, Set<() => void>>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const requests = new Map<string, Promise<void>>();
// Games that were asked to refresh while a request was already in flight.
const dirty = new Set<string>();
const monitors = new Map<string, () => void>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const empty: Snapshot = { game: null, loading: true, error: null, connection: 'connecting', presence: null };
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

/**
 * `tick_game` refuses with 42501 when the game no longer exists or the caller is
 * no longer in it (quiz_private.require_member). That is a final answer, not a
 * connection problem, so the screens show "game not available" instead of a
 * reconnect banner that can never clear (review finding R3).
 */
function isGone(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '42501';
}

/**
 * One request per game at a time. A refresh asked for while one is in flight
 * (a burst of Realtime events, the 3s poll landing mid-request) is not dropped:
 * it runs once more when the current one settles, so the last event is always
 * followed by a fetch that saw it.
 */
export function refreshGame(id: string): Promise<void> {
  const pending = requests.get(id);
  if (pending) {
    dirty.add(id);
    return pending;
  }
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // One call: the caller's view of the game, this device's heartbeat, the
      // deadline/away transitions and the presence block (review finding A17 —
      // this used to be get_game followed by tick_game on every refresh).
      const tick = await supabase.rpc('tick_game', { p_game_id: id }).abortSignal(controller.signal);
      if (tick.error) throw tick.error;
      if (!tick.data?.ok || !tick.data.game) throw new Error('refresh-failed');
      primeGame(id, tick.data.game as Game);
      // Away status is derived from heartbeats, so only a tick can refresh it.
      publish(id, { connection: 'connected', error: null, presence: parsePresence(tick.data.presence) });
    } catch (e: unknown) {
      if (isGone(e)) {
        publish(id, { game: null, loading: false, error: 'not-found', connection: 'connected' });
        return;
      }
      publish(id, { loading: false, error: 'connection-error', connection: 'reconnecting' });
    } finally { clearTimeout(timeout); }
  })();
  requests.set(id, request);
  void request.finally(() => {
    if (requests.get(id) === request) requests.delete(id);
    if (dirty.delete(id)) void refreshGame(id);
  });
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

import { useEffect, useRef, MutableRefObject } from 'react';
import { supabase } from '../config/supabase';
import { leaveGame } from '../utils/leaveGame';
import { Game } from '../types';

// Module-level: one channel per gameId so navigating between screens never drops the connection.
const presenceChannels = new Map<string, ReturnType<typeof supabase.channel>>();
const presenceState = new Map<
  string,
  { gameRef: MutableRefObject<Game | null>; playerId: string }
>();

function ensureChannel(
  gameId: string,
  playerId: string,
  gameRef: MutableRefObject<Game | null>,
) {
  const key = `presence:${gameId}`;
  // Always keep the ref pointer up-to-date, even if channel already exists.
  presenceState.set(key, { gameRef, playerId });

  if (presenceChannels.has(key)) return;

  const channel = supabase.channel(key, {
    config: { presence: { key: playerId } },
  });

  channel
    .on('presence', { event: 'leave' }, ({ key: leavingId }: { key: string }) => {
      const state = presenceState.get(key);
      if (!state) return;
      const g = state.gameRef.current;
      if (!g) return;
      if (leavingId === state.playerId) return; // ignore my own leave
      if (!(leavingId in g.players)) return; // already removed
      // Deterministic janitor: the earliest-joined *surviving* player performs
      // cleanup. This works even when the host is the one who disconnected
      // (the old "only the host cleans up" rule left the game stuck on host
      // crash). Exactly one client acts, so writes don't pile up; `leaveGame`
      // is idempotent + version-guarded anyway.
      const survivors = Object.values(g.players)
        .filter((p) => p.id !== leavingId)
        .sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
      if (survivors[0]?.id !== state.playerId) return; // someone else will clean up
      leaveGame(gameId, leavingId, g);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ playerId });
      }
    });

  presenceChannels.set(key, channel);
}

/**
 * Tear down this device's presence for a game it is intentionally leaving
 * (explicit "Leave", or moving on to a rematch). Removing the channel untracks
 * presence (other clients get a leave event) and stops channels accumulating
 * across games. Call this — not on every screen unmount — so the channel still
 * survives normal screen-to-screen transitions.
 */
export function leavePresence(gameId: string) {
  const key = `presence:${gameId}`;
  const channel = presenceChannels.get(key);
  presenceChannels.delete(key);
  presenceState.delete(key);
  if (channel) supabase.removeChannel(channel);
}

/**
 * Tracks this player's presence on the game channel.
 * - App backgrounded: WebSocket stays alive → presence stays → no leave triggered.
 * - App killed: WebSocket drops → other clients' leave event fires → the janitor
 *   (earliest-joined survivor) removes the player. Call `leavePresence` on an
 *   intentional exit so the channel is cleaned up rather than leaked.
 */
export function useGamePresence(gameId: string, playerId: string, game: Game | null) {
  const gameRef = useRef(game);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    ensureChannel(gameId, playerId, gameRef);
    // Intentionally no cleanup: the channel must survive screen transitions.
  }, [gameId, playerId]);
}

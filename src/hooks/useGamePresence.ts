import { useEffect } from 'react';
import { supabase } from '../config/supabase';
import { Game } from '../types';

// Presence survives screen transitions, but is never an authorization signal.
const presenceChannels = new Map<string, ReturnType<typeof supabase.channel>>();

export function leavePresence(gameId: string) {
  const channel = presenceChannels.get(gameId);
  presenceChannels.delete(gameId);
  if (channel) supabase.removeChannel(channel);
}

/** Tracks connectivity only. Explicit exits use the authenticated leave_game RPC.
 * A dropped socket cannot prove departure: other clients must not evict a player.
 * Disconnected members remain until they explicitly leave or retention removes the game.
 */
export function useGamePresence(gameId: string, playerId: string, _game: Game | null) {
  useEffect(() => {
    if (presenceChannels.has(gameId)) return;
    const channel = supabase.channel(`presence:${gameId}`, {
      config: { presence: { key: playerId } },
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ playerId });
    });
    presenceChannels.set(gameId, channel);
    // Deliberately survives navigation; explicit exits call leavePresence.
  }, [gameId, playerId]);
}

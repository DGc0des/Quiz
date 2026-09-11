import { supabase } from '../config/supabase';
import { primeGame } from '../hooks/useGame';
import { Game } from '../types';
import { SavedGame } from './savedGame';

/** Follow rematches without rejoining or overwriting the player's existing answers. */
export async function loadResumableGame(saved: SavedGame): Promise<Game | null> {
  let id = saved.gameId;
  const visited = new Set<string>();
  while (!visited.has(id)) {
    visited.add(id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const { data, error } = await Promise.resolve(supabase.rpc('get_game', { p_game_id: id }).abortSignal(controller.signal)).finally(() => clearTimeout(timeout));
    if (error) throw error;
    const game = data as Game | null;
    if (!game?.players[saved.playerId]) return null;
    if (game.status === 'finished' && game.rematchGameId) { id = game.rematchGameId; continue; }
    primeGame(id, game);
    return game;
  }
  return null;
}

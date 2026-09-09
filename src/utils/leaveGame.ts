import { Game } from '../types';
import { removeGamePlayer } from './gameRpc';

/** Server computes removal, host transfer and any round resolution atomically. */
export async function leaveGame(gameId: string, playerId: string, _game?: Game | null): Promise<void> {
  await removeGamePlayer(gameId, playerId);
}

import { Game } from '../types';
import { isTeamGame, teamOf } from './teams';

/** Where a finished game sends a given player. */
export type FinishDestination = 'Winner' | 'Loser' | 'Home';

/**
 * Decide which screen a finished game belongs on, for this player.
 *
 * This lived inline in four screens (Turn, Question, Result, Lobby), which is
 * the "one entry point reachable two ways" trap — team mode would have needed
 * all four edited identically, and a miss would send a winning team to the
 * Loser screen. One function, four callers, one test.
 *
 * `'Home'` means the game ended without a winner at all: `leaveGame` marks a
 * game finished when the last player walks out, and there is nothing to show.
 */
export function finishedDestination(
  game: Game | null | undefined,
  playerId: string,
): FinishDestination {
  if (!game) return 'Home';

  if (isTeamGame(game)) {
    // The game is won by a side, so `winnerId` stays null here.
    if (!game.winnerTeamId) return 'Home';
    return teamOf(game, playerId)?.id === game.winnerTeamId ? 'Winner' : 'Loser';
  }

  if (!game.winnerId) return 'Home';
  return game.winnerId === playerId ? 'Winner' : 'Loser';
}

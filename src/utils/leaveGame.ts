import { Game } from '../types';
import { updateGame } from './updateGame';

/**
 * Remove a player from a game, transferring host and keeping the turn pointer
 * valid. Runs through `updateGame` so concurrent leaves / writes never clobber
 * each other. `game` is an optional snapshot used to skip the first read.
 */
export async function leaveGame(
  gameId: string,
  playerId: string,
  game?: Game | null,
): Promise<void> {
  await updateGame(
    gameId,
    (g) => {
      if (!(playerId in g.players)) return null; // already gone — no-op

      const updatedPlayers = { ...g.players };
      const leavingPlayer = updatedPlayers[playerId];
      delete updatedPlayers[playerId];

      const remaining = Object.values(updatedPlayers).sort((a, b) => a.joinedAt - b.joinedAt);

      if (remaining.length === 0) {
        return { ...g, players: {}, status: 'finished', winnerId: null };
      }

      // Transfer host to earliest remaining joiner
      if (leavingPlayer?.isHost) {
        updatedPlayers[remaining[0].id] = { ...remaining[0], isHost: true };
      }

      // Update turn order and recalculate index to keep pointing at current active player
      const newTurnOrder = g.turnOrder.filter((id) => id !== playerId);
      let newTurnIndex = g.currentTurnIndex;
      if (g.currentTurn?.activePlayerId && g.currentTurn.activePlayerId !== playerId) {
        const idx = newTurnOrder.indexOf(g.currentTurn.activePlayerId);
        newTurnIndex = idx !== -1 ? idx : Math.min(g.currentTurnIndex, newTurnOrder.length - 1);
      } else {
        newTurnIndex = Math.min(g.currentTurnIndex, newTurnOrder.length - 1);
      }

      let updated: Game = {
        ...g,
        players: updatedPlayers,
        turnOrder: newTurnOrder,
        currentTurnIndex: newTurnIndex,
      };

      // Active picker left → advance turn to next player so the game isn't stuck
      if (g.status === 'picking' && g.currentTurn?.activePlayerId === playerId) {
        const oldIdx = g.turnOrder.indexOf(playerId);
        const nextIdx = newTurnOrder.length > 0 ? oldIdx % newTurnOrder.length : 0;
        const nextActiveId = newTurnOrder[nextIdx];
        updated = {
          ...updated,
          currentTurnIndex: nextIdx,
          currentTurn: {
            ...g.currentTurn!,
            activePlayerId: nextActiveId,
          },
        };
      }

      // If all remaining players have already answered, unblock the reviewing phase
      if (g.status === 'question' && g.currentTurn) {
        const remainingIds = Object.keys(updatedPlayers);
        const answers = g.currentTurn.answers ?? {};
        const allAnswered = remainingIds.length > 0 && remainingIds.every((id) => id in answers);
        if (allAnswered) {
          updated = {
            ...updated,
            status: 'reviewing',
            currentTurn: { ...g.currentTurn, status: 'reviewing' },
          };
        }
      }

      return updated;
    },
    { base: game ?? null },
  );
}

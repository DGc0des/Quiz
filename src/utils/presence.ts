import { Game, GamePresence } from '../types';

/** What an older server (no `presence` block) or a not-yet-ticked screen reads as. */
export const EMPTY_PRESENCE: GamePresence = { awayIds: [], actingHostId: null, roundLeaders: null };

/**
 * Parse the `presence` block of a `tick_game` reply. Anything missing or malformed
 * reads as "nobody away", so an older server degrades to the old behaviour.
 */
export function parsePresence(raw: unknown): GamePresence {
  if (!raw || typeof raw !== 'object') return EMPTY_PRESENCE;
  const value = raw as Record<string, unknown>;
  const awayIds = Array.isArray(value.awayIds)
    ? value.awayIds.filter((id): id is string => typeof id === 'string')
    : [];
  const actingHostId = typeof value.actingHostId === 'string' ? value.actingHostId : null;
  let roundLeaders: GamePresence['roundLeaders'] = null;
  if (value.roundLeaders && typeof value.roundLeaders === 'object') {
    const leaders = value.roundLeaders as Record<string, unknown>;
    roundLeaders = {};
    if (typeof leaders.red === 'string') roundLeaders.red = leaders.red;
    if (typeof leaders.blue === 'string') roundLeaders.blue = leaders.blue;
  }
  return { awayIds, actingHostId, roundLeaders };
}

export function isAway(presence: GamePresence | null | undefined, playerId: string): boolean {
  return presence?.awayIds.includes(playerId) ?? false;
}

/**
 * Whether this device may use in-game host powers (close the review early, start the
 * first turn). Same rule as the `close_review` gate: the host, or the acting host the
 * server named while the host is away.
 */
export function canActAsHost(
  game: Game | null | undefined,
  presence: GamePresence | null | undefined,
  playerId: string,
): boolean {
  const player = game?.players[playerId];
  if (!player) return false;
  return player.isHost || presence?.actingHostId === playerId;
}

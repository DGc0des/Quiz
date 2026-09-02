import { Game, Player, Team, TeamId } from '../types';

export const TEAM_IDS: readonly TeamId[] = ['red', 'blue'] as const;

/** Greek display names, keyed by team id. */
export const TEAM_NAMES: Record<TeamId, string> = {
  red: 'Κόκκινοι',
  blue: 'Μπλε',
};

/** Accent colours for the two sides. Not from `theme.C` — these identify a team. */
export const TEAM_COLORS: Record<TeamId, string> = {
  red: '#FF4F6D',
  blue: '#5BD0F3',
};

/** Fewest players a team game is playable with: 2v2. */
export const MIN_TEAM_PLAYERS = 4;

/**
 * Team mode needs an **even** number of players so the two sides are the same
 * size, and at least {@link MIN_TEAM_PLAYERS} so each side is a real team
 * rather than one person.
 */
export function canEnableTeams(playerCount: number): boolean {
  return playerCount >= MIN_TEAM_PLAYERS && playerCount % 2 === 0;
}

/**
 * The player who actually submits this team's final answer.
 *
 * Normally the stored `leaderId`, but a leader can **leave mid-game** — and a
 * leave goes through `apply_game_update`, which is not allowed to touch `teams`
 * (no write shape lists it). So the stored id can point at someone who is gone,
 * and the round would never close. The fallback is the earliest-joined member
 * still present.
 *
 * **Mirrored in SQL** — `public.effective_leader()` in `0007_team_mode.sql` is
 * the authority; this copy exists so the UI can say "you decide" without a
 * round-trip. Keep the two in step, the same way `sanitizeName.ts` is kept in
 * step with `join_game`.
 */
export function effectiveLeaderId(
  team: Team,
  players: Record<string, Player>,
): string | null {
  if (team.leaderId && players[team.leaderId]) return team.leaderId;
  const remaining = team.memberIds
    .filter((id) => players[id])
    .sort((a, b) => players[a].joinedAt - players[b].joinedAt);
  return remaining[0] ?? null;
}

/**
 * The team a player is on, or null in solo mode / for a player on neither side.
 * Derived from `memberIds`, which is the only place membership is recorded.
 */
export function teamOf(game: Game | null | undefined, playerId: string): Team | null {
  if (!game?.teams) return null;
  for (const id of TEAM_IDS) {
    if (game.teams[id]?.memberIds.includes(playerId)) return game.teams[id];
  }
  return null;
}

/** Whether this player submits their team's final answer. */
export function isTeamLeader(game: Game | null | undefined, playerId: string): boolean {
  const team = teamOf(game, playerId);
  if (!team || !game) return false;
  return effectiveLeaderId(team, game.players) === playerId;
}

/** True when the game is being played in team mode with teams actually built. */
export function isTeamGame(game: Game | null | undefined): game is Game & {
  teams: Record<TeamId, Team>;
} {
  return game?.mode === 'teams' && game.teams != null;
}

/**
 * A leader's teammates, in join order — the advisory answers the leader reads
 * before deciding. Excludes the leader themselves.
 */
export function teammatesOf(game: Game | null | undefined, playerId: string): Player[] {
  const team = teamOf(game, playerId);
  if (!team || !game) return [];
  return team.memberIds
    .filter((id) => id !== playerId)
    .map((id) => game.players[id])
    .filter((p): p is Player => p != null)
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/**
 * Team standings, highest score first, ties broken by team id so the order is
 * stable across renders.
 */
export function teamStandings(game: Game | null | undefined): Team[] {
  if (!isTeamGame(game)) return [];
  return TEAM_IDS.map((id) => game.teams[id]).sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
}

/**
 * Players ordered for display in a team game: **your side first**, each side's
 * leader at the top of its block, then by join order.
 *
 * Ranking players by score is meaningless in team mode — `Player.score` never
 * moves there, so sorting by it leaves teammates scattered and every row
 * showing 0. Grouping by side is the information that actually exists.
 */
export function teamRosterOrder(game: Game, selfId: string): Player[] {
  const myTeamId = teamOf(game, selfId)?.id;
  const rank = (p: Player): [number, number, number] => {
    const team = teamOf(game, p.id);
    return [
      // Own side first; a player on neither side sorts last.
      team ? (team.id === myTeamId ? 0 : 1) : 2,
      team && effectiveLeaderId(team, game.players) === p.id ? 0 : 1,
      p.joinedAt,
    ];
  };
  return Object.values(game.players).sort((a, b) => {
    const [a0, a1, a2] = rank(a);
    const [b0, b1, b2] = rank(b);
    return a0 - b0 || a1 - b1 || a2 - b2;
  });
}

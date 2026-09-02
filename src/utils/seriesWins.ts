import { Player } from '../types';

/** One player's line in the series tally. */
export interface SeriesStanding {
  id: string;
  name: string;
  /** Games won in this series. */
  wins: number;
}

/**
 * Rank the current players by games won in the rematch series.
 *
 * Includes players on 0 — the tally is only readable if you can see everyone
 * it is between. Someone who left keeps their wins in the stored map but drops
 * off the board, the same way they lose their column in the round tracker.
 */
export function buildSeriesStandings(
  seriesWins: Record<string, number> | undefined,
  players: Record<string, Player>,
): SeriesStanding[] {
  return Object.values(players)
    .map((p) => ({ id: p.id, name: p.name, wins: seriesWins?.[p.id] ?? 0 }))
    // Most wins first, then earliest joiner so the order never jitters.
    .sort(
      (a, b) =>
        b.wins - a.wins || players[a.id].joinedAt - players[b.id].joinedAt,
    );
}

/**
 * Games decided so far in this series — counting only players still present,
 * so it matches what {@link buildSeriesStandings} actually renders.
 *
 * The tally is hidden while this is 0: before the first game is won it would be
 * a board of zeroes, which reads as broken rather than as "nothing yet".
 */
export function totalSeriesGames(standings: SeriesStanding[]): number {
  return standings.reduce((sum, s) => sum + s.wins, 0);
}

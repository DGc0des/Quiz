import { Player, RoundRecord, Team } from '../types';

/**
 * How many rounds `Game.roundHistory` keeps, newest wins.
 *
 * **Mirrored in SQL** — `close_review` in `0006_authoritative_scoring.sql` does
 * the trimming, and this constant only documents/reflects it. Keep the two in
 * step. The cap exists because the game blob is guarded at 200 KB by `0001`,
 * and a round entry grows with the player count.
 */
export const MAX_ROUND_HISTORY = 40;

/** One player's column in the tracker. */
export interface RoundHistoryColumn {
  id: string;
  name: string;
  /** Running total — the player's live score, not the sum of the rows below. */
  total: number;
}

export interface RoundHistoryRow {
  turnNumber: number;
  category: string | null;
  points: number | null;
  activePlayerId: string;
  /** Points earned, positionally aligned with the returned `columns`. */
  earned: number[];
}

export interface RoundHistoryTable {
  columns: RoundHistoryColumn[];
  rows: RoundHistoryRow[];
}

/**
 * Columns for a solo game: the players still in it, ranked by score.
 *
 * Someone who left keeps their entries in the stored history but gets no
 * column, so their points simply stop being shown.
 */
export function playerColumns(players: Record<string, Player>): RoundHistoryColumn[] {
  return Object.values(players)
    // Score first, then earliest joiner — `joinedAt` breaks ties deterministically
    // so the columns don't reshuffle between renders.
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((p) => ({ id: p.id, name: p.name, total: p.score }));
}

/**
 * Columns for a team game. `close_review` keys `earned` by **team id** there,
 * so the tracker's columns have to be the sides, not the players.
 */
export function teamColumns(teams: Record<string, Team>): RoundHistoryColumn[] {
  return Object.values(teams)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((t) => ({ id: t.id, name: t.name, total: t.score }));
}

/**
 * Shape `Game.roundHistory` into the tracker table.
 *
 * Totals come from the caller's columns (a live `Player.score` / `Team.score`),
 * never from summing the rows: the history is capped at
 * {@link MAX_ROUND_HISTORY}, so in a long game the visible rows genuinely do
 * not add up to the total.
 */
export function buildRoundHistory(
  history: RoundRecord[] | undefined,
  columns: RoundHistoryColumn[],
): RoundHistoryTable {
  const rows: RoundHistoryRow[] = (history ?? []).map((r) => ({
    turnNumber: r.turnNumber,
    category: r.category ?? null,
    points: r.points ?? null,
    activePlayerId: r.activePlayerId,
    earned: columns.map((c) => r.earned?.[c.id] ?? 0),
  }));

  return { columns, rows };
}

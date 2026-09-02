import {
  buildRoundHistory,
  playerColumns,
  teamColumns,
  MAX_ROUND_HISTORY,
} from '../utils/roundHistory';
import { Player, RoundRecord, Team } from '../types';

const player = (id: string, name: string, score: number, joinedAt: number): Player => ({
  id,
  name,
  score,
  isHost: false,
  joinedAt,
});

const players = (...ps: Player[]): Record<string, Player> =>
  Object.fromEntries(ps.map((p) => [p.id, p]));

const round = (turnNumber: number, earned: Record<string, number>): RoundRecord => ({
  turnNumber,
  activePlayerId: 'a',
  category: 'Ιστορία',
  points: 2,
  earned,
});

describe('buildRoundHistory', () => {
  it('aligns each row to the column order', () => {
    const { columns, rows } = buildRoundHistory(
      [round(1, { a: 3, c: 1 }), round(2, { b: 2 })],
      playerColumns(players(
        player('a', 'Δημήτρης', 21, 1),
        player('b', 'Μαρία', 18, 2),
        player('c', 'Γιώργος', 9, 3)),
      ),
    );

    expect(columns.map((c) => c.name)).toEqual(['Δημήτρης', 'Μαρία', 'Γιώργος']);
    expect(rows.map((r) => r.earned)).toEqual([
      [3, 0, 1],
      [0, 2, 0],
    ]);
  });

  it('reads a player missing from `earned` as 0', () => {
    const { rows } = buildRoundHistory(
      [round(1, {})],
      playerColumns(players(player('a', 'A', 0, 1), player('b', 'B', 0, 2))),
    );
    expect(rows[0].earned).toEqual([0, 0]);
  });

  it('ranks columns by score, breaking ties on earliest joiner', () => {
    const { columns } = buildRoundHistory(
      [],
      playerColumns(players(
        player('late', 'Late', 10, 500),
        player('early', 'Early', 10, 100),
        player('lead', 'Lead', 12, 900)),
      ),
    );
    expect(columns.map((c) => c.id)).toEqual(['lead', 'early', 'late']);
  });

  it('drops a player who left, keeping the remaining columns aligned', () => {
    // 'gone' scored in round 1 but is no longer in `players`.
    const { columns, rows } = buildRoundHistory(
      [round(1, { gone: 3, a: 1 })],
      playerColumns(players(player('a', 'A', 1, 1))),
    );
    expect(columns.map((c) => c.id)).toEqual(['a']);
    expect(rows[0].earned).toEqual([1]);
  });

  it('takes totals from the live score, not from summing the rows', () => {
    // A truncated history cannot add up to the banked score — the total must
    // still be right.
    const { columns } = buildRoundHistory(
      [round(9, { a: 1 })],
      playerColumns(players(player('a', 'A', 21, 1))),
    );
    expect(columns[0].total).toBe(21);
  });

  it('handles a game with no closed rounds yet', () => {
    expect(buildRoundHistory([], playerColumns(players(player('a', 'A', 0, 1)))).rows).toEqual([]);
    expect(buildRoundHistory(undefined, playerColumns(players(player('a', 'A', 0, 1)))).rows).toEqual([]);
  });

  it('carries the round context through', () => {
    const { rows } = buildRoundHistory(
      [round(4, { a: 2 })],
      playerColumns(players(player('a', 'A', 2, 1))),
    );
    expect(rows[0]).toMatchObject({
      turnNumber: 4,
      category: 'Ιστορία',
      points: 2,
      activePlayerId: 'a',
    });
  });

  it('uses team columns when the round was scored by team', () => {
    // close_review keys `earned` by team id in a team game.
    const teams: Record<string, Team> = {
      red: { id: 'red', name: 'Κόκκινοι', leaderId: 'a', memberIds: ['a', 'b'], score: 12 },
      blue: { id: 'blue', name: 'Μπλε', leaderId: 'c', memberIds: ['c', 'd'], score: 15 },
    };
    const { columns, rows } = buildRoundHistory(
      [round(1, { red: 3 }), round(2, { blue: 2 })],
      teamColumns(teams),
    );
    expect(columns.map((c) => c.id)).toEqual(['blue', 'red']);
    expect(columns.map((c) => c.total)).toEqual([15, 12]);
    expect(rows.map((r) => r.earned)).toEqual([
      [0, 3],
      [2, 0],
    ]);
  });

  it('pins the cap that close_review mirrors', () => {
    // If you change this, change the `> 40` trim in 0006_authoritative_scoring.sql.
    expect(MAX_ROUND_HISTORY).toBe(40);
  });
});

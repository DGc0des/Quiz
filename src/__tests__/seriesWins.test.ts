import { buildSeriesStandings, totalSeriesGames } from '../utils/seriesWins';
import { Player } from '../types';

const player = (id: string, name: string, joinedAt: number): Player => ({
  id,
  name,
  score: 0,
  isHost: false,
  joinedAt,
});

const players = (...ps: Player[]): Record<string, Player> =>
  Object.fromEntries(ps.map((p) => [p.id, p]));

describe('buildSeriesStandings', () => {
  it('ranks by games won', () => {
    const standings = buildSeriesStandings(
      { a: 1, b: 3 },
      players(player('a', 'Δημήτρης', 100), player('b', 'Μαρία', 200)),
    );
    expect(standings).toEqual([
      { id: 'b', name: 'Μαρία', wins: 3 },
      { id: 'a', name: 'Δημήτρης', wins: 1 },
    ]);
  });

  it('includes players on 0 — the tally has to show everyone it is between', () => {
    const standings = buildSeriesStandings(
      { a: 2 },
      players(player('a', 'A', 100), player('b', 'B', 200)),
    );
    expect(standings.map((s) => s.wins)).toEqual([2, 0]);
  });

  it('breaks a tie on the earliest joiner, so the order never jitters', () => {
    const standings = buildSeriesStandings(
      { late: 2, early: 2 },
      players(player('late', 'Late', 900), player('early', 'Early', 100)),
    );
    expect(standings.map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('drops a player who left the series', () => {
    const standings = buildSeriesStandings({ gone: 5, a: 1 }, players(player('a', 'A', 100)));
    expect(standings).toEqual([{ id: 'a', name: 'A', wins: 1 }]);
  });

  it('treats a missing tally as a fresh series', () => {
    expect(buildSeriesStandings(undefined, players(player('a', 'A', 100)))).toEqual([
      { id: 'a', name: 'A', wins: 0 },
    ]);
    expect(buildSeriesStandings({}, players(player('a', 'A', 100)))[0].wins).toBe(0);
  });
});

describe('totalSeriesGames', () => {
  it('counts the games decided so far', () => {
    expect(
      totalSeriesGames(
        buildSeriesStandings(
          { a: 2, b: 1 },
          players(player('a', 'A', 100), player('b', 'B', 200)),
        ),
      ),
    ).toBe(3);
  });

  it('is 0 before the first game is won, which hides the board', () => {
    expect(
      totalSeriesGames(buildSeriesStandings({}, players(player('a', 'A', 100)))),
    ).toBe(0);
  });

  it('ignores wins belonging to players who left', () => {
    // Otherwise the header would claim more games than the rows account for.
    expect(
      totalSeriesGames(buildSeriesStandings({ gone: 4, a: 1 }, players(player('a', 'A', 100)))),
    ).toBe(1);
  });
});

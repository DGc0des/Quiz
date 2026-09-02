import {
  canEnableTeams,
  teamRosterOrder,
  effectiveLeaderId,
  isTeamLeader,
  teamOf,
  teammatesOf,
  teamStandings,
  MIN_TEAM_PLAYERS,
} from '../utils/teams';
import { Game, Player, Team } from '../types';

// Splitting the lobby into teams lives in SQL (`start_team_game`), not here —
// see supabase/tests/selftest.sql. Only the lobby's enable-gate and the read
// helpers are testable in this runner.

describe('canEnableTeams', () => {
  it('needs an even count so the sides are equal', () => {
    expect(canEnableTeams(5)).toBe(false);
    expect(canEnableTeams(7)).toBe(false);
    expect(canEnableTeams(6)).toBe(true);
  });

  it('needs at least 2v2 — a "team" of one is just solo', () => {
    expect(canEnableTeams(2)).toBe(false);
    expect(canEnableTeams(MIN_TEAM_PLAYERS)).toBe(true);
  });

  it('rejects an empty lobby', () => {
    expect(canEnableTeams(0)).toBe(false);
  });

  it('allows a full 6v6 lobby', () => {
    expect(canEnableTeams(12)).toBe(true);
  });
});

describe('effectiveLeaderId', () => {
  const team = (leaderId: string, memberIds: string[]): Team => ({
    id: 'red',
    name: 'Κόκκινοι',
    leaderId,
    memberIds,
    score: 0,
  });
  const players = (...entries: [string, number][]): Record<string, Player> =>
    Object.fromEntries(
      entries.map(([id, joinedAt]) => [
        id,
        { id, name: id, score: 0, isHost: false, joinedAt } as Player,
      ]),
    );

  it('is the stored leader while they are still here', () => {
    expect(effectiveLeaderId(team('a', ['a', 'b']), players(['a', 1], ['b', 2]))).toBe('a');
  });

  it('falls back to the earliest remaining member when the leader leaves', () => {
    // A leave cannot touch `teams` — no write shape allows it — so the stored
    // leaderId outlives the leader. Without this the round never closes.
    expect(effectiveLeaderId(team('a', ['a', 'b', 'c']), players(['c', 3], ['b', 2]))).toBe('b');
  });

  it('does not care what order memberIds is in', () => {
    expect(effectiveLeaderId(team('a', ['c', 'b']), players(['b', 9], ['c', 4]))).toBe('c');
  });

  it('is null when the whole team has left', () => {
    expect(effectiveLeaderId(team('a', ['a', 'b']), players(['z', 1]))).toBeNull();
  });

  it('promotes a replacement who can then be recognised as leader', () => {
    const game = {
      mode: 'teams',
      players: players(['b', 2], ['c', 3]),
      teams: { red: team('a', ['a', 'b', 'c']), blue: team('x', ['x']) },
    } as unknown as Game;
    expect(isTeamLeader(game, 'b')).toBe(true);
    expect(isTeamLeader(game, 'c')).toBe(false);
  });
});

describe('team lookups', () => {
  const game = (): Game =>
    ({
      mode: 'teams',
      players: {
        a: { id: 'a', name: 'A', score: 0, isHost: true, joinedAt: 1 },
        b: { id: 'b', name: 'B', score: 0, isHost: false, joinedAt: 2 },
        c: { id: 'c', name: 'C', score: 0, isHost: false, joinedAt: 3 },
        d: { id: 'd', name: 'D', score: 0, isHost: false, joinedAt: 4 },
      },
      teams: {
        red: { id: 'red', name: 'Κόκκινοι', leaderId: 'a', memberIds: ['a', 'b'], score: 7 },
        blue: { id: 'blue', name: 'Μπλε', leaderId: 'c', memberIds: ['c', 'd'], score: 9 },
      },
    }) as unknown as Game;

  it('finds a player’s team', () => {
    expect(teamOf(game(), 'b')?.id).toBe('red');
    expect(teamOf(game(), 'd')?.id).toBe('blue');
  });

  it('identifies leaders and only leaders', () => {
    expect(isTeamLeader(game(), 'a')).toBe(true);
    expect(isTeamLeader(game(), 'b')).toBe(false);
    expect(isTeamLeader(game(), 'c')).toBe(true);
  });

  it('lists a leader’s teammates without the leader', () => {
    expect(teammatesOf(game(), 'a').map((p) => p.id)).toEqual(['b']);
  });

  it('ranks teams by score', () => {
    expect(teamStandings(game()).map((t) => t.id)).toEqual(['blue', 'red']);
  });

  it('returns nothing for a solo game', () => {
    const solo = { ...game(), mode: 'solo', teams: null } as Game;
    expect(teamOf(solo, 'a')).toBeNull();
    expect(isTeamLeader(solo, 'a')).toBe(false);
    expect(teamStandings(solo)).toEqual([]);
  });
});

describe('teamRosterOrder', () => {
  const game = (): Game =>
    ({
      mode: 'teams',
      players: {
        a: { id: 'a', name: 'A', score: 0, isHost: true, joinedAt: 1 },
        b: { id: 'b', name: 'B', score: 0, isHost: false, joinedAt: 2 },
        c: { id: 'c', name: 'C', score: 0, isHost: false, joinedAt: 3 },
        d: { id: 'd', name: 'D', score: 0, isHost: false, joinedAt: 4 },
      },
      teams: {
        red: { id: 'red', name: 'Κόκκινοι', leaderId: 'b', memberIds: ['a', 'b'], score: 6 },
        blue: { id: 'blue', name: 'Μπλε', leaderId: 'c', memberIds: ['c', 'd'], score: 9 },
      },
    }) as unknown as Game;

  it('puts your own side first, leader at the top of each block', () => {
    // Viewer is 'a' (red). red leader is 'b', so 'b' precedes 'a'.
    expect(teamRosterOrder(game(), 'a').map((p) => p.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('flips the blocks for a viewer on the other side', () => {
    expect(teamRosterOrder(game(), 'd').map((p) => p.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('does not rank on Player.score, which never moves in team mode', () => {
    const g = game();
    g.players.d.score = 99; // cannot happen, but must not reorder anything
    expect(teamRosterOrder(g, 'a').map((p) => p.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('promotes the replacement leader to the top when the leader has left', () => {
    const g = game();
    delete (g.players as Record<string, unknown>).b; // red's stored leader leaves
    expect(teamRosterOrder(g, 'a').map((p) => p.id)).toEqual(['a', 'c', 'd']);
  });

  it('sorts a player on neither side last rather than dropping them', () => {
    const g = game();
    g.players.z = { id: 'z', name: 'Z', score: 0, isHost: false, joinedAt: 0 } as never;
    expect(teamRosterOrder(g, 'a').map((p) => p.id)).toEqual(['b', 'a', 'c', 'd', 'z']);
  });

  it('includes every player exactly once', () => {
    expect(teamRosterOrder(game(), 'a')).toHaveLength(4);
  });
});

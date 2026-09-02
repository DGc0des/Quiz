import { finishedDestination } from '../utils/gameFlow';
import { Game } from '../types';

// Where a finished game sends each player. This rule was inlined in four
// screens before team mode; a single wrong copy would have sent a winning team
// to the Loser screen, so every branch is pinned here.

const solo = (winnerId: string | null): Game =>
  ({
    mode: 'solo',
    teams: null,
    winnerId,
    winnerTeamId: null,
    players: {
      a: { id: 'a', name: 'A', score: 15, isHost: true, joinedAt: 1 },
      b: { id: 'b', name: 'B', score: 9, isHost: false, joinedAt: 2 },
    },
  }) as unknown as Game;

const teams = (winnerTeamId: 'red' | 'blue' | null): Game =>
  ({
    mode: 'teams',
    winnerId: null,
    winnerTeamId,
    players: {
      a: { id: 'a', name: 'A', score: 0, isHost: true, joinedAt: 1 },
      b: { id: 'b', name: 'B', score: 0, isHost: false, joinedAt: 2 },
      c: { id: 'c', name: 'C', score: 0, isHost: false, joinedAt: 3 },
      d: { id: 'd', name: 'D', score: 0, isHost: false, joinedAt: 4 },
    },
    teams: {
      red: { id: 'red', name: 'Κόκκινοι', leaderId: 'a', memberIds: ['a', 'b'], score: 15 },
      blue: { id: 'blue', name: 'Μπλε', leaderId: 'c', memberIds: ['c', 'd'], score: 9 },
    },
  }) as unknown as Game;

describe('finishedDestination — solo', () => {
  it('sends the winner to Winner', () => {
    expect(finishedDestination(solo('a'), 'a')).toBe('Winner');
  });

  it('sends everyone else to Loser', () => {
    expect(finishedDestination(solo('a'), 'b')).toBe('Loser');
  });

  it('sends everyone Home when the game ended with no winner', () => {
    // leaveGame marks a game finished when the last player walks out.
    expect(finishedDestination(solo(null), 'a')).toBe('Home');
  });
});

describe('finishedDestination — teams', () => {
  it('sends the whole winning side to Winner, leader or not', () => {
    expect(finishedDestination(teams('red'), 'a')).toBe('Winner'); // leader
    expect(finishedDestination(teams('red'), 'b')).toBe('Winner'); // teammate
  });

  it('sends the whole losing side to Loser', () => {
    expect(finishedDestination(teams('red'), 'c')).toBe('Loser');
    expect(finishedDestination(teams('red'), 'd')).toBe('Loser');
  });

  it('reads the winning team, not the player id', () => {
    // `winnerId` is null in team mode. Reading it instead of `winnerTeamId`
    // would send *everyone* Home — the bug this function exists to prevent.
    expect(teams('blue').winnerId).toBeNull();
    expect(finishedDestination(teams('blue'), 'c')).toBe('Winner');
    expect(finishedDestination(teams('blue'), 'a')).toBe('Loser');
  });

  it('sends a player on neither side to Loser, not Winner', () => {
    const g = teams('red');
    expect(finishedDestination(g, 'stranger')).toBe('Loser');
  });

  it('sends everyone Home when a team game ended with no winning side', () => {
    expect(finishedDestination(teams(null), 'a')).toBe('Home');
  });

  it('treats mode:teams with no teams built as solo, not a crash', () => {
    // A game abandoned in the lobby after picking the mode never got a split.
    const g = { ...teams(null), teams: null, winnerId: 'a' } as Game;
    expect(finishedDestination(g, 'a')).toBe('Winner');
  });
});

describe('finishedDestination — no game', () => {
  it('sends a missing game Home rather than throwing', () => {
    expect(finishedDestination(null, 'a')).toBe('Home');
    expect(finishedDestination(undefined, 'a')).toBe('Home');
  });
});

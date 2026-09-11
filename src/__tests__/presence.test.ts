import { canActAsHost, decidingLeaderId, EMPTY_PRESENCE, isAway, parsePresence } from '../utils/presence';
import { Game, Player, Team } from '../types';

const player = (id: string, isHost = false): Player => ({ id, name: id, score: 0, isHost, joinedAt: 0 });
const game = (...players: Player[]) =>
  ({ id: 'ABCDEF', players: Object.fromEntries(players.map((p) => [p.id, p])) }) as Game;

describe('parsePresence', () => {
  it('reads an older server with no presence block as nobody away', () => {
    expect(parsePresence(undefined)).toEqual(EMPTY_PRESENCE);
    expect(parsePresence(null)).toEqual(EMPTY_PRESENCE);
  });

  it('ignores malformed fields instead of throwing', () => {
    expect(parsePresence({ awayIds: 'p1', actingHostId: 7, roundLeaders: 'red' })).toEqual(EMPTY_PRESENCE);
  });

  it('keeps only string ids', () => {
    expect(
      parsePresence({ awayIds: ['p1', 3, null], actingHostId: 'p2', roundLeaders: { red: 'p3', blue: 9 } }),
    ).toEqual({ awayIds: ['p1'], actingHostId: 'p2', roundLeaders: { red: 'p3' } });
  });
});

describe('isAway', () => {
  it('is false before the first tick', () => {
    expect(isAway(null, 'p1')).toBe(false);
  });

  it('follows the server list', () => {
    expect(isAway({ ...EMPTY_PRESENCE, awayIds: ['p1'] }, 'p1')).toBe(true);
    expect(isAway({ ...EMPTY_PRESENCE, awayIds: ['p1'] }, 'p2')).toBe(false);
  });
});

describe('canActAsHost', () => {
  const g = game(player('host', true), player('p1'), player('p2'));

  it('lets the host act before the first tick', () => {
    expect(canActAsHost(g, null, 'host')).toBe(true);
    expect(canActAsHost(g, null, 'p1')).toBe(false);
  });

  it('adds the acting host the server named while the host is away', () => {
    const presence = { ...EMPTY_PRESENCE, awayIds: ['host'], actingHostId: 'p1' };
    expect(canActAsHost(g, presence, 'p1')).toBe(true);
    expect(canActAsHost(g, presence, 'p2')).toBe(false);
    // Same rule as the close_review gate: the real host is never locked out.
    expect(canActAsHost(g, presence, 'host')).toBe(true);
  });

  it('refuses a player who is not in the game', () => {
    expect(canActAsHost(g, { ...EMPTY_PRESENCE, actingHostId: 'ghost' }, 'ghost')).toBe(false);
  });
});

describe('decidingLeaderId', () => {
  const team: Team = { id: 'red', name: 'Κόκκινοι', leaderId: 'lead', memberIds: ['lead', 'mate'], score: 0 };
  const g = game({ ...player('lead'), joinedAt: 1 }, { ...player('mate'), joinedAt: 2 });

  it('is the effective leader before the first tick', () => {
    expect(decidingLeaderId(g, team, null)).toBe('lead');
  });

  it('follows the stand-in the server named', () => {
    expect(decidingLeaderId(g, team, { ...EMPTY_PRESENCE, roundLeaders: { red: 'mate' } })).toBe('mate');
  });

  it('falls back when the server named nobody for this side', () => {
    expect(decidingLeaderId(g, team, { ...EMPTY_PRESENCE, roundLeaders: { blue: 'x' } })).toBe('lead');
  });
});

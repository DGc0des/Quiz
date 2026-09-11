const rpc = jest.fn();
jest.mock('react-native', () => ({ AppState: {} }));
jest.mock('react', () => ({ useEffect: jest.fn(), useState: () => [0, jest.fn()] }));
jest.mock('../config/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }) } }));
import { primeGame, refreshGame, useGame } from '../hooks/useGame';
import { Game } from '../types';
const game = (id: string, version = 1) => ({ id, version, status: 'question' }) as Game;
beforeEach(() => rpc.mockReset());
it('keeps cached state offline and clears the banner after fresh state arrives', async () => {
  primeGame('offline', game('offline'));
  rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  await refreshGame('offline');
  expect(useGame('offline')).toMatchObject({ game: { version: 1 }, connection: 'reconnecting' });
  rpc.mockResolvedValueOnce({ data: game('offline', 2), error: null });
  rpc.mockResolvedValueOnce({ data: { ok: true, game: game('offline', 3) }, error: null });
  await refreshGame('offline');
  expect(useGame('offline')).toMatchObject({ game: { version: 3 }, connection: 'connected', error: null });
});
it('clears stale state when membership or the game disappears', async () => {
  primeGame('gone', game('gone'));
  rpc.mockResolvedValue({ data: null, error: null });
  await refreshGame('gone');
  expect(useGame('gone')).toMatchObject({ game: null, loading: false, error: 'not-found' });
});
it('deduplicates concurrent refreshes and rejects older snapshots', async () => {
  primeGame('race', game('race', 5));
  rpc.mockResolvedValueOnce({ data: game('race', 2), error: null });
  rpc.mockResolvedValueOnce({ data: { ok: true, game: game('race', 3) }, error: null });
  const first = refreshGame('race');
  expect(refreshGame('race')).toBe(first);
  await first;
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(useGame('race').game?.version).toBe(5);
});
it('exposes the server presence from tick_game and tolerates an older server', async () => {
  rpc.mockResolvedValueOnce({ data: game('presence', 1), error: null });
  rpc.mockResolvedValueOnce({
    data: { ok: true, game: game('presence', 1), presence: { awayIds: ['p2'], actingHostId: 'p1', roundLeaders: null } },
    error: null,
  });
  await refreshGame('presence');
  expect(useGame('presence').presence).toEqual({ awayIds: ['p2'], actingHostId: 'p1', roundLeaders: null });

  rpc.mockResolvedValueOnce({ data: game('presence', 2), error: null });
  rpc.mockResolvedValueOnce({ data: { ok: true, game: game('presence', 2) }, error: null });
  await refreshGame('presence');
  expect(useGame('presence').presence).toEqual({ awayIds: [], actingHostId: null, roundLeaders: null });
});

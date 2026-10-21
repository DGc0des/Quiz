const rpc = jest.fn();
jest.mock('react-native', () => ({ AppState: {} }));
jest.mock('react', () => ({ useEffect: jest.fn(), useState: () => [0, jest.fn()] }));
jest.mock('../config/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }) } }));
import { primeGame, refreshGame, useGame } from '../hooks/useGame';
import { Game } from '../types';
const game = (id: string, version = 1) => ({ id, version, status: 'question' }) as Game;
const tick = (g: Game, presence?: unknown) => ({ data: { ok: true, game: g, presence }, error: null });
// Lets the trailing refresh (scheduled in a .finally) start and settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => rpc.mockReset());

it('refreshes with a single tick_game call', async () => {
  rpc.mockResolvedValueOnce(tick(game('single', 2)));
  await refreshGame('single');
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('tick_game', { p_game_id: 'single' });
  expect(useGame('single')).toMatchObject({ game: { version: 2 }, connection: 'connected', error: null });
});

it('keeps cached state offline and clears the banner after fresh state arrives', async () => {
  primeGame('offline', game('offline'));
  rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  await refreshGame('offline');
  expect(useGame('offline')).toMatchObject({ game: { version: 1 }, connection: 'reconnecting' });
  rpc.mockResolvedValueOnce(tick(game('offline', 3)));
  await refreshGame('offline');
  expect(useGame('offline')).toMatchObject({ game: { version: 3 }, connection: 'connected', error: null });
});

it('treats a membership refusal as a finished game, not a lost connection', async () => {
  primeGame('gone', game('gone'));
  rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not a member' } });
  await refreshGame('gone');
  expect(useGame('gone')).toMatchObject({ game: null, loading: false, error: 'not-found', connection: 'connected' });
});

it('shares one in-flight request and rejects older snapshots', async () => {
  primeGame('race', game('race', 5));
  rpc.mockResolvedValueOnce(tick(game('race', 3)));
  const first = refreshGame('race');
  expect(refreshGame('race')).toBe(first);
  rpc.mockResolvedValueOnce(tick(game('race', 4)));
  await first;
  await settle();
  expect(useGame('race').game?.version).toBe(5);
});

it('runs exactly one more refresh after a burst that arrived mid-flight', async () => {
  let release: (value: unknown) => void = () => undefined;
  rpc.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  rpc.mockResolvedValueOnce(tick(game('burst', 7)));
  const first = refreshGame('burst');
  for (let i = 0; i < 5; i++) refreshGame('burst');
  release(tick(game('burst', 6)));
  await first;
  await settle();
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(useGame('burst').game?.version).toBe(7);
});

it('exposes the server presence from tick_game and tolerates an older server', async () => {
  rpc.mockResolvedValueOnce(tick(game('presence', 1), { awayIds: ['p2'], actingHostId: 'p1', roundLeaders: null }));
  await refreshGame('presence');
  expect(useGame('presence').presence).toEqual({ awayIds: ['p2'], actingHostId: 'p1', roundLeaders: null });

  rpc.mockResolvedValueOnce(tick(game('presence', 2)));
  await refreshGame('presence');
  expect(useGame('presence').presence).toEqual({ awayIds: [], actingHostId: null, roundLeaders: null });
});

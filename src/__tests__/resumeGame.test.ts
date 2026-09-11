const rpc = jest.fn();
jest.mock('../config/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }) } }));
jest.mock('../hooks/useGame', () => ({ primeGame: jest.fn() }));
import { loadResumableGame } from '../utils/resumeGame';
import { gameDestination } from '../utils/gameFlow';
import { Game } from '../types';
const saved = { gameId: 'ABCDEF', playerId: 'me' };
const game = (status: Game['status'], extra = {}) => ({ id: saved.gameId, status, players: { me: {} }, ...extra }) as unknown as Game;
beforeEach(() => rpc.mockReset());
it.each([
  ['lobby', 'Lobby'], ['turn_reveal', 'TurnReveal'], ['picking', 'Turn'], ['question', 'Question'], ['reviewing', 'Result'],
] as const)('resumes %s on %s', (status, destination) => {
  expect(gameDestination(game(status), 'me')).toBe(destination);
});
it('rejects a player who is no longer a member', async () => {
  rpc.mockResolvedValue({ data: game('question', { players: {} }), error: null });
  expect(await loadResumableGame(saved)).toBeNull();
});
it('follows rematches even when they already started', async () => {
  rpc.mockResolvedValueOnce({ data: game('finished', { rematchGameId: 'NEXT23' }), error: null });
  const next = game('question', { id: 'NEXT23' });
  rpc.mockResolvedValueOnce({ data: next, error: null });
  expect(await loadResumableGame(saved)).toEqual(next);
  expect(rpc).toHaveBeenLastCalledWith('get_game', { p_game_id: 'NEXT23' });
});
it('propagates network failures instead of declaring the saved game gone', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(loadResumableGame(saved)).rejects.toThrow('offline');
});
it('handles missing games and rematch cycles', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await loadResumableGame(saved)).toBeNull();
  rpc.mockResolvedValueOnce({ data: game('finished', { rematchGameId: saved.gameId }), error: null });
  expect(await loadResumableGame(saved)).toBeNull();
});

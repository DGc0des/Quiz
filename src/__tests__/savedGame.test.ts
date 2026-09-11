const values = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { values.delete(key); }),
  },
}));
import { saveActiveGame, readActiveGame, clearActiveGame, savePlayerName, readPlayerName } from '../utils/savedGame';
beforeEach(() => values.clear());
it('restores only the authenticated player’s game', async () => {
  const saved = { gameId: 'ABCDEF', playerId: 'me' };
  await saveActiveGame(saved);
  expect(await readActiveGame('me')).toEqual(saved);
  expect(await readActiveGame('someone-else')).toBeNull();
});
it('serializes saves and departure cleanup without deleting a newer game', async () => {
  void saveActiveGame({ gameId: 'OLD234', playerId: 'me' });
  void saveActiveGame({ gameId: 'NEW234', playerId: 'me' });
  await clearActiveGame('OLD234');
  expect((await readActiveGame('me'))?.gameId).toBe('NEW234');
  await clearActiveGame('NEW234');
  expect(await readActiveGame('me')).toBeNull();
});
it('tolerates corrupt storage and remembers the player name', async () => {
  values.set('quiz.activeGame', '{bad');
  expect(await readActiveGame('me')).toBeNull();
  await savePlayerName('Δημήτρης');
  expect(await readPlayerName()).toBe('Δημήτρης');
});

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedGame { gameId: string; playerId: string }
const GAME_KEY = 'quiz.activeGame';
const NAME_KEY = 'quiz.playerName';
// Serialize writes so a delayed save cannot resurrect a game after leaving.
let writes: Promise<unknown> = Promise.resolve();
function enqueue(action: () => Promise<unknown>): Promise<void> {
  writes = writes.then(action).catch(() => undefined);
  return writes.then(() => undefined);
}
export function saveActiveGame(game: SavedGame) {
  return enqueue(() => AsyncStorage.setItem(GAME_KEY, JSON.stringify(game)));
}
export function clearActiveGame(gameId: string) {
  return enqueue(async () => {
    const raw = await AsyncStorage.getItem(GAME_KEY);
    if (raw && JSON.parse(raw).gameId === gameId) await AsyncStorage.removeItem(GAME_KEY);
  });
}
export async function readActiveGame(playerId: string): Promise<SavedGame | null> {
  await writes;
  try {
    const raw = await AsyncStorage.getItem(GAME_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value?.playerId === playerId && typeof value.gameId === 'string' ? value : null;
  } catch { return null; }
}
export async function readPlayerName(): Promise<string> {
  try { return (await AsyncStorage.getItem(NAME_KEY)) ?? ''; } catch { return ''; }
}
export function savePlayerName(name: string) {
  return enqueue(() => AsyncStorage.setItem(NAME_KEY, name));
}

// Preserve the server-issued 50/50 elimination on this device across restarts.
export function saveFiftyOptions(gameId: string, playerId: string, turnNumber: number, options: number[]) {
  return enqueue(() => AsyncStorage.setItem('quiz.fiftyOptions', JSON.stringify({ gameId, playerId, turnNumber, options })));
}
export async function readFiftyOptions(gameId: string, playerId: string, turnNumber: number): Promise<number[] | null> {
  await writes;
  try {
    const raw = await AsyncStorage.getItem('quiz.fiftyOptions');
    const saved = raw ? JSON.parse(raw) : null;
    return saved?.gameId === gameId && saved.playerId === playerId && saved.turnNumber === turnNumber
      && Array.isArray(saved.options) && saved.options.length === 2
      && saved.options.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 4)
      ? saved.options : null;
  } catch { return null; }
}

import { GAME_CODE_ALPHABET } from './gameId';

const CODE_RE = new RegExp(`^[${GAME_CODE_ALPHABET}]{6}$`);

/**
 * A game code that arrived from outside the app (deep link, pasted text):
 * trimmed, upper-cased, and exactly six characters from the code alphabet.
 * Anything else is `null`, so callers never carry a half-valid code around.
 */
export function normalizeGameCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

type LinkRoute = { name: string; params?: object; path?: string };
type LinkState = { routes: LinkRoute[] };

/**
 * The only thing a link may carry is a game code.
 *
 * React Navigation merges every query parameter into the target screen's
 * params, so `quizapp://join/ABCDEF?playerName=…` used to hand JoinGameScreen a
 * name, hide the name field and save that name as the device's own (review
 * finding FR-S2). This keeps exactly one route — JoinGame — with a validated
 * `gameCode` or none at all, and drops every other parameter. A link that
 * resolves to anything else is ignored.
 */
export function sanitizeLinkState<S extends LinkState>(state: S | undefined): S | undefined {
  if (!state || state.routes.length !== 1 || state.routes[0].name !== 'JoinGame') return undefined;
  const route = state.routes[0];
  const gameCode = normalizeGameCode((route.params as Record<string, unknown> | undefined)?.gameCode);
  return { ...state, routes: [{ ...route, params: gameCode ? { gameCode } : {} }] } as S;
}

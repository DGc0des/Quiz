// Deep links are untrusted input. The parsed states below are verbatim output of
// React Navigation's getStateFromPath (@react-navigation/core 7.21.1) for the app's
// linking config `{ screens: { JoinGame: 'join/:gameCode' } }`. The package is
// ESM-only, which this ts-jest/CommonJS setup cannot load, so the shapes are pinned
// here instead; re-capture them after a React Navigation major upgrade with:
//   node -e "console.log(JSON.stringify(require('@react-navigation/core').getStateFromPath('join/ABCDEF?playerName=x',{screens:{JoinGame:'join/:gameCode'}})))"
import { normalizeGameCode, sanitizeLinkState } from '../utils/deepLink';

const parsed = (path: string, params: Record<string, string>) => ({
  routes: [{ name: 'JoinGame', params, path }],
});

describe('normalizeGameCode', () => {
  it('accepts a code from the alphabet and upper-cases it', () => {
    expect(normalizeGameCode('abc234')).toBe('ABC234');
    expect(normalizeGameCode('  XYZ789 ')).toBe('XYZ789');
  });
  it('rejects wrong lengths, ambiguous characters and non-strings', () => {
    expect(normalizeGameCode('ABC23')).toBeNull();
    expect(normalizeGameCode('ABC2345')).toBeNull();
    expect(normalizeGameCode('ABC12O')).toBeNull();
    expect(normalizeGameCode(undefined)).toBeNull();
    expect(normalizeGameCode(123456)).toBeNull();
  });
});

describe('deep link sanitizer (review finding FR-S2)', () => {
  it('keeps a valid code and upper-cases it', () => {
    const state = sanitizeLinkState(parsed('join/abc234', { gameCode: 'abc234' }));
    expect(state?.routes[0]).toEqual({ name: 'JoinGame', params: { gameCode: 'ABC234' }, path: 'join/abc234' });
  });

  it('drops a name, and any other parameter, smuggled in the query string', () => {
    const state = sanitizeLinkState(
      parsed('join/ABCDEF?playerName=Μαλάκας&foo=1', { gameCode: 'ABCDEF', foo: '1', playerName: 'Μαλάκας' }),
    );
    expect(state?.routes[0].params).toEqual({ gameCode: 'ABCDEF' });
  });

  it('opens the join screen without a code when the code is invalid', () => {
    expect(sanitizeLinkState(parsed('join/ABC12O', { gameCode: 'ABC12O' }))?.routes[0].params).toEqual({});
  });

  it('ignores links that resolve to anything but the join screen', () => {
    expect(sanitizeLinkState({ routes: [{ name: 'Lobby', params: { gameId: 'ABCDEF', playerId: 'evil' } }] })).toBeUndefined();
    expect(sanitizeLinkState({ routes: [] })).toBeUndefined();
    // getStateFromPath returns undefined for paths outside the config.
    expect(sanitizeLinkState(undefined)).toBeUndefined();
  });
});

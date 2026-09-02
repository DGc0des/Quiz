// Tests for the three RPCs that need the answer key and therefore run on the
// server (src/utils/gameRpc.ts + supabase/migrations/0006_authoritative_scoring.sql).
//
// The rules those functions enforce — steal resolution, closest-wins, the 50/50
// cap, Double, the winner tie-break — are PL/pgSQL now and cannot be exercised
// here. What *can* be pinned is the contract: what the client sends, what it
// must never send, and what it does with each reply.

const rpc = jest.fn();

jest.mock('../config/supabase', () => ({
  supabase: { rpc: (...args: any[]) => rpc(...args) },
}));

const primeGame = jest.fn();
jest.mock('../hooks/useGame', () => ({ primeGame: (...args: any[]) => primeGame(...args) }));

import {
  submitAnswer,
  ensureRoundAdvanced,
  useFifty,
  closeReview,
  setGameMode,
  startTeamGame,
} from '../utils/gameRpc';

const GAME = { id: 'ABCDEF', players: {}, version: 3 } as any;

beforeEach(() => {
  rpc.mockReset();
  primeGame.mockReset();
  rpc.mockResolvedValue({ data: { ok: true, game: GAME }, error: null });
});

describe('submitAnswer', () => {
  it('sends a chosen option and never sends isCorrect', async () => {
    await submitAnswer('ABCDEF', { index: 2 });

    expect(rpc).toHaveBeenCalledWith('submit_answer', {
      p_game_id: 'ABCDEF',
      p_answer_index: 2,
      p_answer_value: null,
      p_stolen_from: null,
    });
    // Correctness is the server's to decide — that is the whole of Stage 3.
    const payload = JSON.stringify(rpc.mock.calls[0][1]);
    expect(payload).not.toMatch(/isCorrect/i);
  });

  it('sends a numeric guess', async () => {
    await submitAnswer('ABCDEF', { value: 1821 });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_answer_index: null,
      p_answer_value: 1821,
    });
  });

  it('sends a steal as a pointer, with no answer of its own', async () => {
    await submitAnswer('ABCDEF', { stolenFrom: 'other-player' });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_answer_index: null,
      p_answer_value: null,
      p_stolen_from: 'other-player',
    });
  });

  it('sends nulls when the timer expires with nothing selected', async () => {
    await submitAnswer('ABCDEF', {});
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_answer_index: null,
      p_answer_value: null,
      p_stolen_from: null,
    });
  });

  it('primes the shared cache so the status effect fires without the realtime echo', async () => {
    await submitAnswer('ABCDEF', { index: 0 });
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', GAME);
  });

  it('passes a refusal through without priming', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'wrong_status' }, error: null });

    const result = await submitAnswer('ABCDEF', { index: 0 });

    expect(result).toEqual({ ok: false, reason: 'wrong_status' });
    expect(primeGame).not.toHaveBeenCalled();
  });

  it('throws on a transport error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    await expect(submitAnswer('ABCDEF', { index: 0 })).rejects.toMatchObject({
      message: 'network down',
    });
  });
});

describe('ensureRoundAdvanced', () => {
  it('is an empty re-submission — the server treats it as a completeness check', async () => {
    await ensureRoundAdvanced('ABCDEF');
    expect(rpc).toHaveBeenCalledWith('submit_answer', {
      p_game_id: 'ABCDEF',
      p_answer_index: null,
      p_answer_value: null,
      p_stolen_from: null,
    });
  });
});

describe('useFifty', () => {
  it('returns the indices the server chose to hide', async () => {
    rpc.mockResolvedValue({ data: { ok: true, game: GAME, hidden: [1, 3] }, error: null });

    const result = await useFifty('ABCDEF');

    expect(rpc).toHaveBeenCalledWith('use_fifty', { p_game_id: 'ABCDEF' });
    expect(result).toMatchObject({ ok: true, hidden: [1, 3] });
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', GAME);
  });

  it('refuses gracefully when the help is already spent', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'help_already_used' }, error: null });
    const result = await useFifty('ABCDEF');
    expect(result).toEqual({ ok: false, reason: 'help_already_used' });
  });
});

describe('closeReview', () => {
  it('sends only the game id — points and winner are the server’s to decide', async () => {
    await closeReview('ABCDEF');
    expect(rpc).toHaveBeenCalledWith('close_review', { p_game_id: 'ABCDEF' });
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', GAME);
  });

  it('reports a refusal so the caller can release its one-shot guard', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'unresolved_round' }, error: null });
    const result = await closeReview('ABCDEF');
    expect(result.ok).toBe(false);
  });
});

// ── team mode (0007) ────────────────────────────────────────────────────────
// Both are host-only lobby writes. The client sends no team data at all: the
// split is the server's to draw, so nothing here may carry a roster or a leader.

describe('setGameMode', () => {
  it('sends just the game id and the mode', async () => {
    await setGameMode('ABCDEF', 'teams');
    expect(rpc).toHaveBeenCalledWith('set_game_mode', {
      p_game_id: 'ABCDEF',
      p_mode: 'teams',
    });
  });

  it('can switch back to solo', async () => {
    await setGameMode('ABCDEF', 'solo');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_mode: 'solo' });
  });

  it('primes the cache so the lobby re-renders without the realtime echo', async () => {
    await setGameMode('ABCDEF', 'teams');
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', GAME);
  });

  it('passes an uneven lobby refusal through without priming', async () => {
    // The picker is disabled for this, but players leave while the host decides.
    rpc.mockResolvedValue({ data: { ok: false, reason: 'uneven_teams' }, error: null });

    const result = await setGameMode('ABCDEF', 'teams');

    expect(result).toEqual({ ok: false, reason: 'uneven_teams' });
    expect(primeGame).not.toHaveBeenCalled();
  });

  it('passes a non-host refusal through', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not_host' }, error: null });
    expect(await setGameMode('ABCDEF', 'teams')).toEqual({
      ok: false,
      reason: 'not_host',
    });
  });

  it('throws on a transport error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    await expect(setGameMode('ABCDEF', 'teams')).rejects.toMatchObject({
      message: 'network down',
    });
  });
});

describe('startTeamGame', () => {
  it('sends only the game id — the draw is the server’s', async () => {
    await startTeamGame('ABCDEF');
    expect(rpc).toHaveBeenCalledWith('start_team_game', { p_game_id: 'ABCDEF' });
  });

  it('never sends a roster, a leader or a turn order', async () => {
    await startTeamGame('ABCDEF');
    // The split decides who holds the leader's power; a client that could name
    // it could deal itself the deciding vote every game.
    const payload = JSON.stringify(rpc.mock.calls[0][1]);
    expect(payload).not.toMatch(/leader|member|team|turnOrder/i);
  });

  it('primes the cache so the status effect navigates to TurnReveal', async () => {
    await startTeamGame('ABCDEF');
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', GAME);
  });

  it('passes a refusal through so the start button can be re-enabled', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not_team_mode' }, error: null });
    const result = await startTeamGame('ABCDEF');
    expect(result).toEqual({ ok: false, reason: 'not_team_mode' });
    expect(primeGame).not.toHaveBeenCalled();
  });

  it('reports a second start as a refusal, not a silent re-draw', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not_in_lobby' }, error: null });
    expect((await startTeamGame('ABCDEF')).ok).toBe(false);
  });
});

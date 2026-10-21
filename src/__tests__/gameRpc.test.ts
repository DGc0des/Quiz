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
  createGame, createRematch, usePowerUp, removeGamePlayer,
  GameRpcRefused,
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

    await expect(submitAnswer('ABCDEF', { index: 0 })).rejects.toThrow('wrong_status');
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
  it('advances deadlines without submitting an empty answer', async () => {
    await ensureRoundAdvanced('ABCDEF');
    expect(rpc).toHaveBeenCalledWith('tick_game', { p_game_id: 'ABCDEF' });
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
    await expect(useFifty('ABCDEF')).rejects.toThrow('help_already_used');
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
    await expect(closeReview('ABCDEF')).rejects.toThrow('unresolved_round');
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

    await expect(setGameMode('ABCDEF', 'teams')).rejects.toThrow('uneven_teams');
    expect(primeGame).not.toHaveBeenCalled();
  });

  it('passes a non-host refusal through', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not_host' }, error: null });
    await expect(setGameMode('ABCDEF', 'teams')).rejects.toThrow('not_host');
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
    await expect(startTeamGame('ABCDEF')).rejects.toThrow('not_team_mode');
    expect(primeGame).not.toHaveBeenCalled();
  });

  it('reports a second start as a refusal, not a silent re-draw', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'not_in_lobby' }, error: null });
    await expect(startTeamGame('ABCDEF')).rejects.toThrow('not_in_lobby');
  });
});


describe('dedicated security actions', () => {
  it('creation sends only an idempotent code and name, never game state', async () => {
    await createGame('ABCDEF', 'Δημήτρης');
    expect(rpc).toHaveBeenCalledWith('create_game', { p_game_id: 'ABCDEF', p_name: 'Δημήτρης' });
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', GAME);
  });
  it('rematch derives players, scores and series on the server', async () => {
    await createRematch('ABCDEF');
    expect(rpc).toHaveBeenCalledWith('create_rematch', { p_game_id: 'ABCDEF' });
  });
  it('leave never sends replacement players, host flags or results', async () => {
    await removeGamePlayer('ABCDEF', 'departing');
    expect(rpc).toHaveBeenCalledWith('leave_game', { p_game_id: 'ABCDEF', p_player_id: 'departing' });
  });
  it('power-ups send an action instead of editable help flags', async () => {
    await usePowerUp('ABCDEF', 'double');
    expect(rpc).toHaveBeenLastCalledWith('use_power_up', { p_game_id: 'ABCDEF', p_help: 'double', p_target: null });
    await usePowerUp('ABCDEF', 'sabotage', 'opponent');
    expect(rpc).toHaveBeenLastCalledWith('use_power_up', { p_game_id: 'ABCDEF', p_help: 'sabotage', p_target: 'opponent' });
  });
  it('a refusal carries its reason, so a screen can explain it', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'name_not_allowed' }, error: null });
    const error = await createGame('ABCDEF', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GameRpcRefused);
    expect((error as GameRpcRefused).reason).toBe('name_not_allowed');
    expect(primeGame).not.toHaveBeenCalled();
  });
  it('a transport error is not dressed up as a refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const error = await createGame('ABCDEF', 'x').catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(GameRpcRefused);
  });
  it('a denied action throws so optimistic controls can roll back', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'help_already_used' }, error: null });
    await expect(usePowerUp('ABCDEF', 'double')).rejects.toThrow('help_already_used');
    expect(primeGame).not.toHaveBeenCalled();
  });
});

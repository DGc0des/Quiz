// Tests for the join path (src/utils/joinGame.ts), which replaced the old
// updateGame-based join: once SELECT is membership-scoped (migration 0002) a
// non-member cannot read a game in order to add themselves, so joining goes
// through the SECURITY DEFINER `join_game` RPC instead.

const rpc = jest.fn();

jest.mock('../config/supabase', () => ({
  supabase: { rpc: (...args: any[]) => rpc(...args) },
}));

const primeGame = jest.fn();
jest.mock('../hooks/useGame', () => ({ primeGame: (...args: any[]) => primeGame(...args) }));

import {
  joinGame,
  JOIN_ERROR_MESSAGES,
  type JoinFailureReason,
} from '../utils/joinGame';

beforeEach(() => {
  rpc.mockReset();
  primeGame.mockReset();
});

describe('joinGame', () => {
  it('sends the code and name, and never sends a playerId', async () => {
    const game = { id: 'ABCDEF', players: {}, version: 1 };
    rpc.mockResolvedValue({ data: { ok: true, game }, error: null });

    await joinGame('ABCDEF', 'Μάκης');

    expect(rpc).toHaveBeenCalledWith('join_game', {
      p_code: 'ABCDEF',
      p_name: 'Μάκης',
    });
    // Identity comes from auth.uid() server-side — sending one would be a bug.
    const payload = rpc.mock.calls[0][1];
    expect(Object.keys(payload)).toEqual(['p_code', 'p_name']);
  });

  it('primes the shared game cache on success so the Lobby renders instantly', async () => {
    const game = { id: 'ABCDEF', players: { u1: {} }, version: 2 };
    rpc.mockResolvedValue({ data: { ok: true, game }, error: null });

    const result = await joinGame('ABCDEF', 'Μάκης');

    expect(result).toEqual({ ok: true, game });
    expect(primeGame).toHaveBeenCalledWith('ABCDEF', game);
  });

  it('passes refusals through without priming the cache', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'started' }, error: null });

    const result = await joinGame('ABCDEF', 'Μάκης');

    expect(result).toEqual({ ok: false, reason: 'started' });
    expect(primeGame).not.toHaveBeenCalled();
  });

  it('throws on a transport error so the screen can show its connection message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    await expect(joinGame('ABCDEF', 'Μάκης')).rejects.toMatchObject({
      message: 'network down',
    });
  });

  it('has a Greek message for every refusal reason the RPC can return', () => {
    // Mirrors the `reason` values in 0002_membership_scoped_rls.sql.
    const reasons: JoinFailureReason[] = ['not_found', 'started', 'full', 'invalid_name'];
    for (const reason of reasons) {
      expect(JOIN_ERROR_MESSAGES[reason]).toBeTruthy();
      // Greek, not a leaked English fallback.
      expect(JOIN_ERROR_MESSAGES[reason]).toMatch(/[Ͱ-Ͽ]/);
    }
    expect(Object.keys(JOIN_ERROR_MESSAGES).sort()).toEqual([...reasons].sort());
  });
});

// Tests for the optimistic-concurrency write helper (src/utils/updateGame.ts).
//
// Since Stage 2 (0004_validated_writes.sql) clients hold no UPDATE on `games`;
// every write goes through the `apply_game_update` RPC, which takes the row
// lock, checks the version, and validates the diff. The fake below mimics that
// contract: the version check and the four possible verdicts (ok / conflict /
// not_found | not_member / rejected). `verdict` lets a test stand in for the
// server's validation logic without reimplementing it here.

jest.mock('../config/supabase', () => {
  const store: Record<string, { data: any }> = {};
  const helpers = {
    store,
    seed(id: string, data: any) {
      store[id] = { data };
    },
    onBeforeWrite: null as null | (() => void),
    // Force the server's answer for a call, e.g. to simulate a rejection.
    verdict: null as null | ((next: any, current: any) => any | null),
    reads: 0,
  };

  const rpc = async (name: string, args: any) => {
    if (name !== 'apply_game_update') throw new Error(`unexpected rpc: ${name}`);
    if (helpers.onBeforeWrite) helpers.onBeforeWrite();

    const row = store[args.p_game_id];
    if (!row) return { data: { ok: false, reason: 'not_found' }, error: null };

    if (helpers.verdict) {
      const forced = helpers.verdict(args.p_next, row.data);
      if (forced) return { data: forced, error: null };
    }

    // Mirrors the RPC's version guard, including the legacy-row coalesce.
    const expected = (row.data.version ?? 0) + 1;
    if (args.p_next.version !== expected) {
      return { data: { ok: false, reason: 'conflict', game: row.data }, error: null };
    }

    store[args.p_game_id] = { data: args.p_next };
    return { data: { ok: true, game: args.p_next }, error: null };
  };

  const makeBuilder = () => {
    const op: any = { id: null };
    const builder: any = {
      select() {
        return builder;
      },
      eq(col: string, val: string) {
        if (col === 'id') op.id = val;
        return builder;
      },
      single() {
        helpers.reads++;
        const row = store[op.id];
        if (!row) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST116', message: 'not found' },
          });
        }
        return Promise.resolve({ data: { data: row.data }, error: null });
      },
    };
    return builder;
  };

  return {
    __helpers: helpers,
    supabase: { from: (_t: string) => makeBuilder(), rpc },
  };
});

import { updateGame, fetchGame, GameUpdateRejected } from '../utils/updateGame';

const helpers = (jest.requireMock('../config/supabase') as any).__helpers;

beforeEach(() => {
  for (const k of Object.keys(helpers.store)) delete helpers.store[k];
  helpers.onBeforeWrite = null;
  helpers.verdict = null;
  helpers.reads = 0;
});

describe('updateGame (server-validated optimistic concurrency)', () => {
  it('applies the mutation and bumps the version', async () => {
    helpers.seed('G1', { id: 'G1', version: 0, marker: 'a' });

    const result: any = await updateGame('G1', (g: any) => ({ ...g, marker: 'b' }));

    expect(result?.marker).toBe('b');
    expect(result?.version).toBe(1);
    expect(helpers.store['G1'].data).toEqual({ id: 'G1', version: 1, marker: 'b' });
  });

  it('returns null and writes nothing when the game does not exist', async () => {
    const result = await updateGame('MISSING', (g: any) => ({ ...g, x: 1 }));
    expect(result).toBeNull();
    expect(helpers.store['MISSING']).toBeUndefined();
  });

  it('does not write when the mutation aborts (returns null)', async () => {
    helpers.seed('G2', { id: 'G2', version: 3, marker: 'keep' });

    const result = await updateGame('G2', () => null);

    expect(result?.version).toBe(3); // unchanged base returned
    expect(helpers.store['G2'].data).toEqual({ id: 'G2', version: 3, marker: 'keep' });
  });

  it('retries on a version conflict and preserves the concurrent write', async () => {
    helpers.seed('G3', { id: 'G3', version: 0, players: { a: 1 } });

    let mutateCalls = 0;
    // Simulate another client writing (and bumping the version) once, right
    // before our first guarded write lands — this must NOT be lost.
    helpers.onBeforeWrite = () => {
      helpers.onBeforeWrite = null; // only interfere once
      helpers.store['G3'] = { data: { id: 'G3', version: 5, players: { a: 1, intruder: 1 } } };
    };

    const result = await updateGame('G3', (g: any) => {
      mutateCalls++;
      return { ...g, players: { ...g.players, me: 1 } };
    });

    expect(mutateCalls).toBe(2); // first attempt lost the race, retried once
    expect(result?.version).toBe(6); // bumped from the concurrent version (5)
    expect(result?.players).toEqual({ a: 1, intruder: 1, me: 1 }); // both writes survive
    expect(helpers.store['G3'].data).toEqual(result);
  });

  it('re-applies a conflict from the blob the server returned, without re-reading', async () => {
    helpers.seed('G3b', { id: 'G3b', version: 0, n: 0 });
    helpers.onBeforeWrite = () => {
      helpers.onBeforeWrite = null;
      helpers.store['G3b'] = { data: { id: 'G3b', version: 4, n: 99 } };
    };

    // `base` is supplied, so the happy path does no read at all; the conflict
    // path must not add one either — the RPC hands back the current state.
    const base = { id: 'G3b', version: 0, n: 0 } as any;
    const result: any = await updateGame('G3b', (g: any) => ({ ...g, n: g.n + 1 }), { base });

    expect(result.n).toBe(100); // re-applied on top of the concurrent value
    expect(helpers.reads).toBe(0);
  });

  it('self-heals a legacy row that has no version field', async () => {
    helpers.seed('G4', { id: 'G4', marker: 'old' }); // no `version`

    const result = await updateGame('G4', (g: any) => ({ ...g, marker: 'new' }));

    expect(result?.version).toBe(1);
    expect(helpers.store['G4'].data).toEqual({ id: 'G4', version: 1, marker: 'new' });
  });

  it('fetchGame returns null for a missing row', async () => {
    expect(await fetchGame('NOPE')).toBeNull();
  });

  // Stage 2 replaced the RLS-filtered `UPDATE … RETURNING` with a SECURITY
  // DEFINER function, so a write that removes the writer now returns the new
  // state normally. Under Stage 1 alone this came back as `null` because the
  // writer could no longer read the row it had just written.
  it('returns the new state even when the write removes the writer', async () => {
    helpers.seed('G5', { id: 'G5', version: 0, players: { me: 1, other: 1 } });

    const result: any = await updateGame('G5', (g: any) => {
      const players = { ...g.players };
      delete players.me;
      return { ...g, players };
    });

    expect(result?.players).toEqual({ other: 1 });
    expect(result?.version).toBe(1);
  });

  it('throws GameUpdateRejected when the server refuses the write as illegal', async () => {
    helpers.seed('G6', { id: 'G6', version: 0, players: { me: { score: 0 } } });
    helpers.verdict = () => ({
      ok: false,
      reason: 'rejected',
      detail: 'score delta out of range',
    });

    await expect(
      updateGame('G6', (g: any) => ({
        ...g,
        players: { me: { score: 9999 } },
      })),
    ).rejects.toBeInstanceOf(GameUpdateRejected);

    // …and the write did not land.
    expect(helpers.store['G6'].data.version).toBe(0);
  });

  it('returns null when the caller is no longer a member', async () => {
    helpers.seed('G7', { id: 'G7', version: 0 });
    helpers.verdict = () => ({ ok: false, reason: 'not_member' });

    expect(await updateGame('G7', (g: any) => ({ ...g, x: 1 }))).toBeNull();
  });

  it('gives up after too many conflicts instead of spinning forever', async () => {
    helpers.seed('G8', { id: 'G8', version: 0, n: 0 });
    // Every attempt loses the race.
    helpers.verdict = (_next: any, current: any) => ({
      ok: false,
      reason: 'conflict',
      game: { ...current, version: current.version + 1 },
    });

    await expect(updateGame('G8', (g: any) => ({ ...g, n: g.n + 1 }))).rejects.toThrow(
      /too many write conflicts/,
    );
  });
});

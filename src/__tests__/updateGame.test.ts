// Tests for the optimistic-concurrency write helper (src/utils/updateGame.ts).
// A fake Supabase mimics PostgREST: the version-guarded UPDATE matches 0 rows
// when the stored version no longer equals the guard, exactly like
// `.eq('data->>version', N)` against a row another client already advanced.

jest.mock('../config/supabase', () => {
  const store: Record<string, { data: any }> = {};
  const helpers = {
    store,
    seed(id: string, data: any) {
      store[id] = { data };
    },
    onBeforeWrite: null as null | (() => void),
  };

  const resolveRead = (op: any) => {
    const row = store[op.id];
    if (!row) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
    return { data: { data: row.data }, error: null };
  };

  const resolveWrite = (op: any) => {
    if (helpers.onBeforeWrite) helpers.onBeforeWrite();
    const row = store[op.id];
    if (!row) return { data: [], error: null };
    const stored = row.data.version;
    const matches =
      op.versionGuard === null ? stored == null : String(stored ?? 0) === op.versionGuard;
    if (!matches) return { data: [], error: null }; // conflict
    store[op.id] = { data: op.payload.data };
    return { data: [{ data: op.payload.data }], error: null };
  };

  const makeBuilder = () => {
    const op: any = { type: null, id: null, versionGuard: undefined, payload: null };
    const builder: any = {
      select(_cols: string) {
        if (op.type === 'update') return Promise.resolve(resolveWrite(op));
        op.type = 'select';
        return builder;
      },
      update(payload: any) {
        op.type = 'update';
        op.payload = payload;
        return builder;
      },
      eq(col: string, val: string) {
        if (col === 'id') op.id = val;
        else if (col === 'data->>version') op.versionGuard = val;
        return builder;
      },
      is(col: string, val: null) {
        if (col === 'data->>version' && val === null) op.versionGuard = null;
        return builder;
      },
      single() {
        return Promise.resolve(resolveRead(op));
      },
    };
    return builder;
  };

  return {
    __helpers: helpers,
    supabase: { from: (_t: string) => makeBuilder() },
  };
});

import { updateGame, fetchGame } from '../utils/updateGame';

const helpers = (jest.requireMock('../config/supabase') as any).__helpers;

beforeEach(() => {
  for (const k of Object.keys(helpers.store)) delete helpers.store[k];
  helpers.onBeforeWrite = null;
});

describe('updateGame (optimistic concurrency)', () => {
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

  it('self-heals a legacy row that has no version field', async () => {
    helpers.seed('G4', { id: 'G4', marker: 'old' }); // no `version`

    const result = await updateGame('G4', (g: any) => ({ ...g, marker: 'new' }));

    expect(result?.version).toBe(1);
    expect(helpers.store['G4'].data).toEqual({ id: 'G4', version: 1, marker: 'new' });
  });

  it('fetchGame returns null for a missing row', async () => {
    expect(await fetchGame('NOPE')).toBeNull();
  });
});

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { ensureAnonymousUserId } from '../utils/anonymousSession';

const auth = (session: unknown, sessionError: unknown, signIn = { data: { user: { id: 'fresh' } }, error: null as unknown }) => ({
  getSession: jest.fn().mockResolvedValue({ data: { session }, error: sessionError }),
  signInAnonymously: jest.fn().mockResolvedValue(signIn),
});

describe('ensureAnonymousUserId', () => {
  it('reuses a stored session without signing in again', async () => {
    const a = auth({ user: { id: 'stored' } }, null);
    await expect(ensureAnonymousUserId(a)).resolves.toBe('stored');
    expect(a.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in on a first launch', async () => {
    const a = auth(null, null);
    await expect(ensureAnonymousUserId(a)).resolves.toBe('fresh');
  });

  it('starts a fresh identity when the server rejects the stored one (purged user)', async () => {
    const a = auth(null, new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'));
    await expect(ensureAnonymousUserId(a)).resolves.toBe('fresh');
    expect(a.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure instead of discarding the stored identity', async () => {
    const offline = new AuthRetryableFetchError('Failed to fetch', 0);
    const a = auth({ user: { id: 'stored' } }, offline);
    await expect(ensureAnonymousUserId(a)).rejects.toBe(offline);
    expect(a.signInAnonymously).not.toHaveBeenCalled();
  });

  it('surfaces a failed sign-in', async () => {
    const refusal = new AuthApiError('Anonymous sign-ins are disabled', 422, 'anonymous_provider_disabled');
    const a = auth(null, null, { data: { user: null } as never, error: refusal });
    await expect(ensureAnonymousUserId(a)).rejects.toBe(refusal);
  });
});

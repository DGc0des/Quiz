import { isAuthApiError } from '@supabase/supabase-js';

type AuthLike = {
  getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
  signInAnonymously(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
};

/**
 * The anonymous identity every screen needs, restored or created.
 *
 * Two failures look alike but must not be treated alike (review finding R1):
 *  - a network error keeps the stored session, so it is thrown and AuthGate
 *    shows its "no connection" screen with a retry;
 *  - an auth API error means the server rejected the stored session (the
 *    anonymous user was purged after 30 days idle, or revoked). supabase-js has
 *    already discarded it, so a fresh anonymous identity is created at once
 *    instead of telling the player to check their internet.
 */
export async function ensureAnonymousUserId(auth: AuthLike): Promise<string> {
  const { data, error } = await auth.getSession();
  if (error && !isAuthApiError(error)) throw error;
  const existing = error ? null : data.session?.user?.id ?? null;
  if (existing) return existing;

  const { data: signedIn, error: signInError } = await auth.signInAnonymously();
  if (signInError) throw signInError;
  const id = signedIn.user?.id;
  if (!id) throw new Error('No user id after anonymous sign-in');
  return id;
}

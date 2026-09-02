import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

// Module-level mirror of the session's user id, following the same shared-cache
// pattern as `useGame` / `useGamePresence`. Screens need the id synchronously
// during render (it seeds `playerId`), and `AuthGate` guarantees a session
// exists before any of them mount.
let currentUserId: string | null = null;

/**
 * The current player's id — the anonymous `auth.uid()`. Safe to call from any
 * screen: `AuthGate` blocks rendering until the session resolves. Throws if
 * called outside that gate, which would be a wiring bug rather than a runtime
 * condition to handle.
 */
export function getCurrentUserId(): string {
  if (!currentUserId) {
    throw new Error('getCurrentUserId() called before the auth session was ready');
  }
  return currentUserId;
}

/**
 * Establishes the anonymous Supabase session the whole app depends on.
 *
 * Every game write is authorized by RLS against `auth.uid()`, and a player's
 * `playerId` *is* that uid — so nothing in the app works until a session exists.
 * The session is persisted (see `config/supabase.ts`), so this usually resolves
 * from storage without a network round-trip; `signInAnonymously` only runs on a
 * genuinely first launch (or after the stored session is cleared).
 *
 * `App.tsx` holds the navigator until this resolves, which also guarantees that
 * every realtime channel (`useGame`, `useGamePresence`) is opened with an
 * authenticated token rather than the bare anon key.
 */
export function useAuthSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;

    // Keep the id in step with token refreshes and any future sign-out.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session?.user) return;
      currentUserId = session.user.id;
      setUserId(session.user.id);
    });

    (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        let id = data.session?.user?.id ?? null;
        if (!id) {
          const { data: signedIn, error: signInError } =
            await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
          id = signedIn.user?.id ?? null;
        }
        if (!id) throw new Error('No user id after anonymous sign-in');

        if (!active) return;
        currentUserId = id;
        setUserId(id);
        setLoading(false);
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'auth-error');
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  return { userId, loading, error, retry };
}

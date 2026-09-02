import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Read from EXPO_PUBLIC_* env vars (see .env / .env.example). Expo inlines these
// into the client bundle at build time. The anon key is public-by-design; RLS is
// what protects the data.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Copy .env.example to .env and set ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // The session MUST persist: `playerId` is the anonymous `auth.uid()`, and the
    // RLS policies only let a member read/write their own game. A fresh session
    // per launch would mint a new user id, locking the player out of a game they
    // are still in and leaving orphaned rows in `auth.users`.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // React Native has no URL to parse a session from
  },
});

// Supabase only refreshes tokens while the app is in the foreground; without this
// a game resumed after a long background stretch would write with a stale JWT.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

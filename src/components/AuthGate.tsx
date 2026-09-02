import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuthSession } from '../hooks/useAuthSession';
import { C, F } from '../theme';

/**
 * Holds the app until an anonymous Supabase session exists.
 *
 * This is a hard gate, not a nicety: `playerId` is the session's `auth.uid()`,
 * and the RLS policies authorize every read and write against it. Rendering the
 * navigator early would also let `useGame` / `useGamePresence` open realtime
 * channels carrying the pre-auth token.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { userId, loading, error, retry } = useAuthSession();

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (error || !userId) {
    return (
      <View style={s.container}>
        <Text style={s.emoji}>📡</Text>
        <Text style={s.title}>Δεν υπάρχει σύνδεση</Text>
        <Text style={s.subtitle}>
          Δεν μπορέσαμε να συνδεθούμε στον διακομιστή. Ελέγξτε τη σύνδεσή σας στο internet
          και δοκιμάστε ξανά.
        </Text>
        <TouchableOpacity style={s.button} onPress={retry} activeOpacity={0.85}>
          <Text style={s.buttonText}>Δοκιμάστε ξανά</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontFamily: F.extraBold,
    fontSize: 24,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: F.sansMedium,
    fontSize: 15,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 36,
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  buttonText: {
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.primaryInk,
  },
});

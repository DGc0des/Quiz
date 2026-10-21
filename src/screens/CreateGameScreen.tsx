import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { createGame, GameRpcRefused } from '../utils/gameRpc';
import { describeWriteError } from '../utils/reportWriteError';
import { generateGameId } from '../utils/gameId';
import { getCurrentUserId } from '../hooks/useAuthSession';
import { C, F } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGame'>;

/**
 * Greek message for a failed creation. The two server refusals are not worth a
 * retry, so they say what to do instead; everything else falls back to the
 * shared write-error wording (network, stale build, permission).
 */
function createErrorMessage(e: unknown): { message: string; retryable: boolean } {
  if (e instanceof GameRpcRefused && e.reason === 'name_not_allowed') {
    return { message: 'Αυτό το όνομα δεν επιτρέπεται. Γύρνα πίσω και διάλεξε άλλο.', retryable: false };
  }
  if (e instanceof GameRpcRefused && e.reason === 'too_many_games') {
    return { message: 'Έχεις ήδη ανοίξει πολλές αίθουσες. Δοκίμασε ξανά σε λίγο.', retryable: false };
  }
  return { message: describeWriteError(e), retryable: true };
}

export default function CreateGameScreen({ route, navigation }: Props) {
  const [gameId] = useState(generateGameId);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    createGame(gameId, route.params.playerName).then(() => {
      if (active) navigation.replace('Lobby', { gameId, playerId: getCurrentUserId() });
    }).catch((e: unknown) => { if (active) setError(createErrorMessage(e)); });
    return () => { active = false; };
  }, [attempt, gameId, navigation, route.params.playerName]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 24 }}>
        {!error && <ActivityIndicator size="large" color={C.primary} />}
        <Text accessibilityLiveRegion="polite" style={{ color: C.ink, fontFamily: F.sansSemiBold, textAlign: 'center' }}>
          {error ? error.message : 'Δημιουργία αίθουσας…'}
        </Text>
        {error && <>
          {error.retryable && (
            <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(n => n + 1)} style={{ padding: 16 }}>
              <Text style={{ color: C.primary }}>Δοκίμασε ξανά</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={{ padding: 16 }}>
            <Text style={{ color: C.ink }}>Πίσω</Text>
          </TouchableOpacity>
        </>}
      </View>
    </SafeAreaView>
  );
}

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { createGame } from '../utils/gameRpc';
import { generateGameId } from '../utils/gameId';
import { getCurrentUserId } from '../hooks/useAuthSession';
import { C, F } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGame'>;
export default function CreateGameScreen({ route, navigation }: Props) {
  const [gameId] = useState(generateGameId);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    createGame(gameId, route.params.playerName).then(() => {
      if (active) navigation.replace('Lobby', { gameId, playerId: getCurrentUserId() });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt, gameId, navigation, route.params.playerName]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 24 }}>
        {!error && <ActivityIndicator size="large" color={C.primary} />}
        <Text style={{ color: C.ink, fontFamily: F.sansSemiBold, textAlign: 'center' }}>
          {error ? 'Δεν ήταν δυνατή η δημιουργία παιχνιδιού.' : 'Δημιουργία αίθουσας…'}
        </Text>
        {error && <>
          <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(n => n + 1)} style={{ padding: 16 }}>
            <Text style={{ color: C.primary }}>Δοκίμασε ξανά</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={{ padding: 16 }}>
            <Text style={{ color: C.ink }}>Πίσω</Text>
          </TouchableOpacity>
        </>}
      </View>
    </SafeAreaView>
  );
}

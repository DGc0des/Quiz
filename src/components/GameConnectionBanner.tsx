import { useEffect } from 'react';
import { Game } from '../types';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../hooks/useGame';
import { C, F } from '../theme';

export function GameConnectionBanner({ gameId, onHome, onSync }: { gameId: string; onHome: () => void; onSync: (game: Game) => void }) {
  const { game, connection, error, retry } = useGame(gameId);
  useEffect(() => { if (game && connection === 'connected') onSync(game); }, [game, connection, onSync]);
  const insets = useSafeAreaInsets();
  if (connection === 'connected' && error !== 'not-found') return null;
  const unavailable = error === 'not-found';
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {unavailable ? 'Το παιχνίδι δεν είναι πλέον διαθέσιμο.' : connection === 'connecting' ? 'Σύνδεση στο παιχνίδι…' : 'Επανασύνδεση… Ο χρόνος συνεχίζει να μετρά.'}
      </Text>
      <TouchableOpacity accessibilityRole="button" onPress={unavailable ? onHome : retry} style={styles.button}>
        <Text style={styles.action}>{unavailable ? 'Αρχική' : 'Δοκίμασε ξανά'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { backgroundColor: C.surface, paddingHorizontal: 20, paddingBottom: 8, borderBottomWidth: 1, borderColor: C.amber },
  text: { color: C.ink, fontFamily: F.sansMedium, fontSize: 13, textAlign: 'center' },
  button: { padding: 12, alignItems: 'center' },
  action: { color: C.amber, fontFamily: F.sansBold, fontSize: 13 },
});

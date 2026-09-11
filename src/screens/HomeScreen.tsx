import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getCurrentUserId } from '../hooks/useAuthSession';
import { readActiveGame, readPlayerName, savePlayerName, clearActiveGame, SavedGame } from '../utils/savedGame';
import { loadResumableGame } from '../utils/resumeGame';
import { gameDestination } from '../utils/gameFlow';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { C, F } from '../theme';
import { Blobs } from '../components/Blobs';
import { Logo } from '../components/Logo';
import { sanitizeName, NAME_MAX_LENGTH } from '../utils/sanitizeName';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [focused, setFocused] = useState(false);

  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const nameEdited = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    readPlayerName().then(name => { if (active && !nameEdited.current) setPlayerName(name); });
    readActiveGame(getCurrentUserId()).then(value => { if (active) setSaved(value); });
    return () => { active = false; };
  }, []));
  const resume = async () => {
    if (!saved || resuming) return;
    setResuming(true);
    setResumeError('');
    try {
      const game = await loadResumableGame(saved);
      const destination = game ? gameDestination(game, saved.playerId) : 'Home';
      if (!game || destination === 'Home') {
        await clearActiveGame(saved.gameId);
        setSaved(null);
        setResumeError('Το παιχνίδι δεν είναι πλέον διαθέσιμο.');
      } else {
        navigation.navigate(destination, { gameId: game.id, playerId: saved.playerId });
      }
    } catch {
      setResumeError('Δεν ήταν δυνατή η σύνδεση. Το παιχνίδι σου παραμένει αποθηκευμένο. Δοκίμασε ξανά.');
    } finally { setResuming(false); }
  };

  const trimmed = sanitizeName(playerName);

  return (
    <SafeAreaView style={styles.safe}>
      <Blobs />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Logo size={120} />
          {saved && (
            <TouchableOpacity accessibilityRole="button" style={[styles.resumeCard, resuming && styles.disabled]} disabled={resuming} onPress={resume}>
              <Text style={styles.ghostBtnText}>{resuming ? 'Σύνδεση…' : 'Συνέχεια παιχνιδιού →'}</Text>
              <Text style={styles.resumeHint}>Κωδικός {saved.gameId}</Text>
            </TouchableOpacity>
          )}
          {!!resumeError && <Text accessibilityLiveRegion="polite" style={styles.resumeError}>{resumeError}</Text>}

          <TextInput
            style={[styles.input, focused && styles.inputFocused]}
            placeholder="Εισάγετε το όνομά σας"
            placeholderTextColor={C.inkMute}
            value={playerName}
            onChangeText={name => { nameEdited.current = true; setPlayerName(name); }}
            maxLength={NAME_MAX_LENGTH}
            autoCapitalize="words"
            returnKeyType="done"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, !trimmed && styles.disabled]}
            disabled={!trimmed}
            activeOpacity={0.8}
            onPress={() => { void savePlayerName(trimmed); navigation.navigate('CreateGame', { playerName: trimmed }); }}
          >
            <View style={styles.primaryBtnInner}>
              <Text style={styles.primaryBtnText}>Δημιουργία Παιχνιδιού</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ghostBtn, !trimmed && styles.disabled]}
            disabled={!trimmed}
            activeOpacity={0.8}
            onPress={() => { void savePlayerName(trimmed); navigation.navigate('JoinGame', { playerName: trimmed }); }}
          >
            <Text style={styles.ghostBtnText}>Είσοδος σε Παιχνίδι</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  resumeCard: { width: '100%', padding: 18, backgroundColor: C.surface, borderColor: C.primary, borderWidth: 1.5, borderRadius: 18, marginBottom: 20, gap: 6 },
  resumeHint: { color: C.inkSoft, fontFamily: F.sans, fontSize: 13 },
  resumeError: { color: C.inkSoft, textAlign: 'center', marginBottom: 16, fontFamily: F.sans },
  safe: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  input: {
    width: '100%',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontFamily: F.sansMedium,
    fontSize: 16,
    color: C.ink,
    marginBottom: 20,
  },
  inputFocused: {
    borderColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtn: {
    width: '100%',
    marginBottom: 12,
  },
  primaryBtnInner: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  primaryBtnText: {
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.primaryInk,
  },
  ghostBtn: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.primary,
    backgroundColor: 'transparent',
  },
  ghostBtnText: {
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.primary,
  },
  disabled: {
    opacity: 0.4,
  },
});

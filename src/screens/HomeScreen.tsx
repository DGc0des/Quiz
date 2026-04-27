import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { C, F } from '../theme';
import { Blobs } from '../components/Blobs';
import { Mascot } from '../components/Mascot';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [focused, setFocused] = useState(false);

  const trimmed = playerName.trim();

  return (
    <SafeAreaView style={styles.safe}>
      <Blobs />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Mascot size={132} mood="happy" />

        <Text style={styles.title}>Κουίζ</Text>
        <Text style={styles.subtitle}>Το παιχνίδι γνώσεων</Text>

        <TextInput
          style={[styles.input, focused && styles.inputFocused]}
          placeholder="Εισάγετε το όνομά σας"
          placeholderTextColor={C.inkMute}
          value={playerName}
          onChangeText={setPlayerName}
          maxLength={20}
          autoCapitalize="words"
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, !trimmed && styles.disabled]}
          disabled={!trimmed}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('CreateGame', { playerName: trimmed })}
        >
          <View style={styles.primaryBtnInner}>
            <Text style={styles.primaryBtnText}>Δημιουργία Παιχνιδιού</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ghostBtn, !trimmed && styles.disabled]}
          disabled={!trimmed}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('JoinGame', { playerName: trimmed })}
        >
          <Text style={styles.ghostBtnText}>Είσοδος σε Παιχνίδι</Text>
        </TouchableOpacity>

        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  title: {
    fontFamily: F.extraBold,
    fontSize: 44,
    color: C.primary,
    marginTop: 16,
  },
  subtitle: {
    fontFamily: F.sans,
    fontSize: 14,
    color: C.inkSoft,
    marginBottom: 28,
    marginTop: 4,
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
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.inkMute,
    opacity: 0.4,
  },
  dotActive: {
    backgroundColor: C.primary,
    opacity: 1,
  },
});

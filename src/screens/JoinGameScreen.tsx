import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { updateGame } from '../utils/updateGame';
import { parseGameCodeFromScanPayload } from '../utils/gameId';
import { RootStackParamList } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Mascot } from '../components/Mascot';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinGame'>;

const CODE_LENGTH = 6;

export default function JoinGameScreen({ route, navigation }: Props) {
  const { playerName, gameCode: initialCode } = route.params;
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState(playerName ?? '');
  const needsName = !playerName; // opened via deep link → no name was entered yet
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const hiddenInputRef = useRef<TextInput>(null);

  const handleJoin = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Εισάγετε το όνομά σας.');
      return;
    }
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Ο κωδικός πρέπει να είναι 6 χαρακτήρες.');
      return;
    }
    setLoading(true);
    setError('');

    const playerId = uuidv4();
    try {
      const result = await updateGame(trimmed, (g) => {
        if (g.status !== 'lobby') return null; // exists but already started
        if (playerId in g.players) return g; // idempotent
        return {
          ...g,
          players: {
            ...g.players,
            [playerId]: {
              id: playerId,
              name: trimmedName,
              score: 0,
              isHost: false,
              joinedAt: Date.now(),
              usedHelps: { fifty: false, steal: false, double: false, sabotage: false },
            },
          },
        };
      });

      if (result === null) {
        setError('Το παιχνίδι δεν βρέθηκε.');
        setLoading(false);
        return;
      }
      if (!(playerId in result.players)) {
        setError('Το παιχνίδι έχει ήδη ξεκινήσει.');
        setLoading(false);
        return;
      }
      navigation.replace('Lobby', { gameId: trimmed, playerId });
    } catch {
      setError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
      setLoading(false);
    }
  };

  const handleScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setScanning(true);
  };

  if (scanning) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const code = parseGameCodeFromScanPayload(data);
            if (code) {
              setCode(code);
              setScanning(false);
            }
          }}
        />
        <TouchableOpacity style={s.cancelScan} onPress={() => setScanning(false)}>
          <Text style={s.cancelScanText}>Ακύρωση</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const codeChars = code.split('');

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.topRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={s.eyebrow}>Είσοδος</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={s.center}>
          <Mascot size={88} mood="think" />
          <Text style={s.title}>Είσοδος</Text>
          <Text style={s.subtitle}>Εισάγετε τον κωδικό ή σαρώστε το QR</Text>

          {needsName && (
            <TextInput
              style={s.nameInput}
              placeholder="Το όνομά σας"
              placeholderTextColor={C.inkMute}
              value={name}
              onChangeText={setName}
              maxLength={20}
              autoCapitalize="words"
              returnKeyType="done"
              autoCorrect={false}
            />
          )}

          <TextInput
            ref={hiddenInputRef}
            style={s.hiddenInput}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            maxLength={CODE_LENGTH}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={handleJoin}
            autoCorrect={false}
            caretHidden
          />

          <Pressable style={s.otpRow} onPress={() => hiddenInputRef.current?.focus()}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
              const filled = i < codeChars.length;
              const isActive = i === codeChars.length;
              return (
                <View
                  key={i}
                  style={[
                    s.otpBox,
                    SHADOW.card,
                    (isActive || (i === CODE_LENGTH - 1 && codeChars.length === CODE_LENGTH))
                      && s.otpBoxActive,
                  ]}
                >
                  <Text style={s.otpChar}>{filled ? codeChars[i] : ''}</Text>
                </View>
              );
            })}
          </Pressable>

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity style={s.ghostBtn} onPress={handleScan}>
            <Text style={s.ghostBtnText}>📷  Σάρωση QR κώδικα</Text>
          </TouchableOpacity>

          <View style={{ width: '100%' }}>
            <TouchableOpacity
              style={[s.primaryBtn, (!code.trim() || !name.trim() || loading) && s.disabled]}
              disabled={!code.trim() || !name.trim() || loading}
              onPress={handleJoin}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={C.primaryInk} />
              ) : (
                <Text style={s.primaryBtnText}>Είσοδος</Text>
              )}
            </TouchableOpacity>
            <View style={s.primaryBtnShadow} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, paddingHorizontal: 28 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.card,
  },
  backBtnText: {
    fontSize: 18,
    color: C.ink,
    fontFamily: F.sansBold,
    marginTop: -1,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontSize: 11,
    fontFamily: F.sansBold,
    color: C.inkMute,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: F.bold,
    color: C.ink,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: F.sansMedium,
    color: C.inkSoft,
    textAlign: 'center',
    marginBottom: 4,
  },
  nameInput: {
    width: '100%',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: F.sansMedium,
    fontSize: 16,
    color: C.ink,
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  otpBox: {
    flex: 1,
    maxWidth: 46,
    aspectRatio: 1 / 1.15,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: C.primary,
  },
  otpChar: {
    fontFamily: F.extraBold,
    fontSize: 26,
    color: C.primary,
  },
  error: {
    color: C.primary,
    fontSize: 14,
    fontFamily: F.sansMedium,
    textAlign: 'center',
  },
  ghostBtn: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: C.primary,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    width: '100%',
  },
  ghostBtnText: {
    color: C.primary,
    fontFamily: F.sansBold,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: 'center',
    width: '100%',
    ...SHADOW.glow,
  },
  primaryBtnShadow: {
    position: 'absolute',
    bottom: -5,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: C.primaryDark,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    zIndex: -1,
  },
  primaryBtnText: {
    color: C.primaryInk,
    fontFamily: F.sansBold,
    fontSize: 16,
  },
  disabled: { opacity: 0.4 },
  cancelScan: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
  },
  cancelScanText: {
    color: C.primaryInk,
    fontFamily: F.sansBold,
    fontSize: 16,
  },
});

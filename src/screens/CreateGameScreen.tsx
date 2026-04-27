import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Share,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../config/supabase';
import { generateGameId } from '../utils/gameId';
import { RootStackParamList } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGame'>;

export default function CreateGameScreen({ route, navigation }: Props) {
  const { playerName } = route.params;
  const [gameId] = useState(() => generateGameId());
  const [playerId] = useState(() => uuidv4());
  const [creating, setCreating] = useState(true);
  const [createError, setCreateError] = useState('');
  const [copied, setCopied] = useState(false);

  const deepLink = `quizapp://join/${gameId}`;

  useEffect(() => {
    const create = async () => {
      const { error } = await supabase.from('games').insert({
        id: gameId,
        data: {
          id: gameId,
          status: 'lobby',
          players: {
            [playerId]: {
              id: playerId,
              name: playerName,
              score: 0,
              isHost: true,
              joinedAt: Date.now(),
            },
          },
          turnOrder: [],
          currentTurnIndex: 0,
          currentTurn: null,
          createdAt: Date.now(),
          winnerId: null,
          rematchGameId: null,
        },
      });
      if (error) setCreateError(error.message);
      setCreating(false);
    };
    create();
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await Share.share({
      message: `Έλα στο κουίζ μου! Κώδικας: ${gameId}\nή άνοιξε: ${deepLink}`,
    });
  };

  if (creating) {
    return (
      <SafeAreaView style={styles.safe}>
        <Blobs />
        <ActivityIndicator size="large" color={C.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (createError) {
    return (
      <SafeAreaView style={styles.safe}>
        <Blobs />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Σφάλμα δημιουργίας παιχνιδιού:</Text>
          <Text style={styles.errorMsg}>{createError}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
          >
            <View style={styles.primaryBtnInner}>
              <Text style={styles.primaryBtnText}>Πίσω</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Blobs />
      <View style={styles.container}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.eyebrow}>ΝΈΟ ΠΑΙΧΝΊΔΙ</Text>
        </View>

        <Text style={styles.title}>Πρόσκαλεσε φίλους</Text>
        <Text style={styles.subtitle}>
          Μοιράσου τον κωδικό ή σκάναρε το QR για να μπουν στο παιχνίδι
        </Text>

        {/* QR Code */}
        <View style={styles.qrOuter}>
          <QRCode value={deepLink} size={180} color={C.bg} backgroundColor="#ffffff" />
        </View>

        {/* Code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Κωδικός παιχνιδιού</Text>
          <Text style={styles.codeText}>{gameId}</Text>
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.softBtn}
            activeOpacity={0.7}
            onPress={handleCopy}
          >
            <Text style={styles.softBtnText}>
              {copied ? '✓ Αντιγράφηκε!' : '📋 Αντιγραφή'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.softBtn}
            activeOpacity={0.7}
            onPress={handleShare}
          >
            <Text style={styles.softBtnText}>↗ Κοινοποίηση</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />

        {/* Bottom CTA */}
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.8}
          onPress={() => navigation.replace('Lobby', { gameId, playerId })}
        >
          <View style={styles.primaryBtnInner}>
            <Text style={styles.primaryBtnText}>Μετάβαση στο Lobby →</Text>
          </View>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  errorTitle: {
    fontFamily: F.sansSemiBold,
    color: C.primary,
    fontSize: 16,
    textAlign: 'center',
  },
  errorMsg: {
    fontFamily: F.sans,
    color: C.ink,
    fontSize: 13,
    textAlign: 'center',
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
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
    marginTop: -1,
  },
  eyebrow: {
    fontFamily: F.sansBold,
    fontSize: 11,
    color: C.inkMute,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  /* Content */
  title: {
    fontFamily: F.bold,
    fontSize: 28,
    color: C.ink,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: F.sans,
    fontSize: 14,
    color: C.inkSoft,
    marginBottom: 24,
    lineHeight: 20,
  },

  /* QR */
  qrOuter: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
  },

  /* Code card */
  codeCard: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontFamily: F.sansMedium,
    fontSize: 12,
    color: C.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  codeText: {
    fontFamily: F.display,
    fontSize: 38,
    color: C.primary,
    letterSpacing: 12,
  },

  /* Action row */
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  softBtn: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    ...SHADOW.card,
  },
  softBtnText: {
    fontFamily: F.sansSemiBold,
    fontSize: 14,
    color: C.ink,
  },

  /* Primary CTA */
  primaryBtn: {
    width: '100%',
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
});

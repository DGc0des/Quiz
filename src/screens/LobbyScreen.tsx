import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { SeriesWins } from '../components/SeriesWins';
import { setGameMode, startTeamGame } from '../utils/gameRpc';
import { canEnableTeams, MIN_TEAM_PLAYERS } from '../utils/teams';
import { useGame } from '../hooks/useGame';
import { useGamePresence, leavePresence } from '../hooks/useGamePresence';
import { shuffle } from '../utils/shuffle';
import { leaveGame } from '../utils/leaveGame';
import { updateGame } from '../utils/updateGame';
import { runGameWrite } from '../utils/reportWriteError';
import { WIN_SCORE, WIN_SCORE_OPTIONS } from '../utils/scoring';
import { finishedDestination } from '../utils/gameFlow';
import { RootStackParamList, Player } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Avatar } from '../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

export default function LobbyScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game, loading, error } = useGame(gameId);

  const isHost = game?.players[playerId]?.isHost ?? false;
  const players = game ? Object.values(game.players).sort((a, b) => a.joinedAt - b.joinedAt) : [];

  const deepLink = `quizapp://join/${gameId}`;
  const [copied, setCopied] = useState(false);
  const [modePending, setModePending] = useState(false);

  const mode = game?.mode ?? 'solo';
  // The server re-checks this in set_game_mode and again in start_team_game —
  // players join and leave while the host is deciding.
  const teamsAllowed = canEnableTeams(players.length);

  useGamePresence(gameId, playerId, game ?? null);

  // Share / copy the invite — same pattern as CreateGameScreen.
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

  useEffect(() => {
    if (!game) return;
    if (game.status === 'turn_reveal') {
      navigation.replace('TurnReveal', { gameId, playerId });
    }
    if (game.status === 'finished') {
      const dest = finishedDestination(game, playerId);
      if (dest === 'Home') {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } else {
        navigation.replace(dest, { gameId, playerId });
      }
    }
  }, [game?.status]);

  const handleLeave = () => {
    if (!game) return;
    Alert.alert(
      'Έξοδος από το παιχνίδι;',
      'Αν φύγεις, η θέση σου χάνεται.',
      [
        { text: 'Ακύρωση', style: 'cancel' },
        {
          text: 'Έξοδος',
          style: 'destructive',
          onPress: async () => {
            // Leaving must never trap the player: if the write fails we say so
            // and go Home anyway — the presence janitor removes them server-side.
            await runGameWrite('Η έξοδος', () => leaveGame(gameId, playerId, game));
            leavePresence(gameId);
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          },
        },
      ],
    );
  };

  const winScore = game?.winScore ?? WIN_SCORE;

  const handleSetWinScore = async (score: number) => {
    if (!game || !isHost || winScore === score) return;
    await runGameWrite('Η αλλαγή ορίου', () =>
      updateGame(
        gameId,
        (g) => (g.status !== 'lobby' ? null : { ...g, winScore: score }),
        { base: game },
      ),
    );
  };

  const handleMode = async (next: 'solo' | 'teams') => {
    if (!game || modePending || next === mode) return;
    if (next === 'teams' && !teamsAllowed) return;
    setModePending(true);
    const { ok } = await runGameWrite('Η αλλαγή λειτουργίας', () => setGameMode(gameId, next));
    setModePending(false);
    if (!ok) return;
  };

  const handleStart = async () => {
    if (!game) return;
    // Team mode starts through its own RPC: the split decides who leads, so the
    // draw happens server-side rather than being posted by this client.
    if (mode === 'teams') {
      await runGameWrite('Η έναρξη', () => startTeamGame(gameId));
      return;
    }
    // `updateGame` primes the local cache on success, so the status-watching
    // effect above navigates to TurnReveal without waiting for the realtime echo
    // (which may never reach the writer).
    await runGameWrite('Η έναρξη', () =>
      updateGame(
        gameId,
        (g) => {
          if (g.status !== 'lobby') return null;
          const shuffled = shuffle(Object.values(g.players).map((p) => p.id));
          return { ...g, status: 'turn_reveal', turnOrder: shuffled, currentTurnIndex: 0 };
        },
        { base: game },
      ),
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={C.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (error && !game) {
    return (
      <SafeAreaView style={s.safe}>
        <Blobs />
        <View style={s.errorWrap}>
          <Text style={s.errorTitle}>
            {error === 'not-found'
              ? 'Το παιχνίδι δεν βρέθηκε.'
              : 'Σφάλμα σύνδεσης. Δοκιμάστε ξανά.'}
          </Text>
          <View>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Επιστροφή</Text>
            </TouchableOpacity>
            <View style={s.primaryBtnShadow} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // In team mode the lobby must also be even and at least 2v2, or the split
  // would be uneven — start_team_game refuses it anyway.
  const canStart = mode === 'teams' ? teamsAllowed : players.length >= 2;

  const hintText = isHost
    ? mode === 'teams' && !teamsAllowed
      ? `Οι ομάδες χρειάζονται ζυγό αριθμό παικτών (τουλάχιστον ${MIN_TEAM_PLAYERS})...`
      : players.length < 2
        ? 'Περίμενε τουλάχιστον έναν ακόμα παίκτη...'
        : 'Έτοιμοι! Πάτα Έναρξη για να ξεκινήσετε.'
    : 'Αναμονή ξεκινήματος από τον δημιουργό...';

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />
      <View style={s.container}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={handleLeave}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={s.eyebrow}>Αίθουσα Αναμονής</Text>
          <View style={{ width: 38 }} />
        </View>
        {/* Everything between the pinned header and the pinned action bar
            scrolls. It used to be a plain flex column with only the player
            FlatList able to scroll, so once the cards outgrew the screen the
            Έναρξη button was pushed off with no way to reach it — which is what
            happened as soon as SeriesWins started rendering (it is hidden until
            the first game is won). */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>Έτοιμοι;</Text>

          {/* Code + QR card — QR encodes the quizapp://join/ deep link so a generic phone camera opens the app (a raw code just triggers a web search); the in-app scanner accepts both forms */}
          <View style={[s.card, SHADOW.card]}>
            <View style={s.cardInner}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardEyebrow}>Κωδικός παιχνιδιού</Text>
                <Text style={s.codeText}>{gameId}</Text>
              </View>
              <View style={s.qrWrap}>
                <QRCode
                  value={deepLink}
                  size={56}
                  ecl="L"
                  backgroundColor="#ffffff"
                  color={C.bg}
                />
              </View>
            </View>
            <View style={s.shareRow}>
              <TouchableOpacity style={s.shareBtn} activeOpacity={0.75} onPress={handleCopy}>
                <Text style={s.shareBtnText}>{copied ? '✓ Αντιγράφηκε' : '📋 Αντιγραφή'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.shareBtn} activeOpacity={0.75} onPress={handleShare}>
                <Text style={s.shareBtnText}>📤 Κοινοποίηση</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Mode — host picks, others see it read-only */}
          <View style={[s.targetCard, SHADOW.card]}>
            <Text style={s.cardEyebrow}>👥 Λειτουργία</Text>
            <View style={s.segment}>
              {(['solo', 'teams'] as const).map((opt) => {
                const active = mode === opt;
                const blocked = opt === 'teams' && !teamsAllowed;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      s.segmentBtn,
                      active && s.segmentBtnActive,
                      blocked && s.segmentBtnBlocked,
                    ]}
                    activeOpacity={isHost && !blocked ? 0.7 : 1}
                    disabled={!isHost || blocked || modePending}
                    onPress={() => handleMode(opt)}
                  >
                    <Text style={[s.segmentText, active && s.segmentTextActive]}>
                      {opt === 'solo' ? 'Ατομικά' : 'Ομάδες'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!isHost ? (
              <Text style={s.targetHint}>Ορίζεται από τον δημιουργό</Text>
            ) : !teamsAllowed ? (
              <Text style={s.targetHint}>
                Οι ομάδες χρειάζονται ζυγό αριθμό παικτών (τουλάχιστον {MIN_TEAM_PLAYERS})
              </Text>
            ) : mode === 'teams' ? (
              <Text style={s.targetHint}>
                Δύο ισάριθμες ομάδες, ένας αρχηγός η καθεμία — κληρώνονται στην έναρξη
              </Text>
            ) : null}
          </View>

          {/* Target score — host picks, others see it read-only */}
          <View style={[s.targetCard, SHADOW.card]}>
            <Text style={s.cardEyebrow}>🎯 Όριο νίκης (βαθμοί)</Text>
            <View style={s.segment}>
              {WIN_SCORE_OPTIONS.map((opt) => {
                const active = winScore === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[s.segmentBtn, active && s.segmentBtnActive]}
                    activeOpacity={isHost ? 0.7 : 1}
                    disabled={!isHost}
                    onPress={() => handleSetWinScore(opt)}
                  >
                    <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!isHost && <Text style={s.targetHint}>Ορίζεται από τον δημιουργό</Text>}
          </View>

          <SeriesWins
            seriesWins={game?.seriesWins}
            players={game?.players ?? {}}
            selfId={playerId}
          />

          {/* Players header row */}
          <View style={s.playersHeader}>
            <Text style={s.eyebrowLeft}>Παίκτες ({players.length})</Text>
            <View style={s.liveChip}>
              <Text style={s.liveChipText}>●  Live</Text>
            </View>
          </View>

          {/* Player list — a plain map, not a FlatList: the lobby holds at most
              12 players, and nesting a VirtualizedList inside a ScrollView breaks
              virtualization and warns. */}
          {players.map((item: Player) => {
            const isSelf = item.id === playerId;
            return (
              <View key={item.id} style={[s.playerRow, SHADOW.card, isSelf && s.playerRowSelf]}>
                <Avatar name={item.name} size={38} />
                <View style={s.playerInfo}>
                  <Text style={s.playerName} numberOfLines={1}>
                    {item.name}{isSelf ? ' (εσύ)' : ''}
                  </Text>
                  <Text style={s.playerSub}>
                    {item.isHost ? '👑 Δημιουργός' : 'Έτοιμος'}
                  </Text>
                </View>
                {!item.isHost && <View style={s.greenDot} />}
              </View>
            );
          })}

          <View style={s.emptySlot}>
            <Text style={s.emptySlotText}>+ Περιμένουμε κι άλλους...</Text>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <Text style={s.hint}>{hintText}</Text>

          {isHost && (
            <View style={{ width: '100%', marginBottom: 16, gap: 10 }}>
              <View>
                <TouchableOpacity
                  style={[s.primaryBtn, !canStart && s.disabled]}
                  disabled={!canStart}
                  onPress={handleStart}
                  activeOpacity={0.85}
                >
                  <Text style={s.primaryBtnText}>▶  Έναρξη Παιχνιδιού</Text>
                </TouchableOpacity>
                <View style={s.primaryBtnShadow} />
              </View>
              {/* DEV ONLY — delete before release */}
              <TouchableOpacity style={s.devBtn} onPress={handleStart} activeOpacity={0.75}>
                <Text style={s.devBtnText}>🛠 Solo Test (DEV)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  errorTitle: {
    fontFamily: F.sansSemiBold,
    fontSize: 16,
    color: C.ink,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontSize: 11,
    fontFamily: F.sansBold,
    color: C.inkMute,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: F.bold,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 16,
  },

  card: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontSize: 10,
    fontFamily: F.sansBold,
    color: C.inkMute,
    marginBottom: 4,
  },
  codeText: {
    fontSize: 26,
    fontFamily: F.display,
    color: C.primary,
    letterSpacing: 6,
  },
  qrWrap: {
    width: 64,
    height: 64,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  shareRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  shareBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.bg,
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: F.sansBold,
    fontSize: 13,
    color: C.ink,
  },

  /* Target score selector */
  targetCard: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.bg,
    alignItems: 'center',
  },
  segmentBtnBlocked: { opacity: 0.35 },
  segmentBtnActive: {
    backgroundColor: C.primary,
    borderColor: C.primaryDark,
  },
  segmentText: {
    fontFamily: F.sansBold,
    fontSize: 18,
    color: C.ink,
  },
  segmentTextActive: {
    color: C.primaryInk,
  },
  targetHint: {
    fontFamily: F.sansMedium,
    fontSize: 12,
    color: C.inkMute,
    marginTop: 8,
  },

  playersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  eyebrowLeft: {
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontSize: 11,
    fontFamily: F.sansBold,
    color: C.inkMute,
  },
  liveChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.green,
  },
  liveChipText: {
    fontSize: 12,
    fontFamily: F.sansBold,
    color: C.greenFg,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  // Pinned: the primary action must never be scrolled out of reach.
  footer: { paddingTop: 4 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  playerRowSelf: {
    borderColor: C.primary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontFamily: F.sansBold,
    color: C.ink,
  },
  playerSub: {
    fontSize: 12,
    fontFamily: F.sansMedium,
    color: C.inkMute,
    marginTop: 1,
  },
  greenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.green,
  },

  emptySlot: {
    borderWidth: 1.5,
    borderColor: C.line,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptySlotText: {
    fontSize: 14,
    fontFamily: F.sansSemiBold,
    color: C.inkMute,
  },

  hint: {
    fontSize: 14,
    fontFamily: F.sansMedium,
    color: C.inkSoft,
    textAlign: 'center',
    marginVertical: 12,
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

  devBtn: {
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  devBtnText: {
    fontFamily: F.sansBold,
    fontSize: 14,
    color: '#f59e0b',
  },
});

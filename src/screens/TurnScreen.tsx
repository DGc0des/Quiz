import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useGame } from '../hooks/useGame';
import { useTimer } from '../hooks/useTimer';
import { pickQuestion, CATEGORIES } from '../data/questions';
import { leaveGame } from '../utils/leaveGame';
import { updateGame } from '../utils/updateGame';
import { useGamePresence, leavePresence } from '../hooks/useGamePresence';
import { RootStackParamList, Points, Category } from '../types';
import { C, F, SHADOW, CATEGORY_META } from '../theme';
import { Blobs } from '../components/Blobs';
import { ScoreRow } from '../components/ScoreRow';

type Props = NativeStackScreenProps<RootStackParamList, 'Turn'>;

/** Seconds the active player has to choose difficulty + category. */
const PICK_SECONDS = 60;

export default function TurnScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const insets = useSafeAreaInsets();
  const [selectedPoints, setSelectedPoints] = useState<Points | null>(null);

  const isMyTurn = game?.currentTurn?.activePlayerId === playerId;
  const activeName = game?.currentTurn ? game.players[game.currentTurn.activePlayerId]?.name : '';

  useGamePresence(gameId, playerId, game ?? null);

  // Pick-phase countdown. `timerStartedAt` is stamped when the turn enters
  // `picking` (and re-stamped for the question phase in handleSelectCategory),
  // so it doubles as the pick timer here. Older games may have it null → the
  // timer simply stays full and never fires (graceful no-op).
  const pickStartedAt =
    game?.currentTurn?.status === 'picking' ? game.currentTurn.timerStartedAt ?? null : null;
  const pickRemaining = useTimer(PICK_SECONDS, pickStartedAt);
  const autoPickedRef = useRef(false);

  // Reset the one-shot guard whenever a new pick phase begins.
  useEffect(() => {
    autoPickedRef.current = false;
  }, [pickStartedAt]);

  // On expiry, any client may auto-pick — `updateGame` is version-guarded so
  // only the first write lands; the rest abort (status no longer 'picking').
  useEffect(() => {
    if (!game || game.status !== 'picking' || pickStartedAt === null) return;
    if (pickRemaining > 0 || autoPickedRef.current) return;
    autoPickedRef.current = true;
    autoPick();
  }, [pickRemaining, game?.status, pickStartedAt]);

  const autoPick = async () => {
    await updateGame(
      gameId,
      (g) => {
        const ct = g.currentTurn;
        if (!ct || g.status !== 'picking' || ct.timerStartedAt == null) return null;
        // Re-check expiry inside the mutator (it may re-run on a retry).
        if (Date.now() - ct.timerStartedAt < PICK_SECONDS * 1000) return null;

        const usedIds = g.usedQuestionIds ?? [];
        const points = ((Math.floor(Math.random() * 3) + 1) as Points);
        // Try a random category first, then fall back to every other category so
        // an exhausted random pick doesn't stall the game (the pick timer has
        // already fired — there's no second chance to advance).
        const start = Math.floor(Math.random() * CATEGORIES.length);
        let question = null;
        for (let i = 0; i < CATEGORIES.length && !question; i++) {
          const category = CATEGORIES[(start + i) % CATEGORIES.length];
          question =
            pickQuestion(category, points, usedIds) ??
            pickQuestion(category, 1, usedIds) ??
            pickQuestion(category, 2, usedIds) ??
            pickQuestion(category, 3, usedIds);
        }
        if (!question) return null;

        return {
          ...g,
          status: 'question',
          usedQuestionIds: [...usedIds, question.id],
          currentTurn: {
            ...ct,
            selectedPoints: question.difficulty,
            selectedCategory: question.category,
            questionId: question.id,
            timerStartedAt: Date.now(),
            status: 'question',
          },
        };
      },
      { base: game },
    );
  };

  useEffect(() => {
    if (!game) return;
    if (game.status === 'question') navigation.replace('Question', { gameId, playerId });
    if (game.status === 'finished') {
      if (!game.winnerId) {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        return;
      }
      const isWinner = game.winnerId === playerId;
      navigation.replace(isWinner ? 'Winner' : 'Loser', { gameId, playerId });
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
            await leaveGame(gameId, playerId, game);
            leavePresence(gameId);
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          },
        },
      ],
    );
  };

  const handleSelectCategory = async (category: Category) => {
    if (!game || !isMyTurn || !selectedPoints) return;
    const points = selectedPoints;

    // Exhausted category → give feedback instead of a silent no-op. The mutator
    // below also returns null in this case, but `updateGame` can't distinguish
    // that from a concurrency abort, so we surface it here. This is reachable
    // (especially after a rematch, which carries `usedQuestionIds` over) when a
    // category has no unused questions left at any difficulty.
    const usedIds = game.usedQuestionIds ?? [];
    const hasQuestion =
      pickQuestion(category, points, usedIds) ??
      pickQuestion(category, 1, usedIds) ??
      pickQuestion(category, 2, usedIds) ??
      pickQuestion(category, 3, usedIds);
    if (!hasQuestion) {
      Alert.alert(
        'Τελείωσαν οι ερωτήσεις',
        'Αυτή η κατηγορία δεν έχει άλλες ερωτήσεις. Διάλεξε άλλη κατηγορία.',
      );
      return;
    }

    // `updateGame` primes the local cache, so the status-watching effect above
    // navigates to Question on its own — no echo wait, no stale-state bounce.
    await updateGame(
      gameId,
      (g) => {
        const ct = g.currentTurn;
        if (!ct || g.status !== 'picking' || ct.activePlayerId !== playerId) return null;

        const usedIds = g.usedQuestionIds ?? [];
        const question =
          pickQuestion(category, points, usedIds) ??
          pickQuestion(category, 1, usedIds) ??
          pickQuestion(category, 2, usedIds) ??
          pickQuestion(category, 3, usedIds);
        if (!question) return null;

        return {
          ...g,
          status: 'question',
          usedQuestionIds: [...usedIds, question.id],
          currentTurn: {
            ...ct,
            selectedPoints: points,
            selectedCategory: category,
            questionId: question.id,
            timerStartedAt: Date.now(),
            status: 'question',
          },
        };
      },
      { base: game },
    );
  };

  if (!game) return null;

  const sortedPlayers = Object.values(game.players).sort((a, b) => b.score - a.score);
  const activePlayerId = game.currentTurn?.activePlayerId;

  const showPickTimer = pickStartedAt !== null;
  const pickClock = `${Math.floor(pickRemaining / 60)}:${String(pickRemaining % 60).padStart(2, '0')}`;
  const pickTimerColor = pickRemaining > 10 ? C.amber : C.primary;

  const pointOptions: { pts: Points; bg: string; fg: string; label: string }[] = [
    { pts: 1, bg: C.green, fg: C.greenFg, label: 'εύκολο' },
    { pts: 2, bg: C.amber, fg: C.amberFg, label: 'μέτριο' },
    { pts: 3, bg: C.primary, fg: C.primaryInk, label: 'δύσκολο' },
  ];

  return (
    <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Blobs />
      <TouchableOpacity style={[s.leaveBtn, { top: insets.top + 8 }]} onPress={handleLeave} activeOpacity={0.7}>
        <Text style={s.leaveBtnText}>×</Text>
      </TouchableOpacity>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScoreRow players={sortedPlayers} selfId={playerId} activePlayerId={activePlayerId} />

        {showPickTimer && (
          <View style={s.timerWrap}>
            <View style={[s.timerPill, { borderColor: pickTimerColor }]}>
              <Text style={[s.timerText, { color: pickTimerColor }]}>⏱ {pickClock}</Text>
            </View>
            <Text style={s.timerHint}>
              {isMyTurn ? 'Διάλεξε πριν λήξει ο χρόνος!' : 'Χρόνος επιλογής'}
            </Text>
          </View>
        )}

        {isMyTurn ? (
          <>
            {/* Turn Header */}
            <View style={s.header}>
              <Text style={s.eyebrow}>ΣΕΙΡΑ</Text>
              <Text style={s.title}>Η σειρά σου!</Text>
              {!selectedPoints && <Text style={s.subtitle}>Επίλεξε πόντους</Text>}
            </View>

            {!selectedPoints ? (
              /* Point Buttons */
              <View style={s.pointsRow}>
                {pointOptions.map(({ pts, bg, fg, label }) => (
                  <TouchableOpacity
                    key={pts}
                    activeOpacity={0.8}
                    style={[s.pointCircle, { backgroundColor: bg }, SHADOW.card]}
                    onPress={() => setSelectedPoints(pts)}
                  >
                    <Text style={[s.pointNum, { color: fg }]}>{pts}</Text>
                    <Text style={[s.pointLabel, { color: fg }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              /* Category Selection */
              <View style={s.catSection}>
                <Text style={s.eyebrow}>ΕΠΙΛΕΞΕ ΚΑΤΗΓΟΡΙΑ</Text>
                <View style={s.catGrid}>
                  {CATEGORIES.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    return (
                      <TouchableOpacity
                        key={cat}
                        activeOpacity={0.8}
                        style={[s.catCard, SHADOW.card]}
                        onPress={() => handleSelectCategory(cat)}
                      >
                        <View style={[s.catIcon, { backgroundColor: meta?.bg ?? C.surface2 }]}>
                          <Text style={s.catIconText}>{meta?.ico ?? '❓'}</Text>
                        </View>
                        <Text style={s.catName}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={s.changeBtn}
                  onPress={() => setSelectedPoints(null)}
                >
                  <Text style={s.changeBtnText}>← Αλλαγή βαθμών</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          /* Waiting State */
          <View style={s.waiting}>
            <Text style={s.waitingName}>{activeName}</Text>
            <Text style={s.waitingText}>επιλέγει ερώτηση...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  leaveBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.card,
  },
  leaveBtnText: {
    fontSize: 20,
    color: C.inkSoft,
    marginTop: -1,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 40 },

  /* Pick timer */
  timerWrap: { alignItems: 'center', marginTop: 16, gap: 6 },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    ...SHADOW.card,
  },
  timerText: {
    fontFamily: F.display,
    fontSize: 22,
    letterSpacing: 1,
  },
  timerHint: {
    fontFamily: F.sansMedium,
    fontSize: 12,
    color: C.inkMute,
  },

  /* Turn Header */
  header: { alignItems: 'center', marginTop: 22 },
  eyebrow: {
    fontFamily: F.sansBold,
    fontSize: 11,
    color: C.inkMute,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  title: {
    fontFamily: F.bold,
    fontSize: 28,
    color: C.ink,
    textAlign: 'center',
    marginTop: 2,
  },
  subtitle: {
    fontFamily: F.sans,
    fontSize: 14,
    color: C.inkSoft,
    textAlign: 'center',
    marginTop: 4,
  },

  /* Point Buttons */
  pointsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  pointCircle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointNum: {
    fontFamily: F.display,
    fontSize: 44,
  },
  pointLabel: {
    fontFamily: F.sansBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: -2,
  },

  /* Category Section */
  catSection: { marginTop: 20, gap: 12 },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  catCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
  },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  catIconText: { fontSize: 18 },
  catName: {
    fontFamily: F.sansBold,
    fontSize: 15,
    color: C.ink,
    textAlign: 'center',
  },
  changeBtn: { alignSelf: 'center', marginTop: 4 },
  changeBtnText: {
    fontFamily: F.sansSemiBold,
    fontSize: 14,
    color: C.inkMute,
  },

  /* Waiting */
  waiting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 8,
  },
  waitingName: {
    fontFamily: F.bold,
    fontSize: 32,
    color: C.primary,
  },
  waitingText: {
    fontFamily: F.sans,
    fontSize: 18,
    color: C.inkSoft,
  },
});

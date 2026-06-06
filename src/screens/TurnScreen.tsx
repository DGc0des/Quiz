import { useState, useEffect } from 'react';
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
import { pickQuestion, CATEGORIES } from '../data/questions';
import { leaveGame } from '../utils/leaveGame';
import { updateGame } from '../utils/updateGame';
import { useGamePresence, leavePresence } from '../hooks/useGamePresence';
import { RootStackParamList, Points, Category } from '../types';
import { C, F, SHADOW, CATEGORY_META } from '../theme';
import { Blobs } from '../components/Blobs';
import { ScoreRow } from '../components/ScoreRow';

type Props = NativeStackScreenProps<RootStackParamList, 'Turn'>;

export default function TurnScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const insets = useSafeAreaInsets();
  const [selectedPoints, setSelectedPoints] = useState<Points | null>(null);

  const isMyTurn = game?.currentTurn?.activePlayerId === playerId;
  const activeName = game?.currentTurn ? game.players[game.currentTurn.activePlayerId]?.name : '';

  useGamePresence(gameId, playerId, game ?? null);

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

  const pointOptions: { pts: Points; bg: string; fg: string; label: string }[] = [
    { pts: 1, bg: C.green, fg: C.greenFg, label: 'εύκολο' },
    { pts: 2, bg: C.amber, fg: C.amberFg, label: 'μέτριο' },
    { pts: 3, bg: C.primary, fg: C.primaryInk, label: 'δύσκολο' },
  ];

  return (
    <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Blobs />
      <TouchableOpacity style={s.leaveBtn} onPress={handleLeave} activeOpacity={0.7}>
        <Text style={s.leaveBtnText}>×</Text>
      </TouchableOpacity>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScoreRow players={sortedPlayers} selfId={playerId} activePlayerId={activePlayerId} />

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

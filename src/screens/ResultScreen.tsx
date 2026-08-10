import { useEffect, useRef } from 'react';
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
import { getQuestionById } from '../data/questions';
import { leaveGame } from '../utils/leaveGame';
import { updateGame } from '../utils/updateGame';
import { pickWinner, resolveForScoring, earnedForPlayer, WIN_SCORE } from '../utils/scoring';
import { useGamePresence, leavePresence } from '../hooks/useGamePresence';
import { RootStackParamList, Player } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Avatar } from '../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

/** Seconds the results screen is shown before auto-advancing to the next turn. */
const REVIEW_SECONDS = 90;

/** Compact number for display: drops trailing zeros, caps long decimals. */
function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export default function ResultScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const insets = useSafeAreaInsets();
  const isHost = game?.players[playerId]?.isHost ?? false;
  const advancedRef = useRef(false);

  useGamePresence(gameId, playerId, game ?? null);

  // Review-phase countdown. `timerStartedAt` is re-stamped when the turn flips
  // to `reviewing` (in QuestionScreen), so it doubles as the review timer here.
  // Older games may have it null → the timer stays full and never fires.
  const reviewStartedAt =
    game?.currentTurn?.status === 'reviewing' ? game.currentTurn.timerStartedAt ?? null : null;
  const reviewRemaining = useTimer(REVIEW_SECONDS, reviewStartedAt);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'picking') navigation.replace('Turn', { gameId, playerId });
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

  const handleNext = async () => {
    if (!game || !game.currentTurn || advancedRef.current) return;
    advancedRef.current = true;

    const updated = await updateGame(
      gameId,
      (g) => {
        const turn = g.currentTurn;
        if (!turn || g.status !== 'reviewing') return null;
        const resolved = resolveForScoring(
          turn,
          turn.questionId ? getQuestionById(turn.questionId) : null,
        );

        const updatedPlayers: Record<string, Player> = {};
        for (const [id, p] of Object.entries(g.players)) {
          updatedPlayers[id] = { ...p, score: p.score + earnedForPlayer(turn, resolved, id) };
        }

        const winner = pickWinner(Object.values(updatedPlayers), g.winScore ?? WIN_SCORE);
        const nextIndex = (g.currentTurnIndex + 1) % g.turnOrder.length;
        const nextActiveId = g.turnOrder[nextIndex];

        return {
          ...g,
          players: updatedPlayers,
          winnerId: winner?.id ?? null,
          status: winner ? 'finished' : 'picking',
          currentTurnIndex: nextIndex,
          currentTurn: winner
            ? null
            : {
                turnNumber: (turn.turnNumber ?? 0) + 1,
                activePlayerId: nextActiveId,
                selectedPoints: null,
                selectedCategory: null,
                questionId: null,
                answers: {},
                timerStartedAt: Date.now(),
                status: 'picking',
                activeHelps: {},
              },
        };
      },
      { base: game },
    );

    if (!updated) {
      advancedRef.current = false;
      return;
    }
    // No explicit navigation: `updateGame` primes the local cache, so the
    // status-watching effect above advances to Turn / Winner / Loser on its own.
  };

  // Reset the one-shot guard whenever a new review phase begins.
  useEffect(() => {
    advancedRef.current = false;
  }, [reviewStartedAt]);

  // Auto-advance if nobody taps "Επόμενος Γύρος" in REVIEW_SECONDS. Any client
  // may fire — `handleNext` is guarded by `updateGame` (version-checked, only
  // the first write lands) plus `advancedRef`, so concurrent fires are safe.
  // This also keeps the game moving if the host stalls or disconnects.
  useEffect(() => {
    if (reviewStartedAt === null || game?.status !== 'reviewing') return;
    if (reviewRemaining > 0 || advancedRef.current) return;
    handleNext();
  }, [reviewRemaining, game?.status, reviewStartedAt]);

  if (!game || !game.currentTurn) return null;

  const turn = game.currentTurn;
  const question = turn.questionId ? getQuestionById(turn.questionId) : null;
  const resolved = resolveForScoring(turn, question);

  const isNumericQ = question?.type === 'numeric';
  const correctValue = question?.type === 'numeric' ? question.correctValue : null;
  const correctText = !question
    ? ''
    : question.type === 'numeric'
      ? `${formatNum(question.correctValue)}${question.unit ? ' ' + question.unit : ''}`
      : question.options[question.correctIndex];

  const earnedMap: Record<string, number> = {};
  for (const id of Object.keys(game.players)) {
    earnedMap[id] = earnedForPlayer(turn, resolved, id);
  }

  const sortedPlayers = Object.values(game.players).sort(
    (a, b) => (b.score + earnedMap[b.id]) - (a.score + earnedMap[a.id])
  );
  const turnNumber = turn.turnNumber ?? 1;

  return (
    <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Blobs />
      <TouchableOpacity style={[s.leaveBtn, { top: insets.top + 8 }]} onPress={handleLeave} activeOpacity={0.7}>
        <Text style={s.leaveBtnText}>×</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.eyebrow}>Γύρος {turnNumber}</Text>
        <Text style={s.title}>Αποτελέσματα Γύρου</Text>

        {question && (
          <View style={s.questionCard}>
            <Text style={s.questionText}>{question.text}</Text>
            <View style={s.correctRow}>
              <View style={s.correctCircle}>
                <Text style={s.correctCheck}>✓</Text>
              </View>
              <View style={s.correctTextCol}>
                <Text style={s.correctLabel}>
                  {isNumericQ ? 'Σωστός αριθμός:' : 'Σωστή απάντηση:'}
                </Text>
                <Text style={s.correctAnswer}>{correctText}</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={s.sectionEyebrow}>Αποτελέσματα παικτών</Text>

        {sortedPlayers.map((player) => {
          const rawAnswer = turn.answers[player.id];
          const resolvedAns = resolved[player.id];
          const isCorrect = resolvedAns?.isCorrect ?? false;
          const isSelf = player.id === playerId;
          const hasDouble = turn.activeHelps?.[player.id]?.double;
          const hasFifty = turn.activeHelps?.[player.id]?.fifty;
          const stolenFrom = rawAnswer?.stolenFrom;
          const stealTargetName = stolenFrom ? game.players[stolenFrom]?.name : undefined;
          const earned = earnedMap[player.id] ?? 0;
          const noAnswer = rawAnswer === undefined;

          let verdictText: string;
          let verdictStyle: object;
          if (noAnswer) {
            verdictText = '— δεν απάντησε';
            verdictStyle = s.verdictMute;
          } else if (isNumericQ) {
            const guess = resolvedAns?.answerValue;
            const stealNote = stolenFrom ? `👊 ${stealTargetName} · ` : '';
            if (guess == null) {
              verdictText = '— δεν απάντησε';
              verdictStyle = s.verdictMute;
            } else if (isCorrect) {
              verdictText = `${stealNote}🎯 ${formatNum(guess)} · Πλησιέστερα!${hasDouble ? ' ⚡×2' : ''} +${earned} βαθμ.`;
              verdictStyle = s.verdictCorrect;
            } else {
              const dist = Math.abs(guess - (correctValue ?? 0));
              verdictText = `${stealNote}${formatNum(guess)} · απόκλιση ${formatNum(dist)}`;
              verdictStyle = s.verdictWrong;
            }
          } else if (stolenFrom) {
            verdictText = isCorrect
              ? `👊 Έκλεψε από ${stealTargetName} · +${earned} βαθμ.`
              : `👊 Έκλεψε από ${stealTargetName} · Λάθος`;
            verdictStyle = isCorrect ? s.verdictCorrect : s.verdictWrong;
          } else if (hasDouble && hasFifty && isCorrect) {
            verdictText = `✂️⚡ ×2 Σωστά! +${earned} βαθμ.`;
            verdictStyle = s.verdictCorrect;
          } else if (hasDouble && isCorrect) {
            verdictText = `⚡ ×2 Σωστά! +${earned} βαθμ.`;
            verdictStyle = s.verdictCorrect;
          } else if (hasFifty && isCorrect) {
            verdictText = `✂️ 50/50 Σωστά! +${earned} βαθμ.`;
            verdictStyle = s.verdictCorrect;
          } else if (isCorrect) {
            verdictText = `✓ Σωστά! +${earned} βαθμ.`;
            verdictStyle = s.verdictCorrect;
          } else {
            verdictText = '✗ Λάθος';
            verdictStyle = s.verdictWrong;
          }

          return (
            <View
              key={player.id}
              style={[s.playerRow, SHADOW.card, isSelf && s.playerRowSelf]}
            >
              <Avatar name={player.name} size={38} />
              <View style={s.playerInfo}>
                <Text style={s.playerName}>
                  {player.name}
                  {isSelf ? ' (εσύ)' : ''}
                </Text>
                <Text style={[s.verdict, verdictStyle]}>{verdictText}</Text>
              </View>
              <Text style={s.totalScore}>{player.score + earned}</Text>
            </View>
          );
        })}

        {isHost ? (
          <TouchableOpacity style={s.primaryBtn} onPress={handleNext} activeOpacity={0.8}>
            <Text style={s.primaryBtnText}>Επόμενος Γύρος →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.waitMsg}>Αναμονή για τον επόμενο γύρο...</Text>
        )}

        {reviewStartedAt !== null && (
          <Text style={s.autoAdvanceHint}>⏱ Αυτόματη συνέχεια σε {reviewRemaining}s</Text>
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
  scroll: { padding: 20, paddingTop: 22, gap: 14 },

  eyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: F.bold,
    fontSize: 28,
    color: C.ink,
    textAlign: 'center',
  },

  questionCard: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 22,
    padding: 16,
  },
  questionText: {
    fontFamily: F.sansSemiBold,
    fontSize: 17,
    lineHeight: 22,
    color: C.ink,
    marginBottom: 10,
  },
  correctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(61,220,151,0.15)',
    borderWidth: 1.5,
    borderColor: C.green,
    borderRadius: 14,
    padding: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  correctCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctCheck: {
    fontFamily: F.sansBold,
    fontSize: 14,
    color: C.greenFg,
  },
  correctTextCol: {
    flex: 1,
    gap: 2,
  },
  correctLabel: {
    fontFamily: F.sansMedium,
    fontSize: 13,
    color: C.inkMute,
  },
  correctAnswer: {
    fontFamily: F.sansBold,
    fontSize: 15,
    color: C.green,
  },

  sectionEyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 12,
    color: C.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  playerRowSelf: {
    borderColor: C.primary,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontFamily: F.sansBold,
    fontSize: 15,
    color: C.ink,
  },
  verdict: {
    fontFamily: F.sansSemiBold,
    fontSize: 13,
  },
  verdictCorrect: { color: C.green },
  verdictWrong: { color: C.primary },
  verdictMute: { color: C.inkMute },

  totalScore: {
    fontFamily: F.display,
    fontSize: 26,
    color: C.primary,
  },

  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  primaryBtnText: {
    fontFamily: F.sansBold,
    color: C.primaryInk,
    fontSize: 17,
  },
  waitMsg: {
    textAlign: 'center',
    fontFamily: F.sansMedium,
    color: C.inkSoft,
    fontSize: 14,
    marginTop: 4,
  },
  autoAdvanceHint: {
    textAlign: 'center',
    fontFamily: F.sansMedium,
    color: C.inkMute,
    fontSize: 12,
    marginTop: 2,
  },
});

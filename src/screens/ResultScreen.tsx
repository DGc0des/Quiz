import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../config/supabase';
import { useGame } from '../hooks/useGame';
import { getQuestionById } from '../data/questions';
import { RootStackParamList, Player, Game, Turn, PlayerAnswer } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Avatar } from '../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

function resolveAnswers(turn: Turn): Record<string, PlayerAnswer> {
  const resolved = { ...turn.answers };
  for (const [pid, answer] of Object.entries(turn.answers)) {
    if (answer.stolenFrom) {
      const target = turn.answers[answer.stolenFrom];
      if (target) {
        resolved[pid] = { ...answer, answerIndex: target.answerIndex, isCorrect: target.isCorrect };
      }
    }
  }
  return resolved;
}

const WIN_SCORE = 15;

export default function ResultScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const isHost = game?.players[playerId]?.isHost ?? false;
  const advancedRef = useRef(false);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'picking') navigation.replace('Turn', { gameId, playerId });
    if (game.status === 'finished') {
      const isWinner = game.winnerId === playerId;
      navigation.replace(isWinner ? 'Winner' : 'Loser', { gameId, playerId });
    }
  }, [game?.status]);

  const handleNext = async () => {
    if (!game || !game.currentTurn || advancedRef.current) return;
    advancedRef.current = true;

    const turn = game.currentTurn;
    const points = turn.selectedPoints ?? 1;
    const resolved = resolveAnswers(turn);

    const updatedPlayers: Record<string, Player> = {};
    for (const [id, p] of Object.entries(game.players)) {
      const answer = resolved[id];
      const isCorrect = answer?.isCorrect ?? false;
      const hasDouble = turn.activeHelps?.[id]?.double;
      const hasFifty = turn.activeHelps?.[id]?.fifty;
      const effectivePoints = hasFifty ? 1 : points;
      const earned = isCorrect ? (hasDouble ? effectivePoints * 2 : effectivePoints) : 0;
      updatedPlayers[id] = { ...p, score: p.score + earned };
    }

    const winner = Object.values(updatedPlayers).find((p) => p.score >= WIN_SCORE);
    const nextIndex = (game.currentTurnIndex + 1) % game.turnOrder.length;
    const nextActiveId = game.turnOrder[nextIndex];

    const updated: Game = {
      ...game,
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
            timerStartedAt: null,
            status: 'picking',
            activeHelps: {},
          },
    };
    await supabase.from('games').update({ data: updated }).eq('id', gameId);
  };

  if (!game || !game.currentTurn) return null;

  const turn = game.currentTurn;
  const question = turn.questionId ? getQuestionById(turn.questionId) : null;
  const points = turn.selectedPoints ?? 1;
  const resolved = resolveAnswers(turn);
  const sortedPlayers = Object.values(game.players).sort((a, b) => b.score - a.score);
  const turnNumber = turn.turnNumber ?? 1;

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />
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
                <Text style={s.correctLabel}>Σωστή απάντηση:</Text>
                <Text style={s.correctAnswer}>
                  {question.options[question.correctIndex]}
                </Text>
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
          const effectivePoints = hasFifty ? 1 : points;
          const earned = isCorrect ? (hasDouble ? effectivePoints * 2 : effectivePoints) : 0;
          const noAnswer = rawAnswer === undefined;

          let verdictText: string;
          let verdictStyle: object;
          if (noAnswer) {
            verdictText = '— δεν απάντησε';
            verdictStyle = s.verdictMute;
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
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
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
});

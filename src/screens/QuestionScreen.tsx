import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../config/supabase';
import { useGame } from '../hooks/useGame';
import { useTimer } from '../hooks/useTimer';
import { getQuestionById } from '../data/questions';
import { RootStackParamList, Game } from '../types';
import { C, F, SHADOW, CATEGORY_META } from '../theme';
import { Blobs } from '../components/Blobs';

type Props = NativeStackScreenProps<RootStackParamList, 'Question'>;

const OPTION_LABELS = ['Α', 'Β', 'Γ', 'Δ'];
const TIMER_SECONDS = 30;

export default function QuestionScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);

  const turn = game?.currentTurn;
  const question = turn?.questionId ? getQuestionById(turn.questionId) : null;
  const remaining = useTimer(TIMER_SECONDS, turn?.timerStartedAt ?? null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const timerFired = useRef(false);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'reviewing') navigation.replace('Result', { gameId, playerId });
    if (game.status === 'finished') {
      const isWinner = game.winnerId === playerId;
      navigation.replace(isWinner ? 'Winner' : 'Loser', { gameId, playerId });
    }
  }, [game?.status]);

  const handleAnswer = async (index: number) => {
    if (answered || !question) return;
    setAnswered(true);
    setSelectedIndex(index);
    await submitAndAdvance(index);
  };

  const submitAndAdvance = async (index: number | null) => {
    if (!question) return;

    await supabase.rpc('add_game_answer', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_answer: {
        playerId,
        answerIndex: index,
        isCorrect: index === question.correctIndex,
        answeredAt: Date.now(),
      },
    });

    const { data: row } = await supabase
      .from('games')
      .select('data')
      .eq('id', gameId)
      .single();

    if (!row) return;
    const freshGame = row.data as Game;
    if (!freshGame.currentTurn || freshGame.status !== 'question') return;

    const playerCount = Object.keys(freshGame.players).length;
    const answerCount = Object.keys(freshGame.currentTurn.answers).length;

    if (answerCount >= playerCount) {
      await supabase.from('games').update({
        data: {
          ...freshGame,
          status: 'reviewing',
          currentTurn: { ...freshGame.currentTurn, status: 'reviewing' },
        },
      }).eq('id', gameId);
    }
  };

  useEffect(() => {
    if (remaining > 0 || timerFired.current) return;
    timerFired.current = true;
    if (!answered) {
      setAnswered(true);
      submitAndAdvance(null);
    } else {
      submitAndAdvance(selectedIndex);
    }
  }, [remaining]);

  if (!question) return null;

  const timerProgress = turn?.timerStartedAt ? remaining / TIMER_SECONDS : 1;
  const timerColor = remaining > 10 ? C.green : remaining > 5 ? C.amber : C.primary;

  const catMeta = CATEGORY_META[turn?.selectedCategory ?? ''];
  const totalQuestions = 1;
  const currentQ = 1;

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />
      <View style={s.container}>
        {/* Timer row */}
        <View style={s.timerRow}>
          <View style={s.timerBarBg}>
            <View
              style={[
                s.timerBarFill,
                { width: `${timerProgress * 100}%` as any, backgroundColor: timerColor },
              ]}
            />
          </View>
          <Text style={[s.timerText, { color: timerColor }]}>{remaining}″</Text>
        </View>

        {/* Category + Points row */}
        <View style={s.metaRow}>
          <View style={s.categoryChip}>
            <Text style={s.categoryChipText}>
              {catMeta?.ico ?? '❓'} {turn?.selectedCategory}
            </Text>
          </View>
          <View style={[
            s.pointsChip,
            turn?.selectedPoints === 1 && { backgroundColor: C.green, borderColor: C.green },
            turn?.selectedPoints === 2 && { backgroundColor: C.amber, borderColor: C.amber },
            turn?.selectedPoints === 3 && { backgroundColor: C.primary, borderColor: C.primary },
          ]}>
            <Text
              style={[
                s.pointsChipText,
                turn?.selectedPoints === 1 && { color: C.greenFg },
                turn?.selectedPoints === 2 && { color: C.amberFg },
                turn?.selectedPoints === 3 && { color: C.primaryInk },
              ]}
            >
              {turn?.selectedPoints} βαθμ.
            </Text>
          </View>
        </View>

        {/* Question card */}
        <View style={s.questionCard}>
          <Text style={s.questionEyebrow}>
            Ερώτηση {currentQ} / {totalQuestions}
          </Text>
          <Text style={s.questionText}>{question.text}</Text>
        </View>

        {/* Answer options */}
        <View style={s.options}>
          {question.options.map((opt, i) => {
            const isCorrect = answered && i === question.correctIndex;
            const isWrong = answered && i === selectedIndex && i !== question.correctIndex;
            const isDisabled = answered && !isCorrect && !isWrong;

            return (
              <TouchableOpacity
                key={i}
                style={[
                  s.option,
                  SHADOW.card,
                  isCorrect && s.optionCorrect,
                  isWrong && s.optionWrong,
                  isDisabled && s.optionDisabled,
                ]}
                onPress={() => handleAnswer(i)}
                disabled={answered}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    s.optionLabelCircle,
                    isCorrect && s.optionLabelCorrect,
                    isWrong && s.optionLabelWrong,
                  ]}
                >
                  <Text
                    style={[
                      s.optionLabel,
                      isCorrect && s.optionLabelTextCorrect,
                      isWrong && s.optionLabelTextWrong,
                    ]}
                  >
                    {OPTION_LABELS[i]}
                  </Text>
                </View>
                <Text
                  style={[
                    s.optionText,
                    isCorrect && s.optionTextCorrect,
                    isWrong && s.optionTextWrong,
                  ]}
                >
                  {opt}
                </Text>
                {isCorrect && <Text style={s.checkMark}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Wait message */}
        {answered && (
          <Text style={s.waitMsg}>
            {selectedIndex === question.correctIndex
              ? '✓ Σωστά! Αναμονή για τους άλλους...'
              : 'Αναμονή για τους άλλους...'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 18, gap: 14 },

  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerBarBg: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    overflow: 'hidden',
  },
  timerBarFill: { height: '100%', borderRadius: 999 },
  timerText: {
    fontFamily: F.display,
    fontSize: 22,
    textAlign: 'right',
    minWidth: 38,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
  },
  categoryChipText: {
    fontFamily: F.sansBold,
    fontSize: 12,
    color: C.inkSoft,
  },
  pointsChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
  },
  pointsChipText: {
    fontFamily: F.sansBold,
    fontSize: 12,
    color: C.inkSoft,
  },

  questionCard: {
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 22,
    padding: 18,
    alignItems: 'center',
  },
  questionEyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 12,
    color: C.inkMute,
    marginBottom: 8,
  },
  questionText: {
    fontFamily: F.bold,
    fontSize: 22,
    lineHeight: 27.5,
    color: C.ink,
    textAlign: 'center',
  },

  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 12,
  },
  optionCorrect: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  optionWrong: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  optionDisabled: {
    opacity: 0.55,
  },

  optionLabelCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabelCorrect: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  optionLabelWrong: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  optionLabel: {
    fontFamily: F.extraBold,
    fontSize: 18,
    color: C.primary,
  },
  optionLabelTextCorrect: {
    color: '#06311E',
  },
  optionLabelTextWrong: {
    color: '#FFFFFF',
  },
  optionText: {
    flex: 1,
    fontFamily: F.sansMedium,
    fontSize: 15,
    color: C.ink,
  },
  optionTextCorrect: {
    color: '#06311E',
  },
  optionTextWrong: {
    color: '#FFFFFF',
  },
  checkMark: {
    fontFamily: F.sansBold,
    fontSize: 18,
    color: '#06311E',
  },

  waitMsg: {
    textAlign: 'center',
    fontFamily: F.sansMedium,
    color: C.inkSoft,
    fontSize: 14,
  },
});

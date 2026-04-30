import { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../config/supabase';
import { useGame } from '../hooks/useGame';
import { useTimer } from '../hooks/useTimer';
import { getQuestionById } from '../data/questions';
import { RootStackParamList, Game } from '../types';
import { C, F, SHADOW, CATEGORY_META } from '../theme';
import { Blobs } from '../components/Blobs';
import { Avatar } from '../components/Avatar';

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
  const [visibleOptions, setVisibleOptions] = useState<number[] | null>(null);
  const [doubleActive, setDoubleActive] = useState(false);
  const [stealMode, setStealMode] = useState(false);
  const [stealTargetId, setStealTargetId] = useState<string | null>(null);
  const [sabotageMode, setSabotageMode] = useState(false);
  const [sabotageActivated, setSabotageActivated] = useState(false);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([0, 1, 2, 3]);
  const timerFired = useRef(false);

  const player = game?.players[playerId];
  const canFifty = !(player?.usedHelps?.fifty ?? false) && visibleOptions === null;
  const canSteal = !(player?.usedHelps?.steal ?? false) && stealTargetId === null && !stealMode;
  const canDouble = !(player?.usedHelps?.double ?? false) && !doubleActive;
  const canSabotage = !(player?.usedHelps?.sabotage ?? false) && !sabotageActivated && !sabotageMode;
  const otherPlayers = Object.values(game?.players ?? {}).filter((p) => p.id !== playerId);
  const isSabotaged = Object.values(turn?.activeHelps ?? {}).some((h) => h.sabotage === playerId);

  useEffect(() => {
    if (!isSabotaged) return;
    const idx = [0, 1, 2, 3];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setShuffledIndices(idx);
  }, [isSabotaged]);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'reviewing') navigation.replace('Result', { gameId, playerId });
    if (game.status === 'finished') {
      const isWinner = game.winnerId === playerId;
      navigation.replace(isWinner ? 'Winner' : 'Loser', { gameId, playerId });
    }
  }, [game?.status]);

  const checkAndAdvance = async () => {
    const { data: row } = await supabase.from('games').select('data').eq('id', gameId).single();
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
      // Navigate immediately — don't rely on realtime echo for the writer
      navigation.replace('Result', { gameId, playerId });
    }
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
    await checkAndAdvance();
  };

  const handleAnswer = async (index: number) => {
    if (answered || !question) return;
    setAnswered(true);
    setSelectedIndex(index);
    await submitAndAdvance(index);
  };

  useEffect(() => {
    if (remaining > 0 || timerFired.current) return;
    timerFired.current = true;
    if (!answered) {
      setStealMode(false);
      setSabotageMode(false);
      setAnswered(true);
      submitAndAdvance(null);
    } else {
      checkAndAdvance();
    }
  }, [remaining]);

  const updateHelpInDB = async (helpType: 'fifty' | 'double') => {
    const { data: row } = await supabase.from('games').select('data').eq('id', gameId).single();
    if (!row) return;
    const freshGame = row.data as Game;
    if (!freshGame.currentTurn) return;

    const prevPlayer = freshGame.players[playerId];
    const updatedPlayers = {
      ...freshGame.players,
      [playerId]: {
        ...prevPlayer,
        usedHelps: {
          fifty: prevPlayer.usedHelps?.fifty ?? false,
          steal: prevPlayer.usedHelps?.steal ?? false,
          double: prevPlayer.usedHelps?.double ?? false,
          sabotage: prevPlayer.usedHelps?.sabotage ?? false,
          [helpType]: true,
        },
      },
    };

    const activeHelps = {
      ...(freshGame.currentTurn.activeHelps ?? {}),
      [playerId]: {
        ...(freshGame.currentTurn.activeHelps?.[playerId] ?? {}),
        ...(helpType === 'double' ? { double: true as const } : {}),
        ...(helpType === 'fifty' ? { fifty: true as const } : {}),
      },
    };

    await supabase.from('games').update({
      data: {
        ...freshGame,
        players: updatedPlayers,
        currentTurn: { ...freshGame.currentTurn, activeHelps },
      },
    }).eq('id', gameId);
  };

  const handleFifty = async () => {
    if (!question || !canFifty) return;
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== question.correctIndex);
    const keepWrong = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
    setVisibleOptions([question.correctIndex, keepWrong].sort((a, b) => a - b));
    await updateHelpInDB('fifty');
  };

  const handleDouble = async () => {
    if (!canDouble) return;
    setDoubleActive(true);
    await updateHelpInDB('double');
  };

  const handleStealPress = () => {
    if (!canSteal || otherPlayers.length === 0) return;
    setStealMode(true);
  };

  const handleStealTarget = async (targetId: string) => {
    setStealMode(false);
    setStealTargetId(targetId);
    setAnswered(true);

    await supabase.rpc('add_game_answer', {
      p_game_id: gameId,
      p_player_id: playerId,
      p_answer: {
        playerId,
        answerIndex: null,
        isCorrect: false,
        answeredAt: Date.now(),
        stolenFrom: targetId,
      },
    });

    const { data: row } = await supabase.from('games').select('data').eq('id', gameId).single();
    if (!row) return;
    const freshGame = row.data as Game;
    if (!freshGame.currentTurn || freshGame.status !== 'question') return;

    const prevPlayer = freshGame.players[playerId];
    const updatedPlayers = {
      ...freshGame.players,
      [playerId]: {
        ...prevPlayer,
        usedHelps: {
          fifty: prevPlayer.usedHelps?.fifty ?? false,
          steal: true,
          double: prevPlayer.usedHelps?.double ?? false,
          sabotage: prevPlayer.usedHelps?.sabotage ?? false,
        },
      },
    };

    const playerCount = Object.keys(freshGame.players).length;
    const answerCount = Object.keys(freshGame.currentTurn.answers).length;
    const shouldAdvance = answerCount >= playerCount;

    await supabase.from('games').update({
      data: {
        ...freshGame,
        players: updatedPlayers,
        ...(shouldAdvance ? { status: 'reviewing' } : {}),
        currentTurn: {
          ...freshGame.currentTurn,
          ...(shouldAdvance ? { status: 'reviewing' } : {}),
        },
      },
    }).eq('id', gameId);
  };

  const handleSabotagePress = () => {
    if (!canSabotage || otherPlayers.length === 0) return;
    setSabotageMode(true);
  };

  const handleSabotageTarget = async (targetId: string) => {
    setSabotageMode(false);
    setSabotageActivated(true);

    const { data: row } = await supabase.from('games').select('data').eq('id', gameId).single();
    if (!row) return;
    const freshGame = row.data as Game;
    if (!freshGame.currentTurn) return;

    const prevPlayer = freshGame.players[playerId];
    const updatedPlayers = {
      ...freshGame.players,
      [playerId]: {
        ...prevPlayer,
        usedHelps: {
          fifty: prevPlayer.usedHelps?.fifty ?? false,
          steal: prevPlayer.usedHelps?.steal ?? false,
          double: prevPlayer.usedHelps?.double ?? false,
          sabotage: true,
        },
      },
    };

    const activeHelps = {
      ...(freshGame.currentTurn.activeHelps ?? {}),
      [playerId]: {
        ...(freshGame.currentTurn.activeHelps?.[playerId] ?? {}),
        sabotage: targetId,
      },
    };

    await supabase.from('games').update({
      data: {
        ...freshGame,
        players: updatedPlayers,
        currentTurn: { ...freshGame.currentTurn, activeHelps },
      },
    }).eq('id', gameId);
  };

  // ── Animated refs ──

  // 50/50: per-option fade
  const fiftyAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(1))).current;
  const scissorAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  // Double: bolt loop + glow pulse
  const boltAnims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const doubleGlow = useRef(new Animated.Value(0)).current;

  // Steal: fist fly + impact ring
  const fistAnim = useRef(new Animated.Value(0)).current;
  const impactAnim = useRef(new Animated.Value(0)).current;
  const stealBannerAnim = useRef(new Animated.Value(0)).current;

  // Sabotage: bomb + boom + shake + stagger
  const bombAnim = useRef(new Animated.Value(0)).current;
  const boomAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const sabotageStagger = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const sabotageBannerAnim = useRef(new Animated.Value(0)).current;

  // 50/50 effect trigger
  const prevVisibleOptions = useRef(visibleOptions);
  useEffect(() => {
    if (visibleOptions !== null && prevVisibleOptions.current === null) {
      [0, 1, 2, 3].forEach((i) => {
        if (!visibleOptions.includes(i)) {
          Animated.parallel([
            Animated.timing(scissorAnims[i], {
              toValue: 1,
              duration: 550,
              easing: Easing.out(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(fiftyAnims[i], {
              toValue: 0,
              duration: 550,
              easing: Easing.out(Easing.ease),
              useNativeDriver: false,
            }),
          ]).start();
        }
      });
    }
    prevVisibleOptions.current = visibleOptions;
  }, [visibleOptions]);

  // Double effect trigger
  useEffect(() => {
    if (!doubleActive) return;
    const bolts = boltAnims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 350),
          Animated.timing(a, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: false }),
        ]),
      ),
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(doubleGlow, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(doubleGlow, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]),
    );
    bolts.forEach((b) => b.start());
    glow.start();
    return () => {
      bolts.forEach((b) => b.stop());
      glow.stop();
    };
  }, [doubleActive]);

  // Steal effect trigger
  useEffect(() => {
    if (!stealTargetId) return;
    Animated.timing(stealBannerAnim, {
      toValue: 1, duration: 400, easing: Easing.out(Easing.back(1.5)), useNativeDriver: false,
    }).start();
    const fistLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fistAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(fistAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    const impactLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(impactAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(impactAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    fistLoop.start();
    impactLoop.start();
    return () => { fistLoop.stop(); impactLoop.stop(); };
  }, [stealTargetId]);

  // Sabotage received effect trigger
  useEffect(() => {
    if (!isSabotaged) return;
    Animated.timing(sabotageBannerAnim, {
      toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: false,
    }).start();

    const seq = Animated.sequence([
      Animated.timing(bombAnim, { toValue: 1, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: false }),
      Animated.parallel([
        Animated.timing(boomAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.sequence(
          Array.from({ length: 6 }, (_, i) =>
            Animated.timing(shakeAnim, {
              toValue: i % 2 === 0 ? -3 : 3,
              duration: 80,
              useNativeDriver: false,
            }),
          ),
        ),
      ]),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: false }),
      Animated.timing(boomAnim, { toValue: 2, duration: 300, useNativeDriver: false }),
      Animated.stagger(
        120,
        sabotageStagger.map((a) =>
          Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: false }),
        ),
      ),
    ]);
    seq.start();
  }, [isSabotaged]);

  if (!question) return null;

  const timerProgress = turn?.timerStartedAt ? remaining / TIMER_SECONDS : 1;
  const timerColor = remaining > 10 ? C.green : remaining > 5 ? C.amber : C.primary;
  const catMeta = CATEGORY_META[turn?.selectedCategory ?? ''];

  // Bolt positions for double effect
  const boltPositions = [
    { left: '14%', bottom: '52%' },
    { right: '12%', bottom: '46%' },
    { left: '46%', bottom: '60%' },
  ] as const;

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />

      {/* ── STEAL OVERLAY: flying fist + impact ring ── */}
      {stealTargetId && (
        <>
          <Animated.Text
            style={[
              s.fistOverlay,
              {
                opacity: fistAnim.interpolate({ inputRange: [0, 0.1, 0.45, 0.9, 1], outputRange: [0, 1, 1, 1, 0] }),
                left: fistAnim.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: ['-8%' as any, '50%' as any, '50%' as any, '108%' as any] }),
                top: fistAnim.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: ['78%' as any, '36%' as any, '36%' as any, '24%' as any] }),
                transform: [
                  { scale: fistAnim.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: [0.8, 1.15, 1.3, 0.8] }) },
                  { rotate: fistAnim.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: ['-12deg', '0deg', '0deg', '12deg'] }) },
                ],
              },
            ]}
          >
            👊
          </Animated.Text>
          <Animated.View
            style={[
              s.impactRing,
              {
                opacity: impactAnim.interpolate({ inputRange: [0, 0.1, 0.6, 1], outputRange: [0, 1, 0, 0] }),
                transform: [
                  { scale: impactAnim.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0.4, 0.6, 1.6] }) },
                ],
              },
            ]}
          />
        </>
      )}

      {/* ── SABOTAGE OVERLAY: bomb + boom ── */}
      {isSabotaged && (
        <>
          <Animated.Text
            style={[
              s.bombOverlay,
              {
                opacity: bombAnim.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                top: bombAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: ['-10%' as any, '38%' as any, '38%' as any] }),
                transform: [
                  { scale: bombAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }) },
                  { rotate: bombAnim.interpolate({ inputRange: [0, 0.5, 0.8], outputRange: ['-15deg', '8deg', '0deg'] }) },
                ],
              },
            ]}
          >
            💣
          </Animated.Text>
          <Animated.Text
            style={[
              s.boomOverlay,
              {
                opacity: boomAnim.interpolate({ inputRange: [0, 0.5, 1, 1.5, 2], outputRange: [0, 1, 1, 0, 0] }),
                transform: [
                  { scale: boomAnim.interpolate({ inputRange: [0, 0.5, 1, 2], outputRange: [0.5, 1.2, 1, 1] }) },
                ],
              },
            ]}
          >
            BOOM!
          </Animated.Text>
        </>
      )}

      {/* ── DOUBLE OVERLAY: lightning bolts ── */}
      {doubleActive &&
        boltAnims.map((a, i) => (
          <Animated.Text
            key={i}
            style={[
              s.boltOverlay,
              boltPositions[i],
              {
                opacity: a.interpolate({ inputRange: [0, 0.15, 0.5, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [20, -40] }) },
                  { scale: a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1, 1.1] }) },
                ],
              },
            ]}
          >
            ⚡
          </Animated.Text>
        ))}

      <Animated.View
        style={[
          s.container,
          isSabotaged && { transform: [{ translateX: shakeAnim }] },
        ]}
      >
        {/* ── Fixed header: always visible ── */}
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

        {/* ── Scrollable body ── */}
        <ScrollView
          style={s.scrollBody}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

        {/* Help buttons — visible only before answering and outside pickers */}
        {!answered && !stealMode && !sabotageMode && (
          <View style={s.helpRow}>
            <TouchableOpacity
              style={[s.helpBtn, s.helpBtnFifty, !canFifty && s.helpBtnUsed]}
              onPress={handleFifty}
              disabled={!canFifty}
              activeOpacity={0.7}
            >
              <Text style={s.helpBtnEmoji}>✂️</Text>
              <Text style={[s.helpBtnLabel, s.helpBtnLabelFifty, !canFifty && s.helpBtnLabelUsed]}>50/50</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.helpBtn, s.helpBtnSteal, !canSteal && s.helpBtnUsed]}
              onPress={handleStealPress}
              disabled={!canSteal}
              activeOpacity={0.7}
            >
              <Text style={s.helpBtnEmoji}>👊</Text>
              <Text style={[s.helpBtnLabel, s.helpBtnLabelSteal, !canSteal && s.helpBtnLabelUsed]}>Κλέψε</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.helpBtn, s.helpBtnDouble, doubleActive && s.helpBtnDoubleActive, !canDouble && s.helpBtnUsed]}
              onPress={handleDouble}
              disabled={!canDouble}
              activeOpacity={0.7}
            >
              <Text style={s.helpBtnEmoji}>⚡</Text>
              <Text style={[s.helpBtnLabel, s.helpBtnLabelDouble, !canDouble && s.helpBtnLabelUsed]}>×2</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.helpBtn, s.helpBtnSabotage, !canSabotage && s.helpBtnUsed]}
              onPress={handleSabotagePress}
              disabled={!canSabotage}
              activeOpacity={0.7}
            >
              <Text style={s.helpBtnEmoji}>💣</Text>
              <Text style={[s.helpBtnLabel, s.helpBtnLabelSabotage, !canSabotage && s.helpBtnLabelUsed]}>Σαμπ.</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Steal banner */}
        {stealTargetId && (
          <Animated.View
            style={[
              s.stealBanner,
              {
                opacity: stealBannerAnim,
                transform: [
                  { translateY: stealBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
                  { scale: stealBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                ],
              },
            ]}
          >
            <Text style={s.stealBannerText}>
              👊 Κλέβεις από {game?.players[stealTargetId]?.name}...
            </Text>
          </Animated.View>
        )}

        {/* Sabotage banner for the targeted player */}
        {isSabotaged && !answered && (
          <Animated.View
            style={[
              s.sabotageBanner,
              {
                transform: [
                  {
                    translateX: sabotageBannerAnim.interpolate({
                      inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
                      outputRange: [0, -3, 3, -3, 3, -3, 3, -3, 3, -3, 0],
                    }),
                  },
                  {
                    scale: sabotageBannerAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.92, 1.02, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={s.sabotageBannerText}>💣 Σαμποτάζ! Διάλεξε τυχαία!</Text>
          </Animated.View>
        )}

        {/* Question card */}
        <View style={s.questionCard}>
          <Text style={s.questionEyebrow}>Ερώτηση 1 / 1</Text>
          <Text style={s.questionText}>{question.text}</Text>
        </View>

        {/* Steal / sabotage pickers OR answer options */}
        {stealMode ? (
          <View style={s.stealBox}>
            <Text style={s.stealTitle}>Επίλεξε παίκτη να κλέψεις:</Text>
            {otherPlayers.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={s.stealRow}
                onPress={() => handleStealTarget(p.id)}
                activeOpacity={0.7}
              >
                <Avatar name={p.name} size={36} />
                <Text style={s.stealPlayerName}>{p.name}</Text>
                <Text style={s.stealArrow}>→</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.stealCancelBtn} onPress={() => setStealMode(false)}>
              <Text style={s.stealCancelText}>← Ακύρωση</Text>
            </TouchableOpacity>
          </View>
        ) : sabotageMode ? (
          <View style={s.stealBox}>
            <Text style={s.stealTitle}>Επίλεξε παίκτη να σαμποτάρεις:</Text>
            {otherPlayers.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={s.stealRow}
                onPress={() => handleSabotageTarget(p.id)}
                activeOpacity={0.7}
              >
                <Avatar name={p.name} size={36} />
                <Text style={s.stealPlayerName}>{p.name}</Text>
                <Text style={s.stealArrow}>💣</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.stealCancelBtn} onPress={() => setSabotageMode(false)}>
              <Text style={s.stealCancelText}>← Ακύρωση</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.options}>
            {(isSabotaged ? shuffledIndices : [0, 1, 2, 3]).map((originalIdx, displayPos) => {
              const opt = question.options[originalIdx];
              const revealing = false;
              const isEliminated = !answered && visibleOptions !== null && !visibleOptions.includes(originalIdx);
              const isCorrect = revealing && originalIdx === question.correctIndex;
              const isWrong = revealing && originalIdx === selectedIndex && originalIdx !== question.correctIndex;
              const isSelected = answered && !revealing && originalIdx === selectedIndex;
              const isDisabled = (answered && !isCorrect && !isWrong && !isSelected) || isEliminated;
              const isDoubleOption = doubleActive && !answered;

              const optionContent = (
                <>
                  <View
                    style={[
                      s.optionLabelCircle,
                      isSelected && s.optionLabelSelected,
                      isCorrect && s.optionLabelCorrect,
                      isWrong && s.optionLabelWrong,
                      isDoubleOption && s.optionLabelDouble,
                    ]}
                  >
                    <Text
                      style={[
                        s.optionLabel,
                        isSelected && s.optionLabelTextSelected,
                        isCorrect && s.optionLabelTextCorrect,
                        isWrong && s.optionLabelTextWrong,
                        isDoubleOption && s.optionLabelTextDouble,
                      ]}
                    >
                      {OPTION_LABELS[displayPos]}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.optionText,
                      isSabotaged && !answered && s.optionTextBlurred,
                      isSelected && s.optionTextSelected,
                      isCorrect && s.optionTextCorrect,
                      isWrong && s.optionTextWrong,
                    ]}
                  >
                    {opt}
                  </Text>
                  {isCorrect && <Text style={s.checkMark}>✓</Text>}
                  {isSelected && <Text style={s.selectedMark}>→</Text>}
                  {isEliminated && (
                    <Animated.Text
                      style={[
                        s.scissorEmoji,
                        {
                          opacity: scissorAnims[originalIdx].interpolate({
                            inputRange: [0, 0.15, 0.85, 1],
                            outputRange: [0, 1, 1, 0],
                          }),
                          left: scissorAnims[originalIdx].interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-10%' as any, '102%' as any],
                          }),
                          transform: [
                            {
                              rotate: scissorAnims[originalIdx].interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: ['-12deg', '8deg', '-12deg'],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      ✂️
                    </Animated.Text>
                  )}
                  {isDoubleOption && displayPos === 0 && (
                    <View style={s.doubleBadge}>
                      <Text style={s.doubleBadgeText}>⚡×2</Text>
                    </View>
                  )}
                </>
              );

              if (isEliminated) {
                return (
                  <Animated.View
                    key={originalIdx}
                    style={[
                      s.option,
                      SHADOW.card,
                      {
                        opacity: fiftyAnims[originalIdx].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.1, 1],
                        }),
                        transform: [
                          {
                            scale: fiftyAnims[originalIdx].interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.96, 1],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    {optionContent}
                  </Animated.View>
                );
              }

              if (isSabotaged) {
                return (
                  <Animated.View
                    key={originalIdx}
                    style={[
                      s.option,
                      SHADOW.card,
                      isSelected && s.optionSelected,
                      isCorrect && s.optionCorrect,
                      isWrong && s.optionWrong,
                      isDisabled && s.optionDisabled,
                      {
                        opacity: sabotageStagger[displayPos],
                        transform: [
                          {
                            translateY: sabotageStagger[displayPos].interpolate({
                              inputRange: [0, 1],
                              outputRange: [-12, 0],
                            }),
                          },
                          {
                            scale: sabotageStagger[displayPos].interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [0.95, 1.02, 1],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={s.optionInner}
                      onPress={() => handleAnswer(originalIdx)}
                      disabled={answered}
                      activeOpacity={0.7}
                    >
                      {optionContent}
                    </TouchableOpacity>
                  </Animated.View>
                );
              }

              return (
                <TouchableOpacity
                  key={originalIdx}
                  style={[
                    s.option,
                    SHADOW.card,
                    isSelected && s.optionSelected,
                    isCorrect && s.optionCorrect,
                    isWrong && s.optionWrong,
                    isDisabled && !isEliminated && s.optionDisabled,
                    isDoubleOption && s.optionDouble,
                  ]}
                  onPress={() => handleAnswer(originalIdx)}
                  disabled={answered || isEliminated}
                  activeOpacity={0.7}
                >
                  {optionContent}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Wait message */}
        {answered && !stealTargetId && (
          <Text style={s.waitMsg}>Αναμονή για τους άλλους...</Text>
        )}

        {/* Who has answered */}
        {game && turn && (
          <View style={s.answeredStrip}>
            {Object.values(game.players).map((p) => {
              const done = p.id in turn.answers;
              const isSelf = p.id === playerId;
              return (
                <View
                  key={p.id}
                  style={[s.answeredChip, done && s.answeredChipDone, isSelf && !done && s.answeredChipSelf]}
                >
                  <Avatar name={p.name} size={22} />
                  <Text style={[s.answeredChipName, done && s.answeredChipNameDone]} numberOfLines={1}>
                    {isSelf ? 'Εσύ' : p.name}
                  </Text>
                  <Text style={[s.answeredChipStatus, done && s.answeredChipStatusDone]}>
                    {done ? '✓' : '...'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  scrollBody: { flex: 1 },
  scrollContent: { gap: 12, paddingBottom: 24 },

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

  // Help buttons
  helpRow: {
    flexDirection: 'row',
    gap: 8,
  },
  helpBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 2,
    gap: 4,
  },
  helpBtnFifty: {
    backgroundColor: 'rgba(61,220,151,0.12)',
    borderColor: C.green,
  },
  helpBtnSteal: {
    backgroundColor: 'rgba(255,79,109,0.12)',
    borderColor: C.primary,
  },
  helpBtnDouble: {
    backgroundColor: 'rgba(255,181,71,0.12)',
    borderColor: C.amber,
  },
  helpBtnDoubleActive: {
    backgroundColor: 'rgba(255,181,71,0.25)',
    shadowColor: C.amber,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
  helpBtnSabotage: {
    backgroundColor: 'rgba(124,92,255,0.12)',
    borderColor: '#7C5CFF',
  },
  helpBtnUsed: {
    opacity: 0.22,
    backgroundColor: C.surface,
    borderColor: C.line,
  },
  helpBtnEmoji: {
    fontSize: 24,
  },
  helpBtnLabel: {
    fontFamily: F.sansBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  helpBtnLabelFifty: { color: C.green },
  helpBtnLabelSteal: { color: C.primary },
  helpBtnLabelDouble: { color: C.amber },
  helpBtnLabelSabotage: { color: '#7C5CFF' },
  helpBtnLabelUsed: { color: C.inkMute },

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
  optionSelected: {
    borderColor: C.inkSoft,
    backgroundColor: C.surface2,
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
  optionEliminated: {
    opacity: 0.1,
  },

  optionLabelCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabelSelected: {
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.inkSoft,
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
  optionLabelTextSelected: {
    color: C.ink,
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
  optionTextBlurred: {
    color: 'transparent',
    textShadowColor: C.inkSoft,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  optionTextSelected: {
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
  selectedMark: {
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.inkSoft,
  },

  // ── 50/50 effect ──
  scissorEmoji: {
    position: 'absolute',
    fontSize: 22,
    top: '50%' as any,
    marginTop: -11,
    zIndex: 5,
  },

  // ── Double effect ──
  optionDouble: {
    borderColor: C.amber,
    backgroundColor: 'rgba(255,181,71,0.12)',
    shadowColor: C.amber,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  optionLabelDouble: {
    backgroundColor: C.amber,
  },
  optionLabelTextDouble: {
    color: '#3A2300',
  },
  doubleBadge: {
    position: 'absolute',
    top: -8,
    right: 14,
    backgroundColor: C.amber,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 3,
    zIndex: 4,
  },
  doubleBadgeText: {
    fontFamily: F.display,
    fontSize: 13,
    color: '#3A2300',
  },
  boltOverlay: {
    position: 'absolute',
    fontSize: 18,
    zIndex: 3,
  },

  // ── Steal effect ──
  fistOverlay: {
    position: 'absolute',
    fontSize: 38,
    zIndex: 10,
  },
  impactRing: {
    position: 'absolute',
    left: '50%' as any,
    top: '36%' as any,
    width: 70,
    height: 70,
    marginLeft: -35,
    marginTop: -35,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: C.primary,
    zIndex: 9,
  },
  stealBanner: {
    backgroundColor: 'rgba(255,79,109,0.14)',
    borderWidth: 1.5,
    borderColor: C.primary,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  stealBannerText: {
    fontFamily: F.sansBold,
    fontSize: 13,
    color: C.primary,
  },

  // ── Sabotage effect ──
  bombOverlay: {
    position: 'absolute',
    fontSize: 38,
    left: '50%' as any,
    marginLeft: -19,
    zIndex: 10,
  },
  boomOverlay: {
    position: 'absolute',
    left: '50%' as any,
    top: '38%' as any,
    marginLeft: -50,
    marginTop: -20,
    fontFamily: F.display,
    fontSize: 36,
    color: C.primary,
    zIndex: 9,
    textShadowColor: 'rgba(255,79,109,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    width: 100,
    textAlign: 'center',
  },
  sabotageBanner: {
    backgroundColor: 'rgba(255,79,109,0.15)',
    borderWidth: 1.5,
    borderColor: C.primary,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  sabotageBannerText: {
    fontFamily: F.sansBold,
    fontSize: 13,
    color: C.primary,
  },
  optionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  // Steal / sabotage picker
  stealBox: {
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  stealTitle: {
    fontFamily: F.sansBold,
    fontSize: 14,
    color: C.inkSoft,
    textAlign: 'center',
    marginBottom: 2,
  },
  stealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  stealPlayerName: {
    flex: 1,
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.ink,
  },
  stealArrow: {
    fontFamily: F.sansBold,
    fontSize: 18,
    color: C.primary,
  },
  stealCancelBtn: {
    alignSelf: 'center',
    marginTop: 2,
  },
  stealCancelText: {
    fontFamily: F.sansSemiBold,
    fontSize: 14,
    color: C.inkMute,
  },

  waitMsg: {
    textAlign: 'center',
    fontFamily: F.sansMedium,
    color: C.inkSoft,
    fontSize: 14,
  },

  answeredStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  answeredChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  answeredChipDone: {
    borderColor: C.green,
    backgroundColor: 'rgba(61,220,151,0.1)',
  },
  answeredChipSelf: {
    borderColor: C.primary,
  },
  answeredChipName: {
    fontFamily: F.sansMedium,
    fontSize: 12,
    color: C.inkSoft,
    maxWidth: 80,
  },
  answeredChipNameDone: {
    color: C.green,
  },
  answeredChipStatus: {
    fontFamily: F.sansBold,
    fontSize: 13,
    color: C.inkMute,
  },
  answeredChipStatusDone: {
    color: C.green,
  },
});

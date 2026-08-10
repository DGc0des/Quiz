import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useGame } from '../hooks/useGame';
import { useGamePresence, leavePresence } from '../hooks/useGamePresence';
import { leaveGame } from '../utils/leaveGame';
import { updateGame } from '../utils/updateGame';
import { RootStackParamList } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Mascot } from '../components/Mascot';
import { Avatar } from '../components/Avatar';
import { ScoreRow } from '../components/ScoreRow';

type Props = NativeStackScreenProps<RootStackParamList, 'TurnReveal'>;

export default function TurnRevealScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const insets = useSafeAreaInsets();
  const isHost = game?.players[playerId]?.isHost ?? false;
  const animatedValues = useRef<Animated.Value[]>([]);
  const didAnimate = useRef(false);
  const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGamePresence(gameId, playerId, game ?? null);

  useEffect(() => {
    if (!game || game.status !== 'turn_reveal' || didAnimate.current) return;
    didAnimate.current = true;

    const anims = game.turnOrder.map(() => new Animated.Value(0));
    animatedValues.current = anims;

    const animation = Animated.stagger(
      100,
      anims.map((anim, i) =>
        Animated.sequence([
          Animated.delay(i * 400),
          Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
        ])
      )
    );
    animation.start(() => {
      if (!isHost) return;
      advanceTimeout.current = setTimeout(() => {
        // `updateGame` primes the local cache, so the status-watching effect
        // below navigates to Turn on its own (no reliance on the realtime echo,
        // which may not reach the writer — fatal in solo play where the host
        // drives every transition).
        updateGame(
          gameId,
          (g) => {
            if (g.status !== 'turn_reveal') return null;
            const firstId = g.turnOrder[0];
            return {
              ...g,
              status: 'picking',
              currentTurn: {
                turnNumber: 1,
                activePlayerId: firstId,
                selectedPoints: null,
                selectedCategory: null,
                questionId: null,
                answers: {},
                timerStartedAt: Date.now(),
                status: 'picking',
              },
            };
          },
          { base: game },
        );
      }, 1500);
    });

    return () => {
      animation.stop();
      if (advanceTimeout.current) clearTimeout(advanceTimeout.current);
    };
  }, [game?.status]);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'picking') navigation.replace('Turn', { gameId, playerId });
    if (game.status === 'finished' && !game.winnerId) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
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

  if (!game) return null;

  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);

  return (
    <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Blobs />
      <TouchableOpacity style={[s.leaveBtn, { top: insets.top + 8 }]} onPress={handleLeave} activeOpacity={0.7}>
        <Text style={s.leaveBtnText}>×</Text>
      </TouchableOpacity>
      <View style={s.scoreRowWrap}>
        <ScoreRow players={players} selfId={playerId} />
      </View>
      <View style={s.container}>
        <Mascot size={88} mood="think" />
        <Text style={s.eyebrow}>Η ΤΥΧΑΙΑ ΣΕΙΡΑ ΕΙΝΑΙ...</Text>
        <Text style={s.title}>Σειρά Παιχτών</Text>

        <View style={s.list}>
          {players.map((player, i) => {
            const anim = animatedValues.current[i] ?? new Animated.Value(1);
            const isSelf = player.id === playerId;
            const isFirst = i === 0;

            return (
              <Animated.View
                key={player.id}
                style={[
                  s.row,
                  isSelf && s.rowSelf,
                  SHADOW.card,
                  {
                    opacity: anim,
                    transform: [
                      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
                      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
                    ],
                  },
                ]}
              >
                <View style={[s.posCircle, isFirst && s.posCircleFirst]}>
                  <Text style={[s.posText, isFirst && s.posTextFirst]}>{i + 1}</Text>
                </View>
                <Avatar name={player.name} size={36} />
                <Text style={s.name} numberOfLines={1}>
                  {player.name}
                  {isSelf ? ' (εσύ)' : ''}
                </Text>
                {isFirst && (
                  <View style={s.chip}>
                    <Text style={s.chipText}>Πρώτος!</Text>
                  </View>
                )}
              </Animated.View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scoreRowWrap: { paddingHorizontal: 24, paddingTop: 8 },
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
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  eyebrow: {
    fontFamily: F.sansBold,
    fontSize: 11,
    color: C.inkMute,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    fontFamily: F.bold,
    fontSize: 28,
    color: C.ink,
    marginTop: 4,
    marginBottom: 18,
    textAlign: 'center',
  },
  list: { width: '100%', gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowSelf: { borderColor: C.primary },
  posCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posCircleFirst: { backgroundColor: C.primary },
  posText: {
    fontFamily: F.display,
    fontSize: 18,
    color: C.inkSoft,
  },
  posTextFirst: { color: '#FFFFFF' },
  name: {
    flex: 1,
    fontFamily: F.sansBold,
    fontSize: 16,
    color: C.ink,
    textAlign: 'left',
  },
  chip: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: {
    fontFamily: F.sansBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
});

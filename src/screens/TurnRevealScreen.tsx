import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../config/supabase';
import { useGame } from '../hooks/useGame';
import { RootStackParamList, Game } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Mascot } from '../components/Mascot';
import { Avatar } from '../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'TurnReveal'>;

export default function TurnRevealScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const isHost = game?.players[playerId]?.isHost ?? false;
  const animatedValues = useRef<Animated.Value[]>([]);
  const didAnimate = useRef(false);

  useEffect(() => {
    if (!game || game.status !== 'turn_reveal' || didAnimate.current) return;
    didAnimate.current = true;

    const anims = game.turnOrder.map(() => new Animated.Value(0));
    animatedValues.current = anims;

    Animated.stagger(
      100,
      anims.map((anim, i) =>
        Animated.sequence([
          Animated.delay(i * 400),
          Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
        ])
      )
    ).start(() => {
      if (!isHost) return;
      setTimeout(async () => {
        const firstId = game.turnOrder[0];
        const updated: Game = {
          ...game,
          status: 'picking',
          currentTurn: {
            turnNumber: 1,
            activePlayerId: firstId,
            selectedPoints: null,
            selectedCategory: null,
            questionId: null,
            answers: {},
            timerStartedAt: null,
            status: 'picking',
          },
        };
        await supabase.from('games').update({ data: updated }).eq('id', gameId);
      }, 1500);
    });
  }, [game?.status]);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'picking') navigation.replace('Turn', { gameId, playerId });
  }, [game?.status]);

  if (!game) return null;

  const players = game.turnOrder.map((id) => game.players[id]).filter(Boolean);

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
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

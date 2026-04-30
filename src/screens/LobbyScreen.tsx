import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../config/supabase';
import { useGame } from '../hooks/useGame';
import { shuffle } from '../utils/shuffle';
import { RootStackParamList, Player, Game } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Avatar } from '../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

export default function LobbyScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game, loading } = useGame(gameId);

  const isHost = game?.players[playerId]?.isHost ?? false;
  const players = game ? Object.values(game.players).sort((a, b) => a.joinedAt - b.joinedAt) : [];

  useEffect(() => {
    if (!game) return;
    if (game.status === 'turn_reveal') {
      navigation.replace('TurnReveal', { gameId, playerId });
    }
  }, [game?.status]);

  const handleStart = async () => {
    if (!game) return;
    const shuffled = shuffle(players.map((p) => p.id));
    const updated: Game = { ...game, status: 'turn_reveal', turnOrder: shuffled, currentTurnIndex: 0 };
    await supabase.from('games').update({ data: updated }).eq('id', gameId);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={C.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const hintText = isHost
    ? players.length < 2
      ? 'Περίμενε τουλάχιστον έναν ακόμα παίκτη...'
      : 'Έτοιμοι! Πάτα Έναρξη για να ξεκινήσετε.'
    : 'Αναμονή ξεκινήματος από τον δημιουργό...';

  return (
    <SafeAreaView style={s.safe}>
      <Blobs />
      <View style={s.container}>
        <Text style={s.eyebrow}>Αίθουσα Αναμονής</Text>
        <Text style={s.title}>Έτοιμοι;</Text>

        {/* Code + QR card */}
        <View style={[s.card, SHADOW.card]}>
          <View style={s.cardInner}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardEyebrow}>Κωδικός παιχνιδιού</Text>
              <Text style={s.codeText}>{gameId}</Text>
            </View>
            <View style={s.qrWrap}>
              <QRCode
                value={`quizapp://join/${gameId}`}
                size={44}
                backgroundColor={C.bg2}
                color={C.ink}
              />
            </View>
          </View>
        </View>

        {/* Players header row */}
        <View style={s.playersHeader}>
          <Text style={s.eyebrowLeft}>Παίκτες ({players.length})</Text>
          <View style={s.liveChip}>
            <Text style={s.liveChipText}>●  Live</Text>
          </View>
        </View>

        {/* Player list */}
        <FlatList
          data={players}
          keyExtractor={(item) => item.id}
          style={s.list}
          contentContainerStyle={{ paddingBottom: 8 }}
          renderItem={({ item }: { item: Player }) => {
            const isSelf = item.id === playerId;
            return (
              <View style={[s.playerRow, SHADOW.card, isSelf && s.playerRowSelf]}>
                <Avatar name={item.name} size={38} />
                <View style={s.playerInfo}>
                  <Text style={s.playerName} numberOfLines={1}>
                    {item.name}{isSelf ? ' (εσύ)' : ''}
                  </Text>
                  <Text style={s.playerSub}>
                    {item.isHost ? '👑 Δημιουργός' : 'Έτοιμος'}
                  </Text>
                </View>
                {!item.isHost && (
                  <View style={s.greenDot} />
                )}
              </View>
            );
          }}
          ListFooterComponent={
            <View style={s.emptySlot}>
              <Text style={s.emptySlotText}>+ Περιμένουμε κι άλλους...</Text>
            </View>
          }
        />

        <Text style={s.hint}>{hintText}</Text>

        {isHost && (
          <View style={{ width: '100%', marginBottom: 16, gap: 10 }}>
            <View>
              <TouchableOpacity
                style={[s.primaryBtn, players.length < 2 && s.disabled]}
                disabled={players.length < 2}
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontSize: 11,
    fontFamily: F.sansBold,
    color: C.inkMute,
    textAlign: 'center',
    marginBottom: 4,
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
    width: 56,
    height: 56,
    backgroundColor: C.bg2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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

  list: { flex: 1 },
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

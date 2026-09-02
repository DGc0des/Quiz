import { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../config/supabase';
import { generateGameId } from '../utils/gameId';
import { updateGame } from '../utils/updateGame';
import { runGameWrite, reportWriteError } from '../utils/reportWriteError';
import { WIN_SCORE } from '../utils/scoring';
import { useGame } from '../hooks/useGame';
import { leavePresence } from '../hooks/useGamePresence';
import { RootStackParamList, Game } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { Mascot } from '../components/Mascot';
import { Avatar } from '../components/Avatar';
import { TeamScoreRow } from '../components/TeamScoreRow';
import {
  effectiveLeaderId,
  isTeamGame,
  teamOf,
  teamRosterOrder,
  TEAM_COLORS,
} from '../utils/teams';
import { RoundHistory } from '../components/RoundHistory';
import { SeriesWins } from '../components/SeriesWins';

type Props = NativeStackScreenProps<RootStackParamList, 'Winner'>;

const CONFETTI_COLORS = ['#FF4F6D', '#FFB547', '#3DDC97', '#7C5CFF', '#5BD0F3', '#FF8FB1'];
const CONFETTI_COUNT = 28;

function ConfettiLayer() {
  const pieces = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: (i / CONFETTI_COUNT) * 3500,
    }));
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} left={p.left} color={p.color} delay={p.delay} />
      ))}
    </View>
  );
}

function ConfettiPiece({
  left,
  color,
  delay,
}: {
  left: number;
  color: string;
  delay: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 700],
  });
  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${left}%` as any,
        top: 0,
        width: 10,
        height: 14,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY }, { rotate }],
      }}
    />
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function WinnerScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const insets = useSafeAreaInsets();
  const [creatingRematch, setCreatingRematch] = useState(false);
  const navigatedRef = useRef(false);

  // Team mode wins are a side's, not a player's — `winnerId` stays null there.
  const teamGame = isTeamGame(game);
  const winningTeam = teamGame && game.winnerTeamId ? game.teams[game.winnerTeamId] : null;
  const winner = game?.winnerId ? game.players[game.winnerId] : null;
  const isWinner = teamGame
    ? teamOf(game, playerId)?.id === game?.winnerTeamId
    : winner?.id === playerId;
  const isHost = game?.players[playerId]?.isHost ?? false;
  const sortedPlayers = !game
    ? []
    : isTeamGame(game)
      // `Player.score` stays 0 all game in team mode, so ranking on it would
      // scatter teammates and show a column of zeroes.
      ? teamRosterOrder(game, playerId)
      : Object.values(game.players).sort((a, b) => b.score - a.score);

  // All players: auto-navigate when the host creates a rematch
  useEffect(() => {
    if (!game?.rematchGameId || navigatedRef.current) return;
    navigatedRef.current = true;
    leavePresence(gameId); // tear down the finished game's presence channel
    navigation.replace('Lobby', { gameId: game.rematchGameId, playerId });
  }, [game?.rematchGameId]);

  const handleRematch = async () => {
    if (!game || creatingRematch) return;
    setCreatingRematch(true);

    const newGameId = generateGameId();

    // Reset all players' scores, keep the original host
    const resetPlayers: Game['players'] = {};
    for (const [id, p] of Object.entries(game.players)) {
      resetPlayers[id] = { ...p, score: 0, joinedAt: Date.now(), usedHelps: { fifty: false, steal: false, double: false, sabotage: false } };
    }

    const newGame: Game = {
      id: newGameId,
      status: 'lobby',
      players: resetPlayers,
      turnOrder: [],
      currentTurnIndex: 0,
      currentTurn: null,
      createdAt: Date.now(),
      winnerId: null,
      winnerTeamId: null,
      // Teams are re-drawn by `start_team_game` on every start, so a rematch
      // carries the *mode* forward but never the previous split.
      mode: game.mode ?? 'solo',
      teams: null,
      rematchGameId: null,
      // Reset per rematch — carrying these over drains the question pool across
      // a few rematches and eventually starves picking (see PROJECT_STATUS.md §4.3 L7/L8).
      // A rematch is a fresh game, so repeats from a prior game are fine.
      usedQuestionIds: [],
      roundHistory: [],
      // The one thing a rematch *keeps*: the running series tally, which
      // close_review bumped for the winner of the game that just ended.
      seriesWins: game.seriesWins ?? {},
      winScore: game.winScore ?? WIN_SCORE,
      version: 0,
    };

    const { error } = await supabase.from('games').insert({
      id: newGameId,
      data: newGame,
    });

    if (error) {
      // Silently clearing the flag left the button looking dead — say why.
      setCreatingRematch(false);
      reportWriteError('Η ρεβάνς', error);
      return;
    }

    // Signal all players to follow by setting rematchGameId on the old game
    // The rematch row exists; this only tells the others to follow. If it fails
    // the player who tapped is stuck on this screen, so clear the flag to allow
    // a retry — the mutator is a no-op once `rematchGameId` is already set.
    const { ok } = await runGameWrite('Η ρεβάνς', () =>
      updateGame(gameId, (g) => (g.rematchGameId ? null : { ...g, rematchGameId: newGameId }), {
        base: game,
      }),
    );
    if (!ok) setCreatingRematch(false);
  };

  return (
    <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Blobs />
      <ConfettiLayer />

      <ScrollView
        contentContainerStyle={s.scroll}
        style={{ zIndex: 2 }}
        showsVerticalScrollIndicator={false}
      >
        <Mascot size={108} mood="cheer" />

        <Text style={s.eyebrow}>{isWinner ? 'Κερδίσατε!' : 'Νικήτρια ομάδα'}</Text>
        <Text
          style={[
            s.winnerName,
            winningTeam ? { color: TEAM_COLORS[winningTeam.id] } : null,
          ]}
        >
          {winningTeam ? winningTeam.name : (winner?.name ?? '—')}
        </Text>

        <View style={s.scoreDisplay}>
          <Text style={s.scoreBig}>{winningTeam ? winningTeam.score : (winner?.score ?? 0)}</Text>
          <Text style={s.scoreLabel}>βαθμοί</Text>
        </View>

        {teamGame && game && (
          <TeamScoreRow game={game} myTeamId={teamOf(game, playerId)?.id} />
        )}

        <Text style={s.rankingEyebrow}>
          {teamGame ? 'Οι ομάδες' : 'Τελική Κατάταξη'}
        </Text>

        {sortedPlayers.map((p, i) => (
          <View
            key={p.id}
            style={[s.playerRow, SHADOW.card, p.id === playerId && s.playerRowSelf]}
          >
            <View style={s.medalCol}>
              {teamGame ? (
                // Medals rank by score; in team mode there is no player score to
                // rank. Mark the leader instead — the one whose answer scored.
                <Text style={s.medalEmoji}>
                  {isTeamGame(game) && teamOf(game, p.id) &&
                  effectiveLeaderId(teamOf(game, p.id)!, game.players) === p.id
                    ? '★'
                    : ''}
                </Text>
              ) : i < 3 ? (
                <Text style={s.medalEmoji}>{MEDALS[i]}</Text>
              ) : (
                <Text style={s.rankNumber}>{i + 1}</Text>
              )}
            </View>
            <Avatar name={p.name} size={36} />
            <Text style={s.playerName} numberOfLines={1}>
              {p.name}
              {p.id === playerId ? ' (εσύ)' : ''}
            </Text>
            {teamGame ? (
              <Text
                style={[
                  s.playerTeamTag,
                  { color: TEAM_COLORS[teamOf(game, p.id)?.id ?? 'red'] },
                ]}
                numberOfLines={1}
              >
                {teamOf(game, p.id)?.name ?? '—'}
              </Text>
            ) : (
              <Text style={s.playerScore}>{p.score}</Text>
            )}
          </View>
        ))}

        <SeriesWins
          seriesWins={game?.seriesWins}
          players={game?.players ?? {}}
          selfId={playerId}
        />

        {game && (
          <RoundHistory
            history={game.roundHistory}
            game={game}
            selfId={isTeamGame(game) ? (teamOf(game, playerId)?.id ?? '') : playerId}
          />
        )}

        {isHost ? (
          <TouchableOpacity
            style={[s.primaryBtn, creatingRematch && s.disabled]}
            onPress={handleRematch}
            disabled={creatingRematch}
            activeOpacity={0.8}
          >
            {creatingRematch ? (
              <ActivityIndicator color={C.primaryInk} />
            ) : (
              <Text style={s.primaryBtnText}>↻ Νέο Παιχνίδι</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={s.waitContainer}>
            <ActivityIndicator color={C.inkMute} size="small" />
            <Text style={s.waitText}>Αναμονή νέου παιχνιδιού...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 30, alignItems: 'center', gap: 6 },

  eyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 14,
    color: C.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  winnerName: {
    fontFamily: F.extraBold,
    fontSize: 38,
    color: C.primary,
  },

  scoreDisplay: { alignItems: 'center', marginTop: 4 },
  scoreBig: {
    fontFamily: F.display,
    fontSize: 48,
    color: C.ink,
  },
  scoreLabel: {
    fontFamily: F.sansBold,
    fontSize: 14,
    color: C.inkSoft,
    marginTop: -4,
  },

  rankingEyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 12,
    color: C.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 1,
    alignSelf: 'flex-start',
    marginTop: 20,
    marginBottom: 8,
    width: '100%',
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
    width: '100%',
  },
  playerRowSelf: { borderColor: C.primary },

  medalCol: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: { fontSize: 22 },
  rankNumber: {
    fontFamily: F.display,
    fontSize: 18,
    color: C.inkMute,
  },

  playerName: {
    fontFamily: F.sansBold,
    fontSize: 15,
    color: C.ink,
    flex: 1,
  },
  playerTeamTag: { fontFamily: F.sansBold, fontSize: 12 },
  playerScore: {
    fontFamily: F.display,
    fontSize: 22,
    color: C.ink,
  },

  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 32,
    width: '100%',
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
  disabled: { opacity: 0.5 },
  waitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 32,
  },
  waitText: {
    fontFamily: F.sansMedium,
    fontSize: 14,
    color: C.inkMute,
  },
});

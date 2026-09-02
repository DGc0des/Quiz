import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
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

type Props = NativeStackScreenProps<RootStackParamList, 'Loser'>;

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LoserScreen({ route, navigation }: Props) {
  const { gameId, playerId } = route.params;
  const { game } = useGame(gameId);
  const insets = useSafeAreaInsets();
  const [creatingRematch, setCreatingRematch] = useState(false);
  const navigatedRef = useRef(false);

  const isHost = game?.players[playerId]?.isHost ?? false;
  const sortedPlayers = !game
    ? []
    : isTeamGame(game)
      // `Player.score` stays 0 all game in team mode, so ranking on it would
      // scatter teammates and show a column of zeroes.
      ? teamRosterOrder(game, playerId)
      : Object.values(game.players).sort((a, b) => b.score - a.score);

  const me = game?.players[playerId];
  const myRank = sortedPlayers.findIndex((p) => p.id === playerId) + 1;
  const winner = sortedPlayers[0];

  // Team mode: the placement chip and the gap are about the *sides*, since a
  // player's own score is never banked there.
  const teamGame = isTeamGame(game);
  const myTeam = teamOf(game, playerId);
  const winningTeam = teamGame && game.winnerTeamId ? game.teams[game.winnerTeamId] : null;
  const gap = teamGame
    ? winningTeam && myTeam
      ? winningTeam.score - myTeam.score
      : 0
    : winner && me
      ? winner.score - me.score
      : 0;

  const placeLabel =
    myRank === 2
      ? '2η θέση'
      : myRank === 3
      ? '3η θέση'
      : `${myRank}η θέση`;

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

      <ScrollView
        contentContainerStyle={s.scroll}
        style={{ zIndex: 2 }}
        showsVerticalScrollIndicator={false}
      >
        <Mascot size={108} mood="sad" />

        <Text style={s.eyebrow}>Τέλος Παιχνιδιού</Text>
        <Text style={s.headline}>Καλή προσπάθεια!</Text>

        {/* placement chip */}
        {teamGame ? (
          <>
            <View style={s.placementChip}>
              <Text style={s.placementLabel}>Η ομάδα σου</Text>
              <Text
                style={[
                  s.placementRank,
                  myTeam ? { color: TEAM_COLORS[myTeam.id] } : null,
                ]}
              >
                {myTeam?.name ?? '—'}
              </Text>
              <Text style={s.placementScore}>· {myTeam?.score ?? 0} βαθμοί</Text>
            </View>
            {game && <TeamScoreRow game={game} myTeamId={myTeam?.id} />}
          </>
        ) : (
          <View style={s.placementChip}>
            <Text style={s.placementLabel}>Τερμάτισες</Text>
            <Text style={s.placementRank}>{placeLabel}</Text>
            <Text style={s.placementScore}>· {me?.score ?? 0} βαθμοί</Text>
          </View>
        )}

        {/* encouraging gap line */}
        {gap > 0 && (winningTeam || winner) && (
          <Text style={s.gapText}>
            Την επόμενη φορά!{' '}
            <Text style={s.gapHighlight}>
              {winningTeam ? winningTeam.name : winner.name} +{gap}
            </Text>
          </Text>
        )}

        <Text style={s.rankingEyebrow}>Τελική Κατάταξη</Text>

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
              <Text style={s.primaryBtnText}>↻ Ρεβάνς</Text>
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
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 26,
    alignItems: 'center',
    gap: 6,
  },

  eyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 14,
    color: C.inkMute,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  headline: {
    fontFamily: F.extraBold,
    fontSize: 34,
    color: C.ink,
    textAlign: 'center',
    lineHeight: 38,
  },

  placementChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    marginTop: 6,
  },
  placementLabel: {
    fontFamily: F.sansBold,
    fontSize: 13,
    color: C.inkSoft,
    letterSpacing: 0.4,
  },
  placementRank: {
    fontFamily: F.display,
    fontSize: 22,
    color: C.ink,
    lineHeight: 26,
  },
  placementScore: {
    fontFamily: F.bold,
    fontSize: 14,
    color: C.inkMute,
  },

  gapText: {
    fontFamily: F.sansSemiBold,
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
    marginTop: 8,
  },
  gapHighlight: {
    color: C.inkSoft,
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

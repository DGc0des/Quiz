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
import { runGameWrite, reportWriteError, logWriteError } from '../utils/reportWriteError';
import { closeReview } from '../utils/gameRpc';
import { useGamePresence, leavePresence } from '../hooks/useGamePresence';
import { finishedDestination } from '../utils/gameFlow';
import { RootStackParamList } from '../types';
import { C, F, SHADOW } from '../theme';
import { Blobs } from '../components/Blobs';
import { TeamScoreRow } from '../components/TeamScoreRow';
import {
  effectiveLeaderId,
  isTeamGame,
  teamOf,
  teamRosterOrder,
  TEAM_COLORS,
} from '../utils/teams';
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
      const dest = finishedDestination(game, playerId);
      if (dest === 'Home') {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        return;
      }
      navigation.replace(dest, { gameId, playerId });
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
            // Leaving must never trap the player: if the write fails we say so
            // and go Home anyway — the presence janitor removes them server-side.
            await runGameWrite('Η έξοδος', () => leaveGame(gameId, playerId, game));
            leavePresence(gameId);
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          },
        },
      ],
    );
  };

  // Banking the round is the server's job: it already computed each player's
  // points into `turn.resolved` when the round closed, and it owns the winner
  // rule. `close_review` applies them and opens the next turn.
  //
  // Two callers with different failure handling: the host tapping the button
  // wants to be told why nothing happened; the 90s auto-advance fires on every
  // client at once, so it logs instead of stacking a dialog on each device.
  const advanceRound = async ({ silent = false } = {}) => {
    if (!game || !game.currentTurn || advancedRef.current) return;
    advancedRef.current = true;

    try {
      const result = await closeReview(gameId);
      if (!result.ok) {
        advancedRef.current = false;
        return;
      }
    } catch (e: unknown) {
      // Release the one-shot guard so a tap can still retry the advance.
      advancedRef.current = false;
      if (silent) logWriteError('Ο επόμενος γύρος', e);
      else reportWriteError('Ο επόμενος γύρος', e);
      return;
    }
    // No explicit navigation: the RPC wrapper primes the local cache, so the
    // status-watching effect above advances to Turn / Winner / Loser on its own.
  };

  /** The host's "Επόμενος Γύρος" tap. */
  const handleNext = () => advanceRound();

  // Reset the one-shot guard whenever a new review phase begins.
  useEffect(() => {
    advancedRef.current = false;
  }, [reviewStartedAt]);

  // Auto-advance if nobody taps "Επόμενος Γύρος" in REVIEW_SECONDS. Any client
  // may fire — `advanceRound` is guarded by `close_review` (version-checked, only
  // the first write lands) plus `advancedRef`, so concurrent fires are safe.
  // This also keeps the game moving if the host stalls or disconnects.
  useEffect(() => {
    if (reviewStartedAt === null || game?.status !== 'reviewing') return;
    if (reviewRemaining > 0 || advancedRef.current) return;
    advanceRound({ silent: true });
  }, [reviewRemaining, game?.status, reviewStartedAt]);

  if (!game || !game.currentTurn) return null;

  const turn = game.currentTurn;
  const question = turn.questionId ? getQuestionById(turn.questionId) : null;

  // Both the answer and the per-player outcome are written by the server when
  // the round closes (see 0006_authoritative_scoring.sql) — the app no longer
  // ships the answer key, so there is nothing to recompute here.
  const resolved = turn.resolved ?? {};
  const isNumericQ = question?.type === 'numeric';
  const correctIndex = turn.reveal?.correctIndex ?? null;
  const correctValue = turn.reveal?.correctValue ?? null;
  const correctText = !question
    ? ''
    : question.type === 'numeric'
      ? correctValue === null
        ? '—'
        : `${formatNum(correctValue)}${question.unit ? ' ' + question.unit : ''}`
      : correctIndex === null
        ? '—'
        : question.options[correctIndex];

  // In team mode the points went to the *side*, not to any player, so no
  // per-player badge is shown — `turn.teamResolved` is the authoritative
  // result and `turn.resolved` is not written at all.
  const teamGame = isTeamGame(game);
  const teamResolved = turn.teamResolved ?? null;

  const earnedMap: Record<string, number> = {};
  for (const id of Object.keys(game.players)) {
    earnedMap[id] = teamGame ? 0 : (resolved[id]?.earned ?? 0);
  }

  // Ranking by score is meaningless in team mode — nobody's moves — so group
  // the list by side instead, with your own team first.
  const sortedPlayers = teamGame
    ? teamRosterOrder(game, playerId)
    : Object.values(game.players).sort(
        (a, b) => (b.score + earnedMap[b.id]) - (a.score + earnedMap[a.id]),
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

        {teamGame && (
          <>
            <Text style={s.sectionEyebrow}>Αποτελέσματα ομάδων</Text>
            <TeamScoreRow
              game={game}
              myTeamId={teamOf(game, playerId)?.id}
              pending={teamResolved}
            />
            <View style={s.teamOutcomes}>
              {(['red', 'blue'] as const).map((tid) => {
                const t = game.teams?.[tid];
                const r = teamResolved?.[tid];
                if (!t) return null;
                return (
                  <View key={tid} style={s.teamOutcomeRow}>
                    <Text style={[s.teamOutcomeName, { color: TEAM_COLORS[tid] }]}>
                      {t.name}
                    </Text>
                    <Text style={s.teamOutcomeText}>
                      {r?.isCorrect ? '✓ Σωστά' : '✗ Λάθος'}
                      {r && r.earned > 0 ? `  +${r.earned}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={s.sectionEyebrow}>
          {teamGame ? 'Τι απάντησε ο καθένας' : 'Αποτελέσματα παικτών'}
        </Text>

        {sortedPlayers.map((player) => {
          const rawAnswer = turn.answers[player.id];
          const resolvedAns = resolved[player.id];
          // Team mode writes no per-player `resolved`, so correctness comes from
          // the answer itself — which `submit_answer` decided at submit time for
          // a choice question. On a numeric round "closest" is relative and only
          // the leaders were compared, so no individual verdict exists.
          const isCorrect = teamGame
            ? !isNumericQ && (rawAnswer?.isCorrect ?? false)
            : (resolvedAns?.isCorrect ?? false);
          const isSelf = player.id === playerId;
          const hasDouble = turn.activeHelps?.[player.id]?.double;
          const hasFifty = turn.activeHelps?.[player.id]?.fifty;
          const stolenFrom = rawAnswer?.stolenFrom;
          const stealTargetName = stolenFrom ? game.players[stolenFrom]?.name : undefined;
          const earned = earnedMap[player.id] ?? 0;
          const noAnswer = rawAnswer === undefined;

          // In team mode the points went to the *side*, so no per-player total
          // moves and no "+N βαθμ." belongs on a player's line — appending
          // "+0 βαθμ." to a correct answer reads as a bug, because it looks like
          // one. The side's points are shown once, on the leader's row, which is
          // also the row that explains where they came from.
          const rowTeam = teamGame ? teamOf(game, player.id) : null;
          const isRowLeader =
            !!rowTeam && effectiveLeaderId(rowTeam, game.players) === player.id;
          const teamEarned = rowTeam ? (teamResolved?.[rowTeam.id]?.earned ?? 0) : 0;
          const pts = teamGame ? '' : ` +${earned} βαθμ.`;

          let verdictText: string;
          let verdictStyle: object;
          if (noAnswer) {
            verdictText = '— δεν απάντησε';
            verdictStyle = s.verdictMute;
          } else if (isNumericQ) {
            const guess = teamGame ? rawAnswer?.answerValue : resolvedAns?.answerValue;
            const stealNote = stolenFrom ? `👊 ${stealTargetName} · ` : '';
            if (guess == null) {
              verdictText = '— δεν απάντησε';
              verdictStyle = s.verdictMute;
            } else if (isCorrect) {
              verdictText = `${stealNote}🎯 ${formatNum(guess)} · Πλησιέστερα!${hasDouble ? ' ⚡×2' : ''}${pts}`;
              verdictStyle = s.verdictCorrect;
            } else {
              const dist = Math.abs(guess - (correctValue ?? 0));
              verdictText = `${stealNote}${formatNum(guess)} · απόκλιση ${formatNum(dist)}`;
              verdictStyle = s.verdictWrong;
            }
          } else if (stolenFrom) {
            verdictText = isCorrect
              ? `👊 Έκλεψε από ${stealTargetName} ·${pts || ' Σωστά'}`
              : `👊 Έκλεψε από ${stealTargetName} · Λάθος`;
            verdictStyle = isCorrect ? s.verdictCorrect : s.verdictWrong;
          } else if (hasDouble && hasFifty && isCorrect) {
            verdictText = `✂️⚡ ×2 Σωστά!${pts}`;
            verdictStyle = s.verdictCorrect;
          } else if (hasDouble && isCorrect) {
            verdictText = `⚡ ×2 Σωστά!${pts}`;
            verdictStyle = s.verdictCorrect;
          } else if (hasFifty && isCorrect) {
            verdictText = `✂️ 50/50 Σωστά!${pts}`;
            verdictStyle = s.verdictCorrect;
          } else if (isCorrect) {
            verdictText = `✓ Σωστά!${pts}`;
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
                  {isRowLeader && rowTeam ? (
                    <Text style={[s.leaderTag, { color: TEAM_COLORS[rowTeam.id] }]}>
                      {'  ★ αρχηγός'}
                    </Text>
                  ) : null}
                </Text>
                <Text style={[s.verdict, verdictStyle]}>{verdictText}</Text>
              </View>
              {teamGame ? (
                <Text style={s.totalScore}>
                  {isRowLeader && teamEarned > 0 ? `+${teamEarned}` : ''}
                </Text>
              ) : (
                <Text style={s.totalScore}>{player.score + earned}</Text>
              )}
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

  teamOutcomes: { width: '100%', gap: 4, marginTop: 8 },
  teamOutcomeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  teamOutcomeName: { fontFamily: F.sansBold, fontSize: 13 },
  teamOutcomeText: { fontFamily: F.sansSemiBold, fontSize: 13, color: C.inkSoft },
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

  leaderTag: { fontFamily: F.sansBold, fontSize: 11 },
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

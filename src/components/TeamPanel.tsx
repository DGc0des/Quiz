import { View, Text, StyleSheet } from 'react-native';
import { Game, PlayerAnswer, Team } from '../types';
import { effectiveLeaderId, teammatesOf, TEAM_COLORS } from '../utils/teams';
import { C, F } from '../theme';
import { Avatar } from './Avatar';

const OPTION_LABELS = ['Α', 'Β', 'Γ', 'Δ'];

type Props = {
  game: Game;
  team: Team;
  playerId: string;
  isLeader: boolean;
  answers: Record<string, PlayerAnswer>;
};

/**
 * The team half of the question screen.
 *
 * For a **leader**: their teammates' answers as they come in, which is the
 * whole point of the role — they read the room, then answer for the side.
 * For a **teammate**: who is deciding, so it is obvious their answer is advice
 * rather than the one that scores.
 *
 * Deliberately shows only *this* team's answers. The other side's are in the
 * same game blob (they always have been, in solo too), but nothing surfaces
 * them — see PROJECT_STATUS.md §4 on that pre-existing leak.
 */
export function TeamPanel({ game, team, playerId, isLeader, answers }: Props) {
  const leaderId = effectiveLeaderId(team, game.players);
  const leader = leaderId ? game.players[leaderId] : null;
  const accent = TEAM_COLORS[team.id];

  const describe = (a: PlayerAnswer | undefined): string => {
    if (!a) return '—';
    if (a.stolenFrom) return '👊 κλοπή';
    if (a.answerValue != null) return String(a.answerValue);
    if (a.answerIndex != null) return OPTION_LABELS[a.answerIndex] ?? '—';
    return '—';   // answered with nothing (the timer ran out)
  };

  if (!isLeader) {
    return (
      <View style={[s.wrap, { borderColor: accent }]}>
        <Text style={[s.eyebrow, { color: accent }]}>{team.name}</Text>
        <Text style={s.note}>
          {leader
            ? `Η απάντησή σου είναι πρόταση — αποφασίζει ο/η ${leader.name}.`
            : 'Η ομάδα σου δεν έχει αρχηγό αυτή τη στιγμή.'}
        </Text>
      </View>
    );
  }

  const mates = teammatesOf(game, playerId);

  return (
    <View style={[s.wrap, { borderColor: accent }]}>
      <Text style={[s.eyebrow, { color: accent }]}>
        {team.name} · είσαι αρχηγός
      </Text>

      {mates.length === 0 ? (
        <Text style={s.note}>Δεν έχεις συμπαίκτες αυτή τη στιγμή.</Text>
      ) : (
        <>
          <Text style={s.note}>Η ομάδα σου πρότεινε:</Text>
          {mates.map((m) => {
            const a = answers[m.id];
            return (
              <View key={m.id} style={s.row}>
                <Avatar name={m.name} size={26} />
                <Text style={s.name} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={[s.answer, !a && s.answerWaiting]}>
                  {a ? describe(a) : 'σκέφτεται…'}
                </Text>
              </View>
            );
          })}
        </>
      )}

      <Text style={s.decide}>Η τελική απάντηση είναι δική σου.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 6,
  },
  eyebrow: {
    fontFamily: F.sansBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  note: { fontFamily: F.sans, fontSize: 12, color: C.inkSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: F.sansSemiBold, fontSize: 13, color: C.ink },
  answer: { fontFamily: F.display, fontSize: 15, color: C.green },
  answerWaiting: { fontFamily: F.sans, fontSize: 11, color: C.inkMute },
  decide: {
    fontFamily: F.sansSemiBold,
    fontSize: 11,
    color: C.amber,
    marginTop: 2,
  },
});

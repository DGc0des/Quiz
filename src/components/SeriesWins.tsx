import { View, Text, StyleSheet } from 'react-native';
import { Player } from '../types';
import { buildSeriesStandings, totalSeriesGames } from '../utils/seriesWins';
import { C, F } from '../theme';

type Props = {
  seriesWins: Record<string, number> | undefined;
  players: Record<string, Player>;
  selfId: string;
};

/** Beyond this many wins the trophies stop being countable at a glance. */
const MAX_TROPHIES = 6;

/**
 * The running "3–2" across a rematch series — one line per player, a trophy per
 * game won. `close_review` increments the winner; the rematch carries the tally
 * into the new game.
 *
 * Renders nothing until the first game is decided, so the very first lobby of a
 * series doesn't show a board of zeroes.
 */
export function SeriesWins({ seriesWins, players, selfId }: Props) {
  const standings = buildSeriesStandings(seriesWins, players);
  const played = totalSeriesGames(standings);

  if (played === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.eyebrow}>Σειρά Νικών</Text>
        <Text style={s.played}>
          {played} {played === 1 ? 'παιχνίδι' : 'παιχνίδια'}
        </Text>
      </View>

      <View style={s.card}>
        {standings.map((st, i) => {
          const isSelf = st.id === selfId;
          const isLeader = st.wins > 0 && st.wins === standings[0].wins;
          return (
            <View key={st.id} style={[s.row, i > 0 && s.rowDivider]}>
              <Text style={[s.name, isSelf && s.selfText]} numberOfLines={1}>
                {st.name}
                {isSelf ? ' (εσύ)' : ''}
              </Text>

              <Text style={s.trophies} numberOfLines={1}>
                {st.wins > MAX_TROPHIES ? '🏆' : '🏆'.repeat(st.wins)}
              </Text>

              <Text style={[s.count, isLeader && s.countLeader]}>
                {st.wins > MAX_TROPHIES ? `×${st.wins}` : st.wins}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', marginTop: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.inkMute,
  },
  played: { fontFamily: F.sans, fontSize: 11, color: C.inkMute },

  card: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: C.line },

  name: { flex: 1, fontFamily: F.sansBold, fontSize: 14, color: C.ink },
  trophies: { fontSize: 13, flexShrink: 1 },
  count: {
    fontFamily: F.display,
    fontSize: 17,
    color: C.inkMute,
    minWidth: 28,
    textAlign: 'right',
  },
  countLeader: { color: C.amber },
  selfText: { color: C.primary },
});

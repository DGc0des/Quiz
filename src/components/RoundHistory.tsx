import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Game, RoundRecord } from '../types';
import { buildRoundHistory, playerColumns, teamColumns } from '../utils/roundHistory';
import { isTeamGame } from '../utils/teams';
import { C, F } from '../theme';

type Props = {
  history: RoundRecord[] | undefined;
  game: Game;
  /** Highlighted column — the player in solo, their team in team mode. */
  selfId: string;
};

/** Row height, shared by the pinned round column and the scrolling grid so the
 *  two halves stay aligned — they are separate view trees, not one table. */
const ROW_H = 44;
const HEAD_H = 34;
const COL_W = 62;

/**
 * Per-round score breakdown for a finished game. Renders `Game.roundHistory`
 * (written server-side by `close_review`) as a table: one row per round, one
 * column per player still in the game.
 *
 * The round column is pinned outside the horizontal ScrollView so you can still
 * tell which round you are reading with a full lobby of 12 players scrolled off
 * to the right.
 */
export function RoundHistory({ history, game, selfId }: Props) {
  // `close_review` keys `earned` by team id in a team game and by player id in
  // a solo one, so the columns must match whichever the game is.
  const { columns, rows } = buildRoundHistory(
    history,
    isTeamGame(game) ? teamColumns(game.teams) : playerColumns(game.players),
  );

  // Nothing to show before the first round closes.
  if (rows.length === 0 || columns.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.eyebrow}>Ιστορικό Γύρων</Text>

      <View style={s.table}>
        {/* Pinned left column — round number, category and stake */}
        <View style={s.pinned}>
          <View style={[s.head, s.pinnedCell]}>
            <Text style={s.headText}>Γύρος</Text>
          </View>
          {rows.map((r) => (
            <View key={r.turnNumber} style={[s.rowCell, s.pinnedCell]}>
              <Text style={s.roundNum}>{r.turnNumber}</Text>
              {r.category ? (
                <Text style={s.roundMeta} numberOfLines={1}>
                  {r.category}
                  {r.points ? ` · ${r.points}π` : ''}
                </Text>
              ) : null}
            </View>
          ))}
          <View style={[s.totalCell, s.pinnedCell]}>
            <Text style={s.totalLabel}>Σύνολο</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={s.head}>
              {columns.map((c) => (
                <Text
                  key={c.id}
                  style={[s.headText, s.col, c.id === selfId && s.selfText]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
              ))}
            </View>

            {rows.map((r) => (
              <View key={r.turnNumber} style={s.rowCell}>
                {r.earned.map((earned, i) => (
                  <View key={columns[i].id} style={s.col}>
                    <Text
                      style={[
                        s.earned,
                        earned > 0 ? s.earnedPos : s.earnedZero,
                        columns[i].id === selfId && earned > 0 && s.selfText,
                      ]}
                    >
                      {earned > 0 ? `+${earned}` : '0'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            <View style={s.totalCell}>
              {columns.map((c) => (
                <View key={c.id} style={s.col}>
                  <Text style={[s.total, c.id === selfId && s.selfText]}>{c.total}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', marginTop: 18 },
  eyebrow: {
    fontFamily: F.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.inkMute,
    marginBottom: 8,
    textAlign: 'center',
  },
  table: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  pinned: {
    backgroundColor: C.surface2,
    borderRightWidth: 1.5,
    borderRightColor: C.line,
  },
  // `head`/`rowCell`/`totalCell` are row containers; the pinned column stacks a
  // round number over its category, so it has to flip direction back.
  pinnedCell: {
    width: 96,
    paddingHorizontal: 10,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },

  head: {
    height: HEAD_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: C.line,
  },
  headText: {
    fontFamily: F.sansBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: C.inkMute,
    textTransform: 'uppercase',
  },

  rowCell: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  col: { width: COL_W, alignItems: 'center', justifyContent: 'center' },

  roundNum: { fontFamily: F.display, fontSize: 15, color: C.ink },
  roundMeta: { fontFamily: F.sans, fontSize: 9, color: C.inkMute },

  earned: { fontFamily: F.sansExtraBold, fontSize: 14 },
  earnedPos: { color: C.green },
  earnedZero: { color: C.inkMute },

  totalCell: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primarySoft,
  },
  totalLabel: {
    fontFamily: F.sansBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: C.inkSoft,
    textTransform: 'uppercase',
  },
  total: { fontFamily: F.display, fontSize: 16, color: C.ink },

  selfText: { color: C.primary },
});

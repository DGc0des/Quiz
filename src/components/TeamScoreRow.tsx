import { View, Text, StyleSheet } from 'react-native';
import { Game, ResolvedAnswer, TeamId } from '../types';
import { teamStandings, TEAM_COLORS } from '../utils/teams';
import { C, F } from '../theme';

type Props = {
  game: Game;
  /** Highlighted as "yours". */
  myTeamId?: TeamId | null;
  /**
   * When given (the review screen), each side shows the points it just earned
   * on top of its banked score — `close_review` has not run yet at that point.
   */
  pending?: Record<TeamId, ResolvedAnswer> | null;
};

/** The two-sided scoreboard. The team-mode counterpart of `ScoreRow`. */
export function TeamScoreRow({ game, myTeamId, pending }: Props) {
  const standings = teamStandings(game);
  if (standings.length === 0) return null;

  return (
    <View style={s.row}>
      {standings.map((team) => {
        const earned = pending?.[team.id]?.earned ?? 0;
        const isMine = team.id === myTeamId;
        return (
          <View
            key={team.id}
            style={[
              s.box,
              { borderColor: TEAM_COLORS[team.id] },
              isMine && { backgroundColor: C.surface2 },
            ]}
          >
            <View style={s.scoreLine}>
              <Text style={[s.num, { color: TEAM_COLORS[team.id] }]}>{team.score}</Text>
              {earned > 0 && <Text style={s.earned}>+{earned}</Text>}
            </View>
            <Text style={s.label} numberOfLines={1}>
              {team.name}
              {isMine ? ' (εσύ)' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center', width: '100%' },
  box: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  num: { fontFamily: F.display, fontSize: 20 },
  earned: { fontFamily: F.sansExtraBold, fontSize: 12, color: C.green },
  label: { fontFamily: F.sansSemiBold, fontSize: 10, color: C.inkMute },
});

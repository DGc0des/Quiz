import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Player } from '../types';
import { C, F } from '../theme';

type Props = {
  players: Player[];
  selfId: string;
  activePlayerId?: string | null;
  /** From `useGame().presence` — away players are dimmed, never hidden. */
  awayIds?: string[];
};

export function ScoreRow({ players, selfId, activePlayerId, awayIds = [] }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ScrollView horizontal style={s.viewport} contentContainerStyle={s.row} showsHorizontalScrollIndicator>
      {sorted.map((p) => {
        const isSelf = p.id === selfId;
        const isActive = activePlayerId != null && p.id === activePlayerId;
        const away = awayIds.includes(p.id);
        return (
          <View
            key={p.id}
            style={[s.box, isSelf && s.boxSelf, isActive && s.boxActive, away && s.boxAway]}
          >
            <Text style={[s.num, isActive && s.numActive]}>{p.score}</Text>
            <Text style={[s.label, isActive && s.labelActive]} numberOfLines={1}>
              {away ? `💤 ${p.name}` : p.name}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  viewport: { flexGrow: 0, flexShrink: 0 },
  row: {
    flexGrow: 1,
    paddingBottom: 6,
    flexDirection: 'row',
    gap: 5,
  },
  box: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 68,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 68,
    alignItems: 'center',
  },
  boxSelf: { borderColor: C.primary },
  boxActive: { backgroundColor: C.primary, borderColor: C.primary },
  boxAway: { opacity: 0.45 },
  num: { fontFamily: F.display, fontSize: 15, color: C.primary },
  numActive: { color: '#FFFFFF' },
  label: { fontFamily: F.sansSemiBold, fontSize: 9, color: C.inkMute, maxWidth: 56 },
  labelActive: { color: '#FFFFFF' },
});

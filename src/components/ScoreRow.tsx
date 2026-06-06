import { View, Text, StyleSheet } from 'react-native';
import { Player } from '../types';
import { C, F } from '../theme';

type Props = {
  players: Player[];
  selfId: string;
  activePlayerId?: string | null;
};

export function ScoreRow({ players, selfId, activePlayerId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <View style={s.row}>
      {sorted.map((p) => {
        const isSelf = p.id === selfId;
        const isActive = activePlayerId != null && p.id === activePlayerId;
        return (
          <View
            key={p.id}
            style={[s.box, isSelf && s.boxSelf, isActive && s.boxActive]}
          >
            <Text style={[s.num, isActive && s.numActive]}>{p.score}</Text>
            <Text style={[s.label, isActive && s.labelActive]} numberOfLines={1}>
              {p.name}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  box: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 44,
    alignItems: 'center',
  },
  boxSelf: { borderColor: C.primary },
  boxActive: { backgroundColor: C.primary, borderColor: C.primary },
  num: { fontFamily: F.display, fontSize: 15, color: C.primary },
  numActive: { color: '#FFFFFF' },
  label: { fontFamily: F.sansSemiBold, fontSize: 9, color: C.inkMute, maxWidth: 56 },
  labelActive: { color: '#FFFFFF' },
});

import { View, Text, StyleSheet } from 'react-native';
import { Mascot } from './Mascot';
import { C, F } from '../theme';

interface LogoProps {
  size?: number;
}

export function Logo({ size = 110 }: LogoProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.mascotWrap}>
        <Mascot size={size} mood="happy" />
      </View>
      <Text style={[styles.title, { fontSize: size * 0.38 }]}>Κουίζ</Text>
      <Text style={styles.tagline}>Το παιχνίδι γνώσεων</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginBottom: 28,
  },
  mascotWrap: {
    marginBottom: 4,
  },
  title: {
    fontFamily: F.extraBold,
    color: C.primary,
    letterSpacing: -1,
    lineHeight: undefined,
  },
  tagline: {
    fontFamily: F.sans,
    fontSize: 13,
    color: C.inkSoft,
    marginTop: 2,
  },
});

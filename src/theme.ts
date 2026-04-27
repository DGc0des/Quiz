export const C = {
  bg: '#0F1226',
  bg2: '#191D3A',
  surface: '#1F2447',
  surface2: '#262C56',
  line: '#2D3367',
  ink: '#F5F0E6',
  inkSoft: '#C7C7E0',
  inkMute: '#8B8FB8',
  primary: '#FF4F6D',
  primaryInk: '#FFFFFF',
  primarySoft: '#3A1B2D',
  primaryDark: '#B5354F',
  green: '#3DDC97',
  greenFg: '#06311E',
  amber: '#FFB547',
  amberFg: '#3A2300',
} as const;

export const F = {
  display: 'Fraunces_900Black',
  bold: 'Fraunces_700Bold',
  extraBold: 'Fraunces_800ExtraBold',
  sans: 'PlusJakartaSans_400Regular',
  sansMedium: 'PlusJakartaSans_500Medium',
  sansSemiBold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
  sansExtraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const SHADOW = {
  glow: {
    shadowColor: '#FF4F6D',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 15,
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 4,
  },
} as const;

export const CATEGORY_META: Record<string, { ico: string; bg: string; fg: string }> = {
  'Ιστορία': { ico: '🏛', bg: '#FFB547', fg: '#3A2300' },
  'Γεωγραφία': { ico: '🌍', bg: '#3DDC97', fg: '#06311E' },
  'Επιστήμη': { ico: '🔬', bg: '#7C5CFF', fg: '#1A0A3D' },
  'Αθλητισμός': { ico: '⚽', bg: '#FF4F6D', fg: '#3A0911' },
  'Τέχνες': { ico: '🎨', bg: '#FF8FB1', fg: '#3A0E22' },
  'Ψυχαγωγία': { ico: '🎬', bg: '#5BD0F3', fg: '#06303D' },
};

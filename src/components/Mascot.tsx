import React from 'react';
import { View } from 'react-native';
import Svg, {
  G,
  Path,
  Ellipse,
  Rect,
  Circle,
  Line,
  Text as SvgText,
} from 'react-native-svg';

type Mood = 'happy' | 'think' | 'cheer' | 'sleep' | 'sad';

interface MascotProps {
  size?: number;
  mood?: Mood;
}

export function Mascot({ size = 130, mood = 'happy' }: MascotProps) {
  const isCheer = mood === 'cheer';
  const isThink = mood === 'think';
  const isSleep = mood === 'sleep';
  const isSad = mood === 'sad';

  const fur = '#D4A47A';
  const furLite = '#E5BC92';
  const snout = '#8C5E3D';
  const snoutLt = '#A87850';
  const ink = '#5A3A22';
  const blush = '#F2A9A3';
  const teeth = '#FFF5E0';
  const yellow = '#FFD16B';
  const yellowD = '#D89B2E';

  const renderEye = (cx: number, cy: number) => {
    if (isCheer) {
      return (
        <Path
          d={`M ${cx - 5} ${cy + 1.5} Q ${cx} ${cy - 4} ${cx + 5} ${cy + 1.5}`}
          stroke={ink}
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
      );
    }
    if (isSad) {
      return (
        <Path
          d={`M ${cx - 4} ${cy - 1} Q ${cx} ${cy + 3} ${cx + 4} ${cy - 1}`}
          stroke={ink}
          strokeWidth={2.4}
          fill="none"
          strokeLinecap="round"
        />
      );
    }
    if (isThink) {
      return (
        <G>
          <Ellipse cx={cx} cy={cy} rx={2.2} ry={2.6} fill={ink} />
          <Circle cx={cx + 0.6} cy={cy - 0.6} r={0.6} fill="#fff" />
        </G>
      );
    }
    if (isSleep) {
      return (
        <Line
          x1={cx - 4}
          y1={cy}
          x2={cx + 4}
          y2={cy}
          stroke={ink}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      );
    }
    return (
      <Path
        d={`M ${cx - 4.5} ${cy + 0.5} Q ${cx} ${cy - 2} ${cx + 4.5} ${cy + 0.5}`}
        stroke={ink}
        strokeWidth={2.6}
        fill="none"
        strokeLinecap="round"
      />
    );
  };

  const renderMouth = () => {
    const teethGroup = (
      <G>
        <Path
          d="M58 74 Q 65 76 72 74"
          stroke={ink}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
        <Rect x={61.5} y={74} width={3.5} height={6} rx={0.7} fill={teeth} stroke={ink} strokeWidth={1.4} />
        <Rect x={65.5} y={74} width={3.5} height={6} rx={0.7} fill={teeth} stroke={ink} strokeWidth={1.4} />
      </G>
    );

    if (isCheer) {
      return (
        <G>
          <Path d="M55 74 Q 65 84 75 74 Q 65 80 55 74 Z" fill={ink} />
          <Ellipse cx={65} cy={79} rx={5} ry={2.2} fill="#FF6B86" />
          <Rect x={61.5} y={72} width={3.5} height={5} rx={0.7} fill={teeth} stroke={ink} strokeWidth={1.4} />
          <Rect x={65.5} y={72} width={3.5} height={5} rx={0.7} fill={teeth} stroke={ink} strokeWidth={1.4} />
        </G>
      );
    }
    if (isSad) {
      return (
        <G>
          {teethGroup}
          <Path
            d="M58 82 Q 65 78 72 82"
            stroke={ink}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      );
    }
    if (isSleep) {
      return (
        <G>
          <Path
            d="M61 79 Q 65 77 69 79"
            stroke={ink}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          <Rect x={63} y={77} width={3} height={4} rx={0.6} fill={teeth} stroke={ink} strokeWidth={1.2} />
        </G>
      );
    }
    return teethGroup;
  };

  return (
    <View style={{ width: size, height: size }}>
      <Svg viewBox="0 0 130 130" width={size} height={size}>
        {/* ground shadow */}
        <Ellipse cx={65} cy={120} rx={46} ry={3.8} fill="rgba(0,0,0,0.22)" />

        {/* loaf-shaped body */}
        <Path
          d="M 18 60 C 18 42, 30 30, 50 28 C 64 26, 82 28, 96 32 C 110 38, 116 52, 116 70 C 116 92, 104 110, 80 114 C 56 116, 32 114, 22 102 C 14 90, 12 76, 18 60 Z"
          fill={fur}
          stroke={ink}
          strokeWidth={3}
          strokeLinejoin="round"
        />

        {/* belly lighter wash */}
        <Ellipse cx={64} cy={92} rx={40} ry={18} fill={furLite} opacity={0.55} />

        {/* fur tufts — left edge */}
        <G stroke={ink} strokeWidth={1.6} strokeLinecap="round" fill="none">
          <Path d="M16 56 q -2 2 -1 5" />
          <Path d="M14 66 q -2 2 -1 5" />
          <Path d="M14 78 q -2 2 -1 5" />
          <Path d="M16 90 q -2 2 -1 5" />
          <Path d="M22 102 q -2 2 -1 4" />
        </G>

        {/* fur tufts — bottom edge */}
        <G stroke={ink} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7}>
          <Path d="M30 114 l 1 4" />
          <Path d="M44 116 l 1 4" />
          <Path d="M62 117 l 1 4" />
          <Path d="M82 116 l 1 4" />
          <Path d="M100 112 l 2 4" />
        </G>

        {/* interior fur dashes */}
        <G stroke={ink} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.4}>
          <Line x1={36} y1={60} x2={36} y2={64} />
          <Line x1={46} y1={80} x2={46} y2={84} />
          <Line x1={30} y1={86} x2={30} y2={90} />
          <Line x1={60} y1={98} x2={60} y2={102} />
          <Line x1={78} y1={92} x2={78} y2={96} />
          <Line x1={96} y1={76} x2={96} y2={80} />
          <Line x1={92} y1={100} x2={92} y2={104} />
          <Line x1={50} y1={56} x2={50} y2={60} />
          <Line x1={80} y1={60} x2={80} y2={64} />
        </G>

        {/* tiny round ears */}
        <G>
          <Ellipse cx={34} cy={32} rx={6} ry={5} fill={fur} stroke={ink} strokeWidth={2.6} />
          <Ellipse cx={34} cy={33} rx={2.6} ry={2} fill={snout} opacity={0.6} />
          <Ellipse cx={92} cy={32} rx={6} ry={5} fill={fur} stroke={ink} strokeWidth={2.6} />
          <Ellipse cx={92} cy={33} rx={2.6} ry={2} fill={snout} opacity={0.6} />
        </G>

        {/* snout — long rectangular muzzle */}
        <Path
          d="M 38 60 C 38 78, 48 84, 65 84 C 82 84, 92 78, 92 60 C 92 56, 86 54, 65 54 C 44 54, 38 56, 38 60 Z"
          fill={snout}
          stroke={ink}
          strokeWidth={2.8}
          strokeLinejoin="round"
        />

        {/* snout highlight */}
        <Ellipse cx={55} cy={62} rx={14} ry={4} fill={snoutLt} opacity={0.5} />

        {/* eyes */}
        {renderEye(46, 48)}
        {renderEye(84, 48)}

        {/* eyebrow tufts */}
        {(isSad || isThink) && (
          <G stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none">
            <Path d={isSad ? 'M40 40 Q 45 42 50 43' : 'M40 42 L 50 40'} />
            <Path d={isSad ? 'M80 43 Q 85 42 90 40' : 'M80 40 L 90 42'} />
          </G>
        )}

        {/* nostrils */}
        <Ellipse cx={58} cy={64} rx={1.6} ry={1.2} fill={ink} />
        <Ellipse cx={72} cy={64} rx={1.6} ry={1.2} fill={ink} />

        {/* mouth + buck teeth */}
        {renderMouth()}

        {/* blush */}
        <Ellipse cx={28} cy={56} rx={3.8} ry={2.6} fill={blush} opacity={0.85} />
        <Ellipse cx={102} cy={56} rx={3.8} ry={2.6} fill={blush} opacity={0.85} />

        {/* lightbulb */}
        {!isSleep && (
          <G>
            <Circle cx={20} cy={22} r={5} fill={yellow} stroke={ink} strokeWidth={1.8} />
            <Circle cx={18.5} cy={20.5} r={1.2} fill="#FFF6CC" />
            <G stroke={yellowD} strokeWidth={1.3} strokeLinecap="round">
              <Line x1={13} y1={18} x2={10} y2={16} />
              <Line x1={27} y1={18} x2={30} y2={16} />
              <Line x1={20} y1={14} x2={20} y2={11} />
            </G>
          </G>
        )}

        {/* feet */}
        <G>
          <Path
            d="M 36 116 C 32 116, 30 122, 36 124 C 46 124, 52 122, 52 118 C 50 114, 42 114, 36 116 Z"
            fill={snout}
            stroke={ink}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <Path
            d="M 78 116 C 74 116, 72 122, 78 124 C 88 124, 94 122, 94 118 C 92 114, 84 114, 78 116 Z"
            fill={snout}
            stroke={ink}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <G stroke={ink} strokeWidth={1.4} strokeLinecap="round">
            <Line x1={38} y1={120} x2={38} y2={124} />
            <Line x1={42} y1={120} x2={42} y2={124} />
            <Line x1={46} y1={120} x2={46} y2={124} />
            <Line x1={80} y1={120} x2={80} y2={124} />
            <Line x1={84} y1={120} x2={84} y2={124} />
            <Line x1={88} y1={120} x2={88} y2={124} />
          </G>
        </G>

        {/* sleep Z's */}
        {isSleep && (
          <G fill={ink}>
            <SvgText x={106} y={22} fontSize={9} fontFamily="serif" fontWeight="700">z</SvgText>
            <SvgText x={116} y={14} fontSize={7} fontFamily="serif" fontWeight="700">z</SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

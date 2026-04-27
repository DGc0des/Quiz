import React from 'react';
import { View, Animated } from 'react-native';
import Svg, {
  G,
  Path,
  Ellipse,
  Rect,
  Circle,
  Line,
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

  const fur = '#FF8A4C';
  const furDeep = '#E26A2C';
  const cream = '#FFE9CB';
  const ink = '#2A1A12';
  const cheek = '#FFB6A0';
  const yellow = '#FFD16B';
  const yellowD = '#F0A93A';

  const renderEye = (cx: number) => {
    if (isSleep) {
      return (
        <Path
          d={`M ${cx - 5} 56 Q ${cx} 53 ${cx + 5} 56`}
          stroke={ink}
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
      );
    }
    if (isSad) {
      return (
        <G>
          <Path
            d={`M ${cx - 6} 57 Q ${cx} 60 ${cx + 6} 57`}
            stroke={ink}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
          />
          {cx < 60 && (
            <Path
              d={`M ${cx - 2} 60 Q ${cx - 3.5} 66 ${cx - 1.5} 68 Q ${cx - 0.5} 66 ${cx - 2} 60 Z`}
              fill="#7CC8FF"
              stroke="#3F8FCC"
              strokeWidth={0.8}
            />
          )}
        </G>
      );
    }
    if (isCheer) {
      return (
        <Path
          d={`M ${cx - 6} 58 Q ${cx} 50 ${cx + 6} 58`}
          stroke={ink}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
      );
    }
    return (
      <G>
        <Ellipse
          cx={cx}
          cy={56}
          rx={5.5}
          ry={6.5}
          fill="#fff"
          stroke={ink}
          strokeWidth={1.6}
        />
        <Ellipse
          cx={cx}
          cy={isThink ? 54 : 57}
          rx={3.2}
          ry={isThink ? 2.4 : 4.4}
          fill={ink}
        />
        <Circle cx={cx + 1.4} cy={isThink ? 53 : 55.5} r={1.3} fill="#fff" />
      </G>
    );
  };

  return (
    <View style={{ width: size, height: size }}>
      <Svg viewBox="0 0 130 130" width={size} height={size}>
        {/* ground shadow */}
        <Ellipse cx={65} cy={120} rx={36} ry={4.5} fill="rgba(0,0,0,0.28)" />

        {/* tail */}
        <G>
          <Path
            d="M98 84 Q 118 78 120 60 Q 120 52 112 50 Q 108 64 100 70 Q 96 76 98 84 Z"
            fill={fur}
            stroke={ink}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <Path
            d="M118 56 Q 120 52 116 49 Q 112 50 110 55 Q 113 56 118 56 Z"
            fill={cream}
            stroke={ink}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
        </G>

        {/* body */}
        <Path
          d="M40 96 Q 32 80 38 68 L 92 68 Q 98 80 90 96 Q 84 108 65 108 Q 46 108 40 96 Z"
          fill={fur}
          stroke={ink}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        {/* belly */}
        <Path
          d="M48 80 Q 48 96 65 102 Q 82 96 82 80 Q 65 84 48 80 Z"
          fill={cream}
        />

        {/* arms */}
        <Path
          d="M40 78 Q 32 84 36 92 Q 42 96 48 90"
          fill={fur}
          stroke={ink}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <Path
          d="M90 78 Q 98 80 100 88 Q 96 96 86 92"
          fill={fur}
          stroke={ink}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />

        {/* lightbulb in left paw */}
        <G>
          <Rect x={33} y={68} width={6} height={3} rx={1} fill={ink} />
          <Circle cx={36} cy={62} r={6.5} fill={yellow} stroke={ink} strokeWidth={2} />
          <Circle cx={34} cy={60} r={1.6} fill="#FFF6CC" />
          {!isSleep && (
            <G stroke={yellowD} strokeWidth={1.6} strokeLinecap="round">
              <Line x1={28} y1={56} x2={25} y2={54} />
              <Line x1={44} y1={56} x2={47} y2={54} />
              <Line x1={36} y1={50} x2={36} y2={47} />
            </G>
          )}
        </G>

        {/* head */}
        <G>
          {/* ears */}
          <Path
            d="M30 38 L 36 18 L 50 32 Z"
            fill={fur}
            stroke={ink}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <Path d="M34 33 L 38 24 L 44 32 Z" fill={cream} />
          <Path
            d="M100 38 L 94 18 L 80 32 Z"
            fill={fur}
            stroke={ink}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <Path d="M96 33 L 92 24 L 86 32 Z" fill={cream} />

          {/* head shape */}
          <Path
            d="M28 58 Q 28 30 65 30 Q 102 30 102 58 Q 102 78 86 84 L 80 88 L 65 92 L 50 88 L 44 84 Q 28 78 28 58 Z"
            fill={fur}
            stroke={ink}
            strokeWidth={2.8}
            strokeLinejoin="round"
          />

          {/* face mask */}
          <Path
            d="M40 60 Q 40 86 65 90 Q 90 86 90 60 Q 78 70 65 70 Q 52 70 40 60 Z"
            fill={cream}
          />

          {/* eyes */}
          {renderEye(52)}
          {renderEye(78)}

          {/* eyebrows */}
          {!isSleep && (
            <G stroke={ink} strokeWidth={2.4} strokeLinecap="round" fill="none">
              <Path
                d={
                  isSad
                    ? 'M44 44 Q 50 47 56 49'
                    : isThink
                    ? 'M44 46 L 56 44'
                    : 'M46 46 Q 50 44 56 46'
                }
              />
              <Path
                d={
                  isSad
                    ? 'M74 49 Q 80 47 86 44'
                    : isThink
                    ? 'M74 44 L 86 46'
                    : 'M74 46 Q 80 44 84 46'
                }
              />
            </G>
          )}

          {/* nose */}
          <Ellipse cx={65} cy={69} rx={4} ry={3.2} fill={ink} />
          <Ellipse cx={63.5} cy={68} rx={1.2} ry={0.8} fill="#fff" opacity={0.6} />

          {/* mouth */}
          {isCheer ? (
            <G>
              <Path d="M50 74 Q 65 96 80 74 Q 65 90 50 74 Z" fill={ink} />
              <Ellipse cx={65} cy={86} rx={6} ry={3} fill="#FF6B86" />
              <Ellipse cx={65} cy={84.5} rx={2} ry={0.8} fill="#FFB6C1" opacity={0.8} />
              <Rect x={58} y={76} width={4} height={4} rx={1} fill="#FFF6E8" />
              <Rect x={68} y={76} width={4} height={4} rx={1} fill="#FFF6E8" />
            </G>
          ) : isThink ? (
            <Ellipse cx={65} cy={78} rx={2.2} ry={1.6} fill={ink} />
          ) : isSad ? (
            <Path
              d="M58 80 Q 65 74 72 80"
              stroke={ink}
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
            />
          ) : isSleep ? (
            <Path
              d="M60 78 Q 65 76 70 78"
              stroke={ink}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <G>
              <Path
                d="M65 72 L 65 76"
                stroke={ink}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
              <Path
                d="M58 76 Q 65 82 72 76"
                stroke={ink}
                strokeWidth={2.4}
                fill="none"
                strokeLinecap="round"
              />
            </G>
          )}

          {/* cheeks */}
          <Ellipse cx={42} cy={68} rx={4} ry={2.6} fill={cheek} opacity={0.85} />
          <Ellipse cx={88} cy={68} rx={4} ry={2.6} fill={cheek} opacity={0.85} />

          {/* head shading */}
          <Path
            d="M96 50 Q 102 60 100 76 Q 98 80 92 82 Q 100 70 96 50 Z"
            fill={furDeep}
            opacity={0.55}
          />
        </G>

        {/* feet */}
        <Ellipse cx={50} cy={108} rx={9} ry={4} fill={ink} />
        <Ellipse cx={80} cy={108} rx={9} ry={4} fill={ink} />
        <Ellipse cx={50} cy={107} rx={6} ry={2} fill={cream} opacity={0.4} />
        <Ellipse cx={80} cy={107} rx={6} ry={2} fill={cream} opacity={0.4} />
      </Svg>
    </View>
  );
}

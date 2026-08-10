import React from 'react';
import { View } from 'react-native';
import Svg, {
  Defs,
  ClipPath,
  G,
  Path,
  Ellipse,
  Rect,
  Circle,
  Line,
  Text as SvgText,
} from 'react-native-svg';

type Mood = 'happy' | 'think' | 'cheer' | 'sleep' | 'sad' | 'angry';

interface MascotProps {
  size?: number;
  mood?: Mood;
}

// Quizby Burly — chunky 3/4 capybara with big grey nose pad, white-sclera
// eyes and the signature incisors. Each mood re-tunes the brows / eyes /
// mouth so the emotion reads clearly. Ported from the claude.ai/design
// "Quizby Burly Expressions" source to react-native-svg.
export function Mascot({ size = 130, mood = 'happy' }: MascotProps) {
  const isCheer = mood === 'cheer';
  const isSleep = mood === 'sleep';
  const isSad = mood === 'sad';
  const isThink = mood === 'think';
  const isAngry = mood === 'angry';

  const fur = '#C07A48';
  const furLt = '#DBA66E';
  const furSh = '#9A5530';
  const furDp = '#7C3F22';
  const ink = '#2E160B';
  const cream = '#ECD8AF';
  const creamSh = '#D6BC8C';
  const nose = '#827A71';
  const noseSh = '#5B544C';
  const noseHi = '#ADA69C';
  const teeth = '#FAF2E0';
  const teethSh = '#E3D6BC';
  const gum = '#7A4036';
  const sclera = '#FBF7ED';
  const blush = '#D98A6F';

  const reactId = React.useId();
  const gid = reactId.replace(/:/g, '_');
  const SW = 5;

  // ── EYES — big sclera eyes ──
  const renderEyes = () => {
    const L = { cx: 86, cy: 94 };
    const R = { cx: 124, cy: 90 };
    if (isSleep) {
      return (
        <G stroke={ink} strokeWidth={4.5} fill="none" strokeLinecap="round">
          <Path d={`M ${L.cx - 11} ${L.cy} Q ${L.cx} ${L.cy + 8} ${L.cx + 11} ${L.cy}`} />
          <Path d={`M ${R.cx - 11} ${R.cy} Q ${R.cx} ${R.cy + 8} ${R.cx + 11} ${R.cy}`} />
        </G>
      );
    }
    // pupil aim: forward & up for happy (friendly), side for think/angry,
    // up & big for sad (pleading puppy-dog eyes)
    const px = isThink ? -4 : isAngry ? 4 : 0;
    const py = isSad ? -3 : isCheer ? 0 : isAngry ? -1 : -2;
    const pr = isCheer ? 5 : isSad ? 7.5 : 6.5;
    const oneEye = (e: { cx: number; cy: number }, big: boolean) => {
      if (isCheer) {
        return (
          <Path
            d={`M ${e.cx - 11} ${e.cy + 3} Q ${e.cx} ${e.cy - 9} ${e.cx + 11} ${e.cy + 3}`}
            stroke={ink}
            strokeWidth={4.6}
            fill="none"
            strokeLinecap="round"
          />
        );
      }
      return (
        <G>
          <Ellipse cx={e.cx} cy={e.cy} rx={big ? 15 : 14} ry={big ? 17 : 16} fill={sclera} stroke={ink} strokeWidth={SW} />
          <Ellipse cx={e.cx + px} cy={e.cy + py} rx={pr} ry={pr + 1} fill={ink} />
          <Circle cx={e.cx + px + 2.6} cy={e.cy + py - 3} r={isSad ? 3 : 2.4} fill="#fff" />
          {isSad && <Circle cx={e.cx + px - 2.4} cy={e.cy + py + 2.6} r={1.7} fill="#fff" opacity={0.85} />}
        </G>
      );
    };
    return (
      <G>
        {oneEye(L, true)}
        {oneEye(R, false)}
      </G>
    );
  };

  // ── BROWS — drive the attitude ──
  const renderBrows = () => {
    if (isSleep) return null;
    let lb: string;
    let rb: string;
    if (isSad) {
      // inner-up worried — steeper, pleading
      lb = 'M 66 86 Q 80 78 96 76';
      rb = 'M 108 76 Q 124 78 140 86';
    } else if (isCheer) {
      // raised, lively
      lb = 'M 68 72 Q 80 66 94 70';
      rb = 'M 110 70 Q 124 64 138 70';
    } else if (isThink) {
      // one cocked
      lb = 'M 66 78 L 94 72';
      rb = 'M 110 66 Q 124 64 138 70';
    } else if (isAngry) {
      // determined furrow
      lb = 'M 66 74 Q 80 78 96 84';
      rb = 'M 108 84 Q 124 76 140 72';
    } else {
      // HAPPY — soft, gently-raised relaxed brows
      lb = 'M 66 76 Q 80 70 96 74';
      rb = 'M 110 74 Q 124 68 140 74';
    }
    return (
      <G stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round">
        <Path d={lb} />
        <Path d={rb} />
      </G>
    );
  };

  // ── MOUTH ──
  const renderMouth = () => {
    const mx = 104;
    const my = 156;
    if (isSleep) {
      return (
        <Path
          d={`M ${mx - 8} ${my - 4} Q ${mx} ${my + 1} ${mx + 8} ${my - 4}`}
          stroke={ink}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      );
    }
    if (isSad) {
      // trembling, wobbly frown — corners pulled down, quivering middle
      return (
        <Path
          d={`M ${mx - 16} ${my + 3} Q ${mx - 8} ${my - 5} ${mx - 1} ${my + 1} Q ${mx + 7} ${my + 7} ${mx + 16} ${my - 2}`}
          stroke={ink}
          strokeWidth={4.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    if (isCheer) {
      // wide open joyful shout
      return (
        <G>
          <Path
            d={`M ${mx - 22} ${my - 8} Q ${mx} ${my + 24} ${mx + 22} ${my - 8} Q ${mx} ${my - 2} ${mx - 22} ${my - 8} Z`}
            fill={gum}
            stroke={ink}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
          <Rect x={mx - 9} y={my - 9} width={9} height={11} rx={1.6} fill={teeth} stroke={ink} strokeWidth={2.4} />
          <Rect x={mx + 0.5} y={my - 9} width={9} height={11} rx={1.6} fill={teeth} stroke={ink} strokeWidth={2.4} />
          <Path d={`M ${mx - 13} ${my + 6} Q ${mx} ${my + 14} ${mx + 13} ${my + 6}`} fill="#C9554B" />
        </G>
      );
    }
    if (isThink) {
      // calm pondering — small pursed mouth, slightly cocked
      return (
        <G stroke={ink} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Path d={`M ${mx - 13} ${my} Q ${mx - 2} ${my - 4} ${mx + 11} ${my + 1}`} />
        </G>
      );
    }
    if (isAngry) {
      // gritted, determined grin
      return (
        <G>
          <Path
            d={`M ${mx - 24} ${my - 6} Q ${mx} ${my + 14} ${mx + 24} ${my - 6}`}
            fill={gum}
            stroke={ink}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
          <G stroke={ink} strokeWidth={2.2} fill={teeth}>
            <Rect x={mx - 23} y={my - 7} width={9} height={9} rx={1.3} />
            <Rect x={mx - 13.5} y={my - 8} width={11} height={11} rx={1.4} />
            <Rect x={mx + 2.5} y={my - 8} width={11} height={11} rx={1.4} />
            <Rect x={mx + 14} y={my - 7} width={9} height={9} rx={1.3} />
          </G>
          <Line x1={mx - 1} y1={my - 8} x2={mx - 1} y2={my + 1} stroke={teethSh} strokeWidth={1.4} />
        </G>
      );
    }
    // HAPPY — warm open smile with the two signature incisors
    return (
      <G>
        <Path
          d={`M ${mx - 20} ${my - 6} Q ${mx} ${my + 18} ${mx + 20} ${my - 6} Q ${mx} ${my + 1} ${mx - 20} ${my - 6} Z`}
          fill={gum}
          stroke={ink}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
        <Rect x={mx - 8.5} y={my - 7} width={9} height={11} rx={1.5} fill={teeth} stroke={ink} strokeWidth={2.4} />
        <Rect x={mx + 0.5} y={my - 7} width={9} height={11} rx={1.5} fill={teeth} stroke={ink} strokeWidth={2.4} />
        <Line x1={mx} y1={my - 7} x2={mx} y2={my + 3} stroke={teethSh} strokeWidth={1.4} />
        <Path d={`M ${mx - 12} ${my + 7} Q ${mx} ${my + 15} ${mx + 12} ${my + 7}`} fill="#C9554B" />
      </G>
    );
  };

  const bodyPath =
    'M 60 40 C 40 44, 26 66, 26 92 C 22 104, 12 112, 12 130 ' +
    'C 10 152, 22 172, 32 186 C 44 202, 74 210, 108 210 ' +
    'C 146 210, 182 202, 196 184 C 206 172, 202 150, 196 134 ' +
    'C 192 122, 196 106, 194 90 C 191 66, 178 46, 150 40 ' +
    'C 128 34, 80 34, 60 40 Z';

  return (
    <View style={{ width: size, height: size }}>
      <Svg viewBox="0 0 220 220" width={size} height={size}>
        <Defs>
          <ClipPath id={`body-${gid}`}>
            <Path d={bodyPath} />
          </ClipPath>
        </Defs>

        {/* ground shadow */}
        <Ellipse cx={108} cy={210} rx={78} ry={6} fill={ink} opacity={0.16} />

        {/* body silhouette (lumpy, burly, 3/4) */}
        <Path d={bodyPath} fill={fur} stroke={ink} strokeWidth={SW} strokeLinejoin="round" />

        {/* cel-shade shapes, clipped to the body */}
        <G clipPath={`url(#body-${gid})`}>
          <Path
            d="M 150 60 C 180 70, 200 96, 198 140 C 196 184, 168 210, 120 214 C 175 206, 190 168, 184 132 C 178 96, 196 70, 150 60 Z"
            fill={furSh}
            opacity={0.9}
          />
          <Path
            d="M 60 168 C 80 188, 140 188, 160 168 C 150 206, 70 206, 60 168 Z"
            fill={furDp}
            opacity={0.55}
          />
          <Path
            d="M 60 42 C 40 48, 28 66, 28 92 C 36 70, 56 52, 86 48 C 72 44, 64 42, 60 42 Z"
            fill={furLt}
            opacity={0.85}
          />
          <G stroke={furDp} strokeWidth={3} fill="none" opacity={0.5} strokeLinecap="round">
            <Path d="M 150 150 Q 168 162 168 182" />
            <Path d="M 40 150 Q 30 164 34 182" />
          </G>
        </G>

        {/* ears */}
        <G>
          <Path
            d="M 58 44 C 46 30, 44 18, 54 16 C 64 16, 74 30, 72 44 Z"
            fill={fur}
            stroke={ink}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
          <Path d="M 56 38 C 52 30, 52 24, 57 23 C 62 24, 65 31, 64 39 Z" fill={furDp} opacity={0.6} />
          <Path
            d="M 152 42 C 164 28, 168 16, 158 14 C 148 15, 138 28, 140 43 Z"
            fill={fur}
            stroke={ink}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
          <Path d="M 154 37 C 158 29, 159 23, 154 22 C 149 24, 147 31, 148 38 Z" fill={furDp} opacity={0.6} />
        </G>

        {/* soft cheek blush when happy/cheer */}
        {!isSleep && !isSad && !isThink && !isAngry && (
          <G opacity={isCheer ? 0.85 : 0.6}>
            <Ellipse cx={58} cy={124} rx={11} ry={6.5} fill={blush} />
            <Ellipse cx={156} cy={122} rx={11} ry={6.5} fill={blush} />
          </G>
        )}

        {/* brows + eyes */}
        {renderBrows()}
        {renderEyes()}

        {/* muzzle / cheek-chin cream mass */}
        <Path
          d="M 64 122 C 56 150, 70 178, 104 180 C 138 178, 152 150, 144 122 C 132 138, 76 138, 64 122 Z"
          fill={cream}
          stroke={ink}
          strokeWidth={3.4}
          strokeLinejoin="round"
        />
        <Path
          d="M 110 134 C 134 134, 146 126, 144 122 C 138 150, 150 168, 132 178 C 150 156, 138 138, 110 134 Z"
          fill={creamSh}
          opacity={0.7}
        />

        {/* big grey nose pad */}
        <G>
          <Path
            d="M 78 118 C 78 106, 96 100, 114 102 C 134 104, 146 112, 144 124 C 142 134, 122 138, 104 136 C 86 134, 78 130, 78 118 Z"
            fill={nose}
            stroke={ink}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
          <Path
            d="M 120 106 C 138 108, 146 116, 144 124 C 142 134, 122 138, 106 136 C 132 134, 138 120, 120 106 Z"
            fill={noseSh}
            opacity={0.75}
          />
          <Ellipse cx={95} cy={112} rx={9} ry={4.5} fill={noseHi} opacity={0.8} />
          <Circle cx={110} cy={120} r={1.6} fill={noseSh} />
          <Circle cx={126} cy={118} r={1.4} fill={noseSh} />
          <Ellipse cx={92} cy={124} rx={3} ry={2.4} fill={ink} />
          <Ellipse cx={120} cy={128} rx={3} ry={2.4} fill={ink} />
        </G>

        {/* mouth */}
        {renderMouth()}

        {/* sleep z's */}
        {isSleep && (
          <G fill={ink}>
            <SvgText x={170} y={48} fontSize={22} fontFamily="serif" fontWeight="800">z</SvgText>
            <SvgText x={188} y={32} fontSize={15} fontFamily="serif" fontWeight="800">z</SvgText>
          </G>
        )}

        {/* sad tear welling under the eye */}
        {isSad && (
          <Path
            d="M 132 104 C 129 110, 128 114, 132 115 C 136 114, 135 110, 132 104 Z"
            fill="#7AB6E0"
            stroke={ink}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        )}

        {/* angry vein pop */}
        {isAngry && (
          <G stroke="#C2453B" strokeWidth={3.4} fill="none" strokeLinecap="round">
            <Path d="M 150 52 q 8 -2 7 7 q 5 -6 9 1" />
            <Path d="M 158 50 q 6 5 0 11" />
          </G>
        )}

        {/* cheer action sparks */}
        {isCheer && (
          <G stroke={ink} strokeWidth={2} fill="#F2A03D">
            <Path d="M 22 70 l 2.6 6 l 6 2.6 l -6 2.6 l -2.6 6 l -2.6 -6 l -6 -2.6 l 6 -2.6 z" />
            <Path d="M 196 64 l 2 5 l 5 2 l -5 2 l -2 5 l -2 -5 l -5 -2 l 5 -2 z" />
          </G>
        )}
      </Svg>
    </View>
  );
}

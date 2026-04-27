import React from 'react';
import { View, Text } from 'react-native';
import { F } from '../theme';

const PALETTE = ['#FF4F6D', '#FFB547', '#3DDC97', '#7C5CFF', '#5BD0F3', '#FF8FB1'];

function avBg(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avBg(name),
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          fontFamily: F.bold,
          fontSize: size * 0.42,
          color: '#fff',
          lineHeight: size * 0.55,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

import React from 'react';
import { View, StyleSheet } from 'react-native';

export function Blobs() {
  return (
    <>
      <View pointerEvents="none" style={[styles.blob, styles.blobPrimary]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobPurple]} />
    </>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobPrimary: {
    width: 240,
    height: 240,
    backgroundColor: '#FF4F6D',
    top: -80,
    right: -60,
    opacity: 0.55,
  },
  blobPurple: {
    width: 220,
    height: 220,
    backgroundColor: '#7C5CFF',
    bottom: -90,
    left: -80,
    opacity: 0.35,
  },
});

import React, { useRef } from 'react';
import { Animated, GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';

interface Props {
  size?: number;
  onChange: (x: number) => void;
}

export function Thumbstick({ size = 160, onChange }: Props) {
  const half = size / 2;
  const knobSize = Math.round(size * 0.42);
  const maxOffset = half - knobSize / 2 - 4;

  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const computeFromTouch = (locationX: number, locationY: number) => {
    let dx = locationX - half;
    let dy = locationY - half;
    const dist = Math.hypot(dx, dy);
    if (dist > maxOffset && dist > 0) {
      dx = (dx / dist) * maxOffset;
      dy = (dy / dist) * maxOffset;
    }
    return { dx, dy };
  };

  const reportX = (dx: number) => {
    onChange(Math.max(-1, Math.min(1, dx / maxOffset)));
  };

  const apply = (e: GestureResponderEvent) => {
    const { dx, dy } = computeFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
    translate.setValue({ x: dx, y: dy });
    reportX(dx);
  };

  const release = () => {
    Animated.spring(translate, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      bounciness: 4,
      speed: 16,
    }).start();
    onChange(0);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        translate.stopAnimation();
        apply(e);
      },
      onPanResponderMove: apply,
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    }),
  ).current;

  return (
    <View
      style={[styles.base, { width: size, height: size, borderRadius: half }]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.knob,
          {
            width: knobSize,
            height: knobSize,
            borderRadius: knobSize / 2,
            transform: translate.getTranslateTransform(),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(26,26,26,0.75)',
    borderWidth: 3,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    backgroundColor: 'rgba(255,210,74,0.9)',
    borderWidth: 2,
    borderColor: '#3a2a00',
  },
});

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

export interface ThumbstickHandle {
  setKnob(dx: number, dy: number): void;
  springHome(): void;
}

interface Props {
  size?: number;
}

export const Thumbstick = forwardRef<ThumbstickHandle, Props>(function Thumbstick(
  { size = 160 },
  ref,
) {
  const half = size / 2;
  const knobSize = Math.round(size * 0.42);
  const translate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useImperativeHandle(
    ref,
    () => ({
      setKnob(dx: number, dy: number) {
        translate.stopAnimation();
        translate.setValue({ x: dx, y: dy });
      },
      springHome() {
        Animated.spring(translate, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          bounciness: 4,
          speed: 16,
        }).start();
      },
    }),
    [translate],
  );

  return (
    <View
      pointerEvents="none"
      style={[styles.base, { width: size, height: size, borderRadius: half }]}
    >
      <Animated.View
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
});

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

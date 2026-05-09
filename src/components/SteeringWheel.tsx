import React, { useEffect, useRef } from 'react';
import { Animated, GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';

interface Props {
  size?: number;
  /** Maximum rotation in degrees in either direction. */
  maxRotation?: number;
  /** Called on every frame the wheel rotates. -1..1. */
  onChange: (turn: number) => void;
}

/**
 * Touch-and-drag wheel. The finger rotates around the wheel center to spin it.
 * Releases spring back to 0. Reports normalized turn input [-1, 1] via onChange.
 */
export function SteeringWheel({ size = 150, maxRotation = 540, onChange }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationValue = useRef(0);
  const startFingerAngle = useRef(0);
  const startWheelRotation = useRef(0);

  useEffect(() => {
    const id = rotation.addListener(({ value }) => {
      rotationValue.current = value;
      onChange(Math.max(-1, Math.min(1, value / maxRotation)));
    });
    return () => rotation.removeListener(id);
  }, [rotation, maxRotation, onChange]);

  const fingerAngle = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX - size / 2;
    const y = e.nativeEvent.locationY - size / 2;
    return (Math.atan2(y, x) * 180) / Math.PI;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startFingerAngle.current = fingerAngle(e);
        startWheelRotation.current = rotationValue.current;
        rotation.stopAnimation();
      },
      onPanResponderMove: (e) => {
        let delta = fingerAngle(e) - startFingerAngle.current;
        // Normalize to [-180, 180] so wraparound doesn't jump.
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        const next = Math.max(-maxRotation, Math.min(maxRotation, startWheelRotation.current + delta));
        rotation.setValue(next);
      },
      onPanResponderRelease: () => {
        Animated.spring(rotation, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 12,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(rotation, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 12,
        }).start();
      },
    }),
  ).current;

  const rotateInterp = rotation.interpolate({
    inputRange: [-maxRotation, maxRotation],
    outputRange: [`-${maxRotation}deg`, `${maxRotation}deg`],
  });

  const half = size / 2;
  const ringW = Math.max(8, size * 0.08);
  const hubSize = size * 0.32;
  const spokeW = Math.max(6, size * 0.06);

  return (
    <View style={[styles.container, { width: size, height: size }]} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.wheel,
          { width: size, height: size, borderRadius: half, borderWidth: ringW, transform: [{ rotate: rotateInterp }] },
        ]}
      >
        {/* Hub */}
        <View
          style={{
            position: 'absolute',
            left: half - hubSize / 2,
            top: half - hubSize / 2,
            width: hubSize,
            height: hubSize,
            borderRadius: hubSize / 2,
            backgroundColor: '#2a2a2a',
            borderWidth: 2,
            borderColor: '#000',
          }}
        />
        {/* Three spokes at 0°, 120°, 240° */}
        {[0, 120, 240].map((deg) => (
          <View
            key={deg}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: half - spokeW / 2,
              top: ringW + 4,
              width: spokeW,
              height: half - ringW - 4,
              backgroundColor: '#1a1a1a',
              transform: [
                { translateY: half - ringW - 4 },
                { rotate: `${deg}deg` },
                { translateY: -(half - ringW - 4) / 2 },
              ],
            }}
          />
        ))}
        {/* Top marker — yellow notch showing wheel orientation. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: half - 6,
            top: 2,
            width: 12,
            height: ringW + 4,
            backgroundColor: '#ffd24a',
            borderRadius: 3,
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheel: {
    backgroundColor: 'rgba(40,40,40,0.9)',
    borderColor: '#1a1a1a',
  },
});

// Screens/TransactionComplete.js
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const NODE_SIZE = 72;
const DOT_SIZE  = 30;    // coin size
const PAD       = 5;     // inner padding of the graph box
const MID_Y     = 140;   // vertical line position
const GAP       = 10;    // <-- space between slider and each node edge
const ARROW_SIZE = 50;

/**
 * Props:
 *  - fromName: left bubble label
 *  - toName:   right bubble label
 *  - onConfirm: called when swipe reaches the right end
 */
export default function TransactionComplete({
  fromName = 'You',
  toName   = 'Recipient',
  onConfirm,
}) {
  const [cardW, setCardW] = useState(0);

  // Node centers (unchanged)
  const leftX  = PAD + NODE_SIZE / 2;
  const rightX = Math.max(leftX + 1, cardW - PAD - NODE_SIZE / 2);

  // Slider usable path: from just outside the left node to just before the right node
  const innerLeft  = leftX  + NODE_SIZE / 2 + GAP;     // right edge of left node + GAP
  const innerRight = rightX - NODE_SIZE / 2 - GAP;     // left edge of right node - GAP
  const usableSpan = Math.max(1, innerRight - innerLeft);

  const progress = useSharedValue(0);
  const firedRef = useRef(false);

  const confirmOnce = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onConfirm?.();
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // translate relative drag distance into [0..1] along the usable span
      const next = Math.min(1, Math.max(0, e.translationX / usableSpan));
      progress.value = next;
    })
    .onEnd(() => {
      if (progress.value >= 0.98) {
        progress.value = withTiming(1);
        runOnJS(confirmOnce)();
      } else {
        progress.value = withTiming(0);
      }
    });

  // Position the slider (coin + arrow) along the *usable* path
  const sliderStyle = useAnimatedStyle(() => {
    const x = innerLeft + usableSpan * progress.value;
    return {
      transform: [
        { translateX: x - DOT_SIZE / 2 },
        { translateY: MID_Y - DOT_SIZE / 2 },
      ],
    };
  });

  return (
    <View style={styles.wrap}>
      <View
        style={styles.graphCard}
        onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
      >
        <Svg width="100%" height={220}>
          {/* Keep the full line across both nodes */}
         {/* Border (outer line) */}
  <Line
    x1={leftX}
    y1={MID_Y}
    x2={rightX}
    y2={MID_Y}
    stroke="#000"         // border color (black)
    strokeWidth={10}      // thicker
    strokeLinecap="round"
  />
  {/* Inner line */}
  <Line
    x1={leftX}
    y1={MID_Y}
    x2={rightX}
    y2={MID_Y}
    stroke="white"      // main line color (green)
    strokeWidth={6}       // thinner, sits on top
    strokeLinecap="round"
  />
        </Svg>

        {/* Left node */}
        <View style={[styles.node, { left: leftX - NODE_SIZE / 2, top: MID_Y - NODE_SIZE / 2 }]}>
          <Text numberOfLines={1} style={styles.nodeText}>{fromName}</Text>
        </View>

        {/* Right node */}
        <View style={[styles.node, { left: rightX - NODE_SIZE / 2, top: MID_Y - NODE_SIZE / 2 }]}>
          <Text numberOfLines={1} style={styles.nodeText}>{toName}</Text>
        </View>

        {/* Draggable coin + arrow (arrow leads the coin) */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.slider, sliderStyle]}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>$</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
  graphCard: {
    width: '100%',
    height: 260,
    backgroundColor: '#E8E8E8',
    borderRadius: 16,
    overflow: 'hidden',
  },

  node: {
    position: 'absolute',
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  nodeText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Slider container (coin + arrow)
  slider: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Coin visuals
  coin: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: 'gold',
    borderWidth: 2,
    borderColor: 'light-black',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: -((ARROW_SIZE - DOT_SIZE) / 2) }],
  },
  coinText: { fontSize: 17, fontWeight: 'bold', color: '#000' },

  arrow: {
    fontSize: ARROW_SIZE,
    lineHeight: ARROW_SIZE,
    color: '#007bff',
    marginTop: 5 ,
    // move it up by half the size difference so its center matches the coin center
    transform: [{ translateY: -((ARROW_SIZE - DOT_SIZE) / 2) }],
  },
});
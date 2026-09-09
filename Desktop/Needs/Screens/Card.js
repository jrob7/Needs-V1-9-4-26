// components/Card.js
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

export const activeVideoPlayers = new Set();

export default function Card({
  badgeLabel,
  badgeColor,
  title,
  subtitle,
  infoLine,
  metaRight,
  media,
  compact,
  onPress,
  isActive,
  onLayout,
}) {
  const isVideo = media?.type === 'video' || (media?.uri || '').toLowerCase().endsWith('.mp4');
  const player = useVideoPlayer(isVideo ? (media?.uri ?? null) : null, p => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!player || !isVideo) return;
    if (isActive) {
      activeVideoPlayers.add(player);
      try { player.play(); } catch {}
      player.muted = false;
    } else {
      try { player.pause(); } catch {}
      player.muted = true;
      activeVideoPlayers.delete(player);
    }
  }, [isActive, player, isVideo]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} onLayout={onLayout} style={{ width:'100%', marginBottom:12 }}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
          {!!metaRight && <Text style={styles.meta}>{metaRight}</Text>}
        </View>

        {!!title && <Text style={styles.title}>{title}</Text>}
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {!!infoLine && <Text style={styles.info}>{infoLine}</Text>}

        {!!media?.uri && (
          isVideo ? (
            <VideoView
              player={player}
              style={[styles.media, compact && styles.mediaCompact]}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <Image source={{ uri: media.uri }} style={[styles.media, compact && styles.mediaCompact]} />
          )
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
  width: '100%',
  backgroundColor: 'white',
  borderRadius: 18,
  padding: 16,
  borderWidth: 1,
  borderColor: '#E5E7EB',
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 10,
  elevation: 4,
},
  cardCompact: { padding: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  badgeText: { color: '#fff', fontWeight: '800' },
  meta: { color: '#6B7280', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '900', color: 'black', marginTop: 8 },
  subtitle: { color: '#374151', marginTop: 6 },
  info: { color: '#065F46', fontWeight: '800', marginTop: 8, fontSize: 16 },
  media: {
    width: '100%', height: 290, borderRadius: 14,
    marginTop: 12, backgroundColor: '#000',
  },
});

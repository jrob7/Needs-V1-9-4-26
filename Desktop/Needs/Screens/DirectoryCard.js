// Screens/DirectoryCard.js
// Small teaser card for the login-free guest search results (web/mobile-web
// only) — just enough to decide whether to look closer, unlike
// MatchResults.js's cards which show full detail and open an in-app modal.
// Tapping anywhere on the card is the only action: it hands off to that
// business's public module page.
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IS_WEB } from '../webLayout';

const FOOD_PLACEHOLDER = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80';
const SERVICE_PLACEHOLDER = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80';

export default function DirectoryCard({ item, onPress }) {
  const fallback = item.type === 'food' ? FOOD_PLACEHOLDER : SERVICE_PLACEHOLDER;
  const [src, setSrc] = useState(item.image || fallback);

  return (
    <TouchableOpacity style={st.card} onPress={onPress} activeOpacity={0.9}>
      <Image
        source={{ uri: src }}
        style={st.thumb}
        resizeMode="cover"
        onError={() => { if (src !== fallback) setSrc(fallback); }}
      />
      <View style={st.body}>
        <Text style={st.name} numberOfLines={1}>{item.name}</Text>
        {!!item.line && <Text style={st.line} numberOfLines={1}>{item.line}</Text>}
        {!!item.area && (
          <View style={st.areaRow}>
            <Ionicons name="location-outline" size={13} color="#64748B" />
            <Text style={st.area} numberOfLines={1}>{item.area}</Text>
          </View>
        )}
        <View style={st.viewRow}>
          <Text style={st.viewText}>View business</Text>
          <Ionicons name="arrow-forward" size={14} color="#2563EB" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14,
    padding: 12, marginBottom: 10,
  },
  thumb: { width: IS_WEB ? 64 : 56, height: IS_WEB ? 64 : 56, borderRadius: 10, backgroundColor: '#F1F5F9' },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: IS_WEB ? 16 : 15, fontWeight: '800', color: '#0F172A' },
  line: { fontSize: IS_WEB ? 13 : 12, color: '#475569', marginTop: 2 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  area: { fontSize: 12, color: '#64748B' },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  viewText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
});

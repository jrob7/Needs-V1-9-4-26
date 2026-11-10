// Screens/DirectoryCard.js
// Teaser card for the login-free guest search results (web/mobile-web
// only) — same large card format as MatchResults.js's RestaurantCard
// (full-width cover image, padded body below) for visual consistency with
// the rest of the app, but simplified to just enough info to decide
// whether to look closer: image, name, one line, area, "View business".
// Unlike RestaurantCard, tapping doesn't open an in-app detail modal — it
// hands off to that business's public module page.
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
    <TouchableOpacity style={st.card} onPress={onPress} activeOpacity={0.92}>
      <Image
        source={{ uri: src }}
        style={st.cover}
        resizeMode="cover"
        onError={() => { if (src !== fallback) setSrc(fallback); }}
      />
      <View style={st.body}>
        <Text style={st.name} numberOfLines={1}>{item.name}</Text>
        {!!item.line && <Text style={st.line} numberOfLines={2}>{item.line}</Text>}
        {!!item.area && (
          <View style={st.areaRow}>
            <Ionicons name="location-outline" size={IS_WEB ? 16 : 13} color="#6B7280" />
            <Text style={st.area} numberOfLines={1}>{item.area}</Text>
          </View>
        )}
        <View style={st.viewRow}>
          <Text style={st.viewText}>View business</Text>
          <Ionicons name="arrow-forward" size={IS_WEB ? 22 : 18} color="#2563EB" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: IS_WEB ? 23 : 18,
    marginBottom: IS_WEB ? 26 : 20,
    shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 4, overflow: 'hidden',
  },
  cover: { width: '100%', aspectRatio: 1.11, backgroundColor: '#F1F5F9' },
  body: { padding: IS_WEB ? 18 : 14 },
  name: { fontSize: IS_WEB ? 26 : 20, fontWeight: '800', color: '#111', marginBottom: IS_WEB ? 4 : 3 },
  line: { fontSize: IS_WEB ? 17 : 13, fontWeight: '600', color: '#374151', marginBottom: IS_WEB ? 8 : 6 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: IS_WEB ? 12 : 9 },
  area: { fontSize: IS_WEB ? 15 : 12, color: '#6B7280' },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  viewText: { fontSize: IS_WEB ? 20 : 16, fontWeight: '700', color: '#2563EB' },
});

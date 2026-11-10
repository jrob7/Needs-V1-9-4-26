// Screens/GuestSearchResults.js
// Login-free search results for a web/mobile-web guest (Screens/Tab1Content.js
// routes here instead of showing the login modal). Deliberately separate
// from MatchResults.js, which is built around the logged-in in-app request
// flow (full detail, in-screen modal) — this screen only ever shows a
// teaser card and hands off to the business's own public module page,
// opened in a new tab so this results tab (and the original search) is
// never lost.
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { NODE_API } from '../config';
import { IS_WEB, webContainer } from '../webLayout';
import DirectoryCard from './DirectoryCard';

export default function GuestSearchResults() {
  const navigation = useNavigation();
  const route = useRoute();
  const { matches = [], query = '' } = route.params || {};
  const [openingSlug, setOpeningSlug] = useState(null);

  const openModule = async (item) => {
    if (openingSlug) return;
    setOpeningSlug(item.slug);
    try {
      const resp = await axios.post(`${NODE_API}/createModuleDraft`, {
        slug: item.slug, originalQuery: query,
      });
      const draftId = resp.data?.draftId;
      const url = `${NODE_API}/m/${item.slug}` + (draftId ? `?draft=${draftId}` : '');
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      // Fall back to opening the module without a draft - still usable,
      // just means the guest retypes their request there instead.
      window.open(`${NODE_API}/m/${item.slug}`, '_blank', 'noopener');
    } finally {
      setOpeningSlug(null);
    }
  };

  return (
    <SafeAreaView style={st.screen}>
      <View style={[st.content, webContainer, IS_WEB && { maxWidth: 700 }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={IS_WEB ? 24 : 20} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>Results</Text>
            <Text style={st.subtitle} numberOfLines={1}>for "{query}"</Text>
          </View>
        </View>

        <FlatList
          data={matches}
          keyExtractor={(item, i) => item.slug || String(i)}
          contentContainerStyle={st.list}
          renderItem={({ item }) => (
            <View>
              <DirectoryCard item={item} onPress={() => openModule(item)} />
              {openingSlug === item.slug && (
                <View style={st.cardOverlay}>
                  <ActivityIndicator color="#2563EB" />
                </View>
              )}
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: IS_WEB ? 16 : 10, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: IS_WEB ? 20 : 17, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: IS_WEB ? 13 : 12, color: '#64748B', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  cardOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 10,
    backgroundColor: 'rgba(255,255,255,.7)', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
});

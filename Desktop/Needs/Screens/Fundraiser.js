// Screens/FundraiserDetail.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity } from 'react-native';
import NeedsVideoPlayer from '../utils/NeedsVideoPlayer';
import FundraiserTransactionComplete from './FundraiserTransactionComplete';

export default function FundraiserDetail({ route, navigation }) {
  const { fundraiser } = route.params || {};
  const [showDonateModal, setShowDonateModal] = useState(false);

  if (!fundraiser) return <View style={styles.wrap}><Text>Not found.</Text></View>;

  const { title, description, targetAmount, media, createdByName } = fundraiser;

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.badge}>Fundraiser</Text>
        <Text style={styles.title}>{title}</Text>
        {!!createdByName && <Text style={styles.byline}>by {createdByName}</Text>}
        <Text style={styles.goal}>Goal: ${targetAmount ?? 0}</Text>
        {!!description && <Text style={styles.desc}>{description}</Text>}

        {!!media?.uri && (
          media.type === 'video' ? (
            <NeedsVideoPlayer uri={media.uri} style={styles.media} contentFit="cover" />
          ) : (
            <Image source={{ uri: media.uri }} style={styles.media} />
          )
        )}

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* Floating Contribute Button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.9}
        onPress={() => setShowDonateModal(true)}
      >
        <Text style={styles.fabText}>Contribute</Text>
      </TouchableOpacity>

      {/* 👇 ALWAYS mounted, only visibility toggles (fixes animation) */}
      <FundraiserTransactionComplete
        visible={showDonateModal}
        onClose={() => setShowDonateModal(false)}
        route={{
          params: {
            fundraiserId: fundraiser._id?.toString?.(),
            userId: fundraiser.createdBy?.toString?.(),
            fromName: 'You',
            toName: createdByName || 'Fundraiser',
            amount: `${targetAmount ?? 0}`,
          },
        }}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0A84FF',
    color: '#fff',
    fontWeight: '800',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '900', color: '#1F2937' },
  byline: { marginTop: 4, color: '#6B7280', fontWeight: '600' },
  goal: { marginTop: 10, color: '#065F46', fontWeight: '800', fontSize: 16 },
  desc: { marginTop: 10, color: '#111827', lineHeight: 20 },
  media: { width: '100%', height: 300, borderRadius: 14, marginTop: 12 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#0A84FF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  fabText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
// Screens/SingleItemView.js
import React, { useLayoutEffect, useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import NeedsVideoPlayer from '../utils/NeedsVideoPlayer';

import { NODE_API } from '../config';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const resolveImg = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('data:')) return uri;
  return `${NODE_API}/uploads/${uri}`;
};

// Mongo ObjectIds embed their creation time in the first 4 bytes —
// gives a real "member since" date with no schema change needed.
const memberSinceLabel = (id) => {
  if (!id || typeof id !== 'string' || id.length < 8) return null;
  const seconds = parseInt(id.substring(0, 8), 16);
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return `Member since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
};

const SingleItemView = ({ route }) => {
  const { item, fromNeedInquiry } = route.params || {};
  const navigation = useNavigation();
  const [userProfile, setUserProfile] = useState(null);
  // --- NORMALIZER: supports NeedRequest + UploadedItem + Fundraiser ---
  const normalized = {
    // Full description — context holds the richer text on need requests
    // created through the slow/clarify path; falls back to the heading.
    details:
      item?.context ||
      item?.searchText ||
      item?.title ||
      "",

    // Price
    price: item?.bidprice ?? item?.offer ?? 0,

    // Urgency
    urgency: item?.urgency || "Anytime",

    // Media
    mediaUri:
      item?.media?.uri ||
      (item?.images?.[0] ? resolveImg(item.images[0]) : null),

    mediaType: item?.media?.type || "image",

    // Ownership
    userId: item?.userId || item?.createdBy || null,
  };

  const isUploadedItem = !!item?.title && !item?.searchText;
  const isFundraiser   = !!item?.targetAmount;
  const badge = isFundraiser
    ? { label: 'Fundraiser', color: '#0A84FF' }
    : isUploadedItem
      ? { label: 'Item', color: '#16A34A' }
      : { label: 'Need', color: '#007bff' };

  const handleBackPress = () => {
    if (fromNeedInquiry) navigation.navigate('NeedInquiryView');
    else navigation.goBack();
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Fetch creator profile using getUserDetails (has profilePicture field)
  useEffect(() => {
    const fetchUser = async () => {
      if (!normalized.userId) return;
      try {
        const resp = await fetch(`${NODE_API}/getUserDetails?userId=${normalized.userId}`);
        const result = await resp.json();
        if (resp.ok) setUserProfile(result);
      } catch {}
    };
    fetchUser();
  }, [normalized.userId]);

  const creatorName = userProfile
    ? [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ') || userProfile.name || 'Anonymous'
    : null;

  const creatorPic = userProfile
    ? resolveImg(userProfile.profilePicture || userProfile.profileImageUrl)
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: IS_WEB ? '#F7F7F7' : '#fff' }}>
      <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>
      <View style={[styles.headerRow, IS_WEB && { paddingTop: WEB_HEADER_HEIGHT + 8 }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.headerIconBtn}>
          <Ionicons name="chevron-back" size={36} color="#111827" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="ellipsis-horizontal" size={31} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>

        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>

        {/* --- WHEN --- */}
        <View style={styles.row}>
          <Ionicons name="time-outline" size={27} color="#2563EB" />
          <Text style={styles.rowLabel}>When</Text>
          <Text style={styles.rowValue}>{normalized.urgency}</Text>
        </View>
        <View style={styles.divider} />

        {/* --- OFFER --- */}
        <View style={styles.row}>
          <Ionicons name="cash-outline" size={27} color="#2563EB" />
          <Text style={styles.rowLabel}>Offer</Text>
          <Text style={styles.rowValue}>${normalized.price}</Text>
        </View>
        <View style={styles.divider} />

        {/* --- DETAILS --- */}
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="document-text-outline" size={23} color="#2563EB" />
          <Text style={styles.sectionHeaderText}>Details</Text>
        </View>
        <Text style={styles.detailsText}>{normalized.details}</Text>

        {/* --- PHOTO (only when media is attached) --- */}
        {normalized.mediaUri && (
          <>
            <View style={styles.divider} />
            {normalized.mediaUri.toLowerCase().endsWith('.mp4') || normalized.mediaUri.toLowerCase().endsWith('.mov') ? (
              <NeedsVideoPlayer uri={normalized.mediaUri} style={styles.media} contentFit="cover" />
            ) : (
              <Image source={{ uri: normalized.mediaUri }} style={styles.media} />
            )}
          </>
        )}

        <View style={[styles.divider, !normalized.mediaUri && styles.dividerNoMedia]} />

        {/* --- POSTED BY --- */}
        {userProfile && (
          <TouchableOpacity
            style={styles.postedByRow}
            onPress={() => navigation.navigate('ProfileView', {
              userId: normalized.userId,
              readOnly: true,
            })}
            activeOpacity={0.8}
          >
            {creatorPic
              ? <Image source={{ uri: creatorPic }} style={styles.creatorAvatar} />
              : <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
                  <Text style={styles.creatorInitial}>{(creatorName?.[0] || '?').toUpperCase()}</Text>
                </View>
            }
            <View>
              <Text style={styles.postedByLabel}>Posted by</Text>
              <Text style={styles.creatorName}>{creatorName}</Text>
              {!!memberSinceLabel(normalized.userId) && (
                <Text style={styles.memberSince}>{memberSinceLabel(normalized.userId)}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}

      </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerIconBtn: { padding: 8 },

  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 26,
    paddingBottom: 52,
  },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 10,
    marginBottom: 24,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 21 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  rowLabel: { fontSize: 22, color: '#374151', marginLeft: 10, flex: 1 },
  rowValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 21 },
  dividerNoMedia: { marginTop: 150 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  sectionHeaderText: { fontSize: 21, fontWeight: '800', color: '#0F172A', marginLeft: 10 },
  detailsText: { fontSize: 22, color: '#1F2937', lineHeight: 34, marginBottom: 10 },

  media: {
    width: '100%',
    aspectRatio: 2.2,
    borderRadius: 18,
    backgroundColor: '#000',
  },

  postedByRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  creatorAvatar: { width: 67, height: 67, borderRadius: 34, borderWidth: 2, borderColor: '#2563EB' },
  creatorAvatarFallback: { backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  creatorInitial: { fontSize: 23, fontWeight: '900', color: '#2563EB' },
  postedByLabel: { fontSize: 16, color: '#9CA3AF', marginBottom: 2 },
  creatorName: { fontSize: 21, fontWeight: '800', color: '#0F172A' },
  memberSince: { fontSize: 16, color: '#9CA3AF', marginTop: 2 },

  fillNeedsButton: {
    backgroundColor: '#007bff',
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fillNeedsButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
});

export default SingleItemView;

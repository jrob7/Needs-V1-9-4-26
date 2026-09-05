// Screens/ProfileView.js
import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, TextInput, Alert, Animated, SafeAreaView,
  Dimensions, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { UserContext } from '../server/CurrentUser';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { IS_WEB, WEB_HEADER_HEIGHT, WEB_MAX_WIDTH } from '../webLayout';
const { width: W } = Dimensions.get('window');
const CARD_W = 140;

const calcOverall = (r, resp, rec) =>
  (parseFloat(r || 0) * 0.3 + parseFloat(resp || 0) * 0.3 + parseFloat(rec || 0) * 0.4).toFixed(1);

const resolveImg = (uri) => {
  if (!uri) return null;
  return uri.startsWith('http') ? uri : `${NODE_API}/uploads/${uri}`;
};

const StarRow = ({ rating }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.floor(rating);
    const half   = !filled && i - 0.5 <= rating;
    stars.push(
      <Ionicons key={i} name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
        size={20} color="#2563EB" style={{ marginRight: 1 }} />
    );
  }
  return <View style={{ flexDirection: 'row' }}>{stars}</View>;
};

const RatingBar = ({ label, value, color, weight }) => (
  <View style={styles.ratingRow}>
    <Text style={styles.ratingLabel}>{label}</Text>
    <Text style={styles.ratingWeight}>{weight}</Text>
    <View style={styles.ratingBarBg}>
      <View style={[styles.ratingBarFill, { width: `${(parseFloat(value || 0) / 5) * 100}%`, backgroundColor: color }]} />
    </View>
    <Text style={[styles.ratingVal, { color }]}>{parseFloat(value || 0).toFixed(1)}</Text>
  </View>
);

const StatBox = ({ icon, value, label, color }) => (
  <View style={styles.statBox}>
    <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.statVal}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ── Recommendation card ───────────────────────────────────────────────────────
const RecoCard = ({ item, onAddPress, readOnly }) => {
  if (item.isAdd) {
    // Don't show Add card in readOnly mode
    if (readOnly) return null;
    return (
      <TouchableOpacity style={styles.recoAdd} onPress={onAddPress}>
        <View style={styles.recoAddInner}>
          <Ionicons name="add" size={36} color="#2563EB" />
        </View>
        <Text style={styles.recoAddLabel}>Add</Text>
      </TouchableOpacity>
    );
  }
  const isFood   = item.type === 'food';
  const color    = isFood ? '#D97706' : '#2563EB';
  const iconName = isFood ? 'restaurant-outline' : 'construct-outline';
  const imgUri   = resolveImg(item.coverImageUrl || item.portfolioImageUrls?.[0]);

  return (
    <View style={styles.recoCard}>
      <View style={[styles.recoTypeBadge, { backgroundColor: color }]}>
        <Ionicons name={iconName} size={13} color="#fff" />
        <Text style={styles.recoTypeTxt}>{isFood ? 'Food' : 'Service'}</Text>
      </View>
      {imgUri
        ? <Image source={{ uri: imgUri }} style={styles.recoImg} resizeMode="cover" />
        : <View style={[styles.recoImg, { backgroundColor: color + '18', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name={iconName} size={42} color={color} />
          </View>
      }
      <Text style={styles.recoName} numberOfLines={2}>{item.name || item.businessName || 'Unknown'}</Text>
      {item.tagline ? <Text style={styles.recoTag} numberOfLines={1}>{item.tagline}</Text> : null}
    </View>
  );
};

// ── Add Reco Modal ────────────────────────────────────────────────────────────
const AddRecoModal = ({ visible, onClose, onAdd }) => {
  const [type, setType]       = useState('food');
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const endpoint = type === 'food' ? 'restaurants' : 'services';
      const r = await fetch(`${NODE_API}/${endpoint}?search=${encodeURIComponent(query)}&max=10`);
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.modalScreen}>
        <View style={[{ flex: 1 }, IS_WEB && { maxWidth: WEB_MAX_WIDTH, width: '100%', alignSelf: 'center' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Recommendation</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#64748B" /></TouchableOpacity>
          </View>
          <View style={styles.typeToggle}>
            {['food', 'service'].map(t => (
              <TouchableOpacity key={t} style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                onPress={() => { setType(t); setResults([]); }}>
                <Ionicons name={t === 'food' ? 'restaurant-outline' : 'construct-outline'}
                  size={14} color={type === t ? '#fff' : '#2563EB'} />
                <Text style={[styles.typeBtnTxt, type === t && { color: '#fff' }]}>
                  {t === 'food' ? 'Restaurant' : 'Service'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.searchRow}>
            <TextInput style={styles.searchInput} value={query} onChangeText={setQuery}
              placeholder={`Search ${type === 'food' ? 'restaurants' : 'services'}…`}
              placeholderTextColor="#94A3B8" returnKeyType="search" onSubmitEditing={search} />
            <TouchableOpacity style={styles.searchBtn} onPress={search}>
              <Ionicons name="search" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {loading && <Text style={styles.loadingTxt}>Searching…</Text>}
            {results.map((item, i) => (
              <TouchableOpacity key={i} style={styles.resultRow}
                onPress={() => { onAdd({ ...item, type }); onClose(); }}>
                <View style={[styles.resultIcon, { backgroundColor: type === 'food' ? '#FEF3C7' : '#EFF6FF' }]}>
                  <Ionicons name={type === 'food' ? 'restaurant-outline' : 'construct-outline'}
                    size={16} color={type === 'food' ? '#D97706' : '#2563EB'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{item.name || item.businessName}</Text>
                  {item.tagline ? <Text style={styles.resultTag} numberOfLines={1}>{item.tagline}</Text> : null}
                </View>
                <Ionicons name="add-circle" size={22} color="#2563EB" />
              </TouchableOpacity>
            ))}
            {!loading && results.length === 0 && query.length > 0 &&
              <Text style={styles.noResults}>No results. Try a different search.</Text>}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
const ProfileView = () => {
  const navigation = useNavigation();
  const route      = useRoute();
  const ctx        = useContext(UserContext);

  // ── readOnly: true when viewing someone else's profile ───────────────────
  // Only allow editing if this is the logged-in user's own profile
  const routeUserId = route.params?.userId;
  const routeReadOnly = route.params?.readOnly;
  const loggedInUserId = ctx?.userId;

  // Determine actual userId to display
  const userId = routeUserId || loggedInUserId;

  // readOnly if explicitly passed, OR if viewing a different user's profile
  const readOnly = routeReadOnly === true ||
    (routeUserId && loggedInUserId && routeUserId !== loggedInUserId);

  const syncToContext = (data) => {
    if (ctx?.setUserProfile)   ctx.setUserProfile(data);
    if (ctx?.patchUserProfile) ctx.patchUserProfile(data);
  };

  const fade = useRef(new Animated.Value(0)).current;

  const [user, setUser]                       = useState(null);
  const [about, setAbout]                     = useState('');
  const [editingAbout, setEditingAbout]       = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [activity, setActivity]               = useState({});
  const [recommendations, setRecommendations] = useState([]);
  const [showAddReco, setShowAddReco]         = useState(false);

  const fetchUser = useCallback(async () => {
    if (!userId) { console.warn('ProfileView: no userId'); return; }
    try {
      const r    = await fetch(`${NODE_API}/getUserDetails?userId=${userId}`);
      const data = await r.json();
      setUser(data);
      setAbout(data.about || '');
      setRecommendations(data.recommendations || []);
      if (!readOnly) syncToContext(data);
    } catch (e) { console.error('Profile fetch error:', e); }
  }, [userId]);

  const fetchActivity = useCallback(async () => {
    if (!userId) return;
    try {
      const r    = await fetch(`${NODE_API}/getUserActivity?userId=${userId}`);
      const data = await r.json();
      setActivity(data);
    } catch {}
  }, [userId]);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    setUser(null); setAbout(''); setRecommendations([]); setActivity({});
    fetchUser(); fetchActivity();
  }, [fetchUser, fetchActivity]);

  useFocusEffect(useCallback(() => {
    fetchUser(); fetchActivity();
  }, [fetchUser, fetchActivity]));

  // ── Photo pick — only allowed in edit mode ───────────────────────────────
  const handlePickPhoto = async () => {
    if (readOnly) return; // safety guard
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setSaving(true);
      try {
        const up = await fetch(`${NODE_API}/uploadImage`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: result.assets[0].base64,
        });
        const { imageUrl } = await up.json();
        await fetch(`${NODE_API}/updateUserMedia`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, type: 'profilePicture', mediaPath: imageUrl }),
        });
        const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${NODE_API}/uploads/${imageUrl}`;
        const updated = { ...user, profilePicture: fullUrl };
        setUser(updated);
        if (ctx?.setUserProfile) ctx.setUserProfile(updated);
        Alert.alert('✅', 'Photo updated!');
      } catch { Alert.alert('Error', 'Upload failed.'); }
      finally { setSaving(false); }
    }
  };

  const handleSaveAbout = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await authFetch(`${NODE_API}/updateUserProfile`, {
        method: 'POST',
        body: JSON.stringify({ about }),
      });
      setUser(prev => ({ ...prev, about }));
      syncToContext({ about });
      setEditingAbout(false);
    } catch { Alert.alert('Error', 'Save failed.'); }
    finally { setSaving(false); }
  };

  const handleAddReco = async (item) => {
    if (readOnly) return;
    const updated = [...recommendations, item];
    setRecommendations(updated);
    syncToContext({ recommendations: updated });
    try {
      await authFetch(`${NODE_API}/updateUserProfile`, {
        method: 'POST',
        body: JSON.stringify({ recommendations: updated }),
      });
    } catch {}
  };

  const firstName      = user?.firstName || '';
  const lastName       = user?.lastName  || '';
  const fullName       = [firstName, lastName].filter(Boolean).join(' ') || 'Profile';
  const memberSince    = user?.memberSince || '';
  const avatarUri      = resolveImg(user?.profilePicture || user?.profileImageUrl);
  const reliability    = parseFloat(user?.reliability    || 0);
  const responsiveness = parseFloat(user?.responsiveness || 0);
  const recommended    = parseFloat(user?.recommended    || 0);
  const overall        = calcOverall(reliability, responsiveness, recommended);
  const experiences    = user?.experiences ?? 0;
  const needCoins      = user?.needCoins   ?? 0;
  const recoData       = readOnly ? recommendations : [...recommendations, { isAdd: true }];

  // ── FIXED: use readOnly (already correctly computed) instead of
  //    routeUserId alone, which can be undefined even on other-user profiles.
  //    Also keep loggedInUserId check so you never see it on your own profile.
  const showMessageButton = readOnly && loggedInUserId && loggedInUserId !== userId;

  return (
    <SafeAreaView style={styles.screen}>
      <Animated.ScrollView style={{ opacity: fade }} contentContainerStyle={[styles.content, IS_WEB && { paddingTop: WEB_HEADER_HEIGHT }]}
        showsVerticalScrollIndicator={false}>
        <View style={IS_WEB ? { maxWidth: Math.round(WEB_MAX_WIDTH * 1.3), width: '100%', alignSelf: 'center' } : null}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={29} color="#2563EB" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{readOnly ? 'Profile' : 'My Profile'}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Avatar ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={readOnly ? undefined : handlePickPhoto}
            activeOpacity={readOnly ? 1 : 0.85}
            disabled={readOnly}
          >
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
              : <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>
                    {(firstName[0] || '') + (lastName[0] || '') || '?'}
                  </Text>
                </View>
            }
            {/* Only show + badge in edit mode */}
            {!readOnly && (
              <View style={styles.plusBadge}>
                <Ionicons name="add" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.heroName}>{fullName}</Text>
          {memberSince ? <Text style={styles.heroSub}>Member since {memberSince}</Text> : null}
          <View style={styles.heroLocation}>
            <Ionicons name="location-outline" size={16} color="#64748B" />
            <Text style={styles.heroLocationText}>Long Beach, CA</Text>
          </View>

          {/* ── Message button — only shown on OTHER user's profile ── */}
          {showMessageButton && (
            <TouchableOpacity
              style={styles.msgBtn}
              onPress={async () => {
                try {
                  const r = await authFetch(`${NODE_API}/startConversation`, {
                    method: 'POST',
                    body: JSON.stringify({ recipientId: userId }),
                  });
                  const data = await r.json();
                  if (data.conversationId) {
                    navigation.navigate('Conversation', {
                      conversationId: data.conversationId,
                      recipientId: userId,
                      recipientName: fullName,
                      recipientPic: user?.profilePicture || null,
                    });
                  }
                } catch (e) { Alert.alert('Error', 'Could not start conversation.'); }
              }}
            >
              <Ionicons name="chatbubble-outline" size={21} color="#fff" />
              <Text style={styles.msgBtnTxt}>Message {firstName}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── About ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardLabel}>About</Text>
            {/* Edit button only in own profile */}
            {!readOnly && (
              <TouchableOpacity onPress={() => editingAbout ? handleSaveAbout() : setEditingAbout(true)}>
                <Text style={styles.editLink}>{editingAbout ? (saving ? 'Saving…' : 'Save') : 'Edit'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {!readOnly && editingAbout
            ? <TextInput style={styles.aboutInput} value={about} onChangeText={setAbout}
                multiline placeholder="Write something about yourself…"
                placeholderTextColor="#94A3B8" autoFocus />
            : <Text style={styles.aboutText}>{about || (readOnly ? 'No bio yet.' : 'Tap Edit to add a bio.')}</Text>
          }
        </View>

        {/* ── Stats ──────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatBox icon="list-outline"           value={activity.totalNeedsRequested ?? 0} label="Requests"  color="#2563EB" />
          <View style={styles.statDivider} />
          <StatBox icon="checkmark-done-outline" value={activity.totalNeedsFilled    ?? 0} label="Fulfilled" color="#10B981" />
          <View style={styles.statDivider} />
          <StatBox icon="diamond-outline"        value={needCoins}                          label="NeedCoins" color="#D97706" />
        </View>

        {/* ── Rating ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Overall Rating</Text>
          <View style={styles.overallRow}>
            <Text style={styles.overallNum}>{overall}</Text>
            <View style={{ marginLeft: 12 }}>
              <StarRow rating={parseFloat(overall)} />
              <Text style={styles.overallExp}>Based on {experiences} experience{experiences !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <RatingBar label="Reliability"    value={reliability}    color="#2563EB" weight="30%" />
          <RatingBar label="Responsiveness" value={responsiveness} color="#0EA5E9" weight="30%" />
          <RatingBar label="Recommended"    value={recommended}    color="#10B981" weight="40%" />
          <Text style={styles.formula}>30% Reliability · 30% Responsiveness · 40% Recommended</Text>
        </View>

        {/* ── Recommendations ────────────────────────────────────── */}
        {(recommendations.length > 0 || !readOnly) && (
          <View style={styles.recoSection}>
            <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
              <Text style={styles.cardLabel}>Recommendations</Text>
              <Text style={styles.recoSubtitle}>Restaurants & services you love</Text>
            </View>
            <FlatList
              data={recoData}
              keyExtractor={(_, i) => String(i)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recoList}
              renderItem={({ item }) => (
                <RecoCard item={item} onAddPress={() => setShowAddReco(true)} readOnly={readOnly} />
              )}
            />
          </View>
        )}

        <View style={{ height: 50 }} />
        </View>
      </Animated.ScrollView>

      {!readOnly && (
        <AddRecoModal visible={showAddReco} onClose={() => setShowAddReco(false)} onAdd={handleAddReco} />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 21, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn:     { padding: 5 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },

  hero: { alignItems: 'center', paddingTop: 31, paddingBottom: 26 },
  avatarWrap:     { position: 'relative', marginBottom: 16 },
  avatar:         { width: 130, height: 130, borderRadius: 65, borderWidth: 4, borderColor: '#2563EB' },
  avatarFallback: { backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 44, fontWeight: '900', color: '#2563EB' },
  plusBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  heroName:         { fontSize: 29, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5, marginBottom: 5 },
  heroSub:          { fontSize: 16, color: '#64748B', marginBottom: 5 },
  heroLocation:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  heroLocationText: { fontSize: 16, color: '#64748B' },
  msgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#2563EB', borderRadius: 18,
    paddingHorizontal: 26, paddingVertical: 14, marginTop: 5,
  },
  msgBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 21, marginBottom: 16,
    borderRadius: 23, padding: 23,
    shadowColor: '#1E3A8A', shadowOpacity: 0.08,
    shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 3, borderWidth: 1, borderColor: '#EEF2FF',
  },
  cardLabel:    { fontSize: 14, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 13 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  editLink:     { fontSize: 17, color: '#2563EB', fontWeight: '700' },
  aboutText:    { fontSize: 18, color: '#334155', lineHeight: 29 },
  aboutInput:   {
    fontSize: 18, color: '#334155', lineHeight: 29,
    borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 13,
    padding: 16, minHeight: 117, textAlignVertical: 'top', backgroundColor: '#F8FAFF',
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 21, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 21, padding: 21,
    shadowColor: '#1E3A8A', shadowOpacity: 0.08,
    shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 3, borderWidth: 1, borderColor: '#EEF2FF',
  },
  statBox:    { flex: 1, alignItems: 'center' },
  statIcon:   { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginBottom: 7 },
  statVal:    { fontSize: 25, fontWeight: '900', color: '#0F172A', marginBottom: 3 },
  statLabel:  { fontSize: 13, color: '#64748B', fontWeight: '600' },
  statDivider:{ width: 1, height: 47, backgroundColor: '#F1F5F9' },

  overallRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  overallNum: { fontSize: 60, fontWeight: '900', color: '#0F172A', lineHeight: 65 },
  overallExp: { fontSize: 14, color: '#94A3B8', marginTop: 5 },
  divider:    { height: 1, backgroundColor: '#F1F5F9', marginBottom: 16 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  ratingLabel:  { fontSize: 17, fontWeight: '700', color: '#1E293B', width: 150 },
  ratingWeight: { fontSize: 13, color: '#CBD5E1', fontWeight: '600', width: 42 },
  ratingBarBg:  { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginHorizontal: 10 },
  ratingBarFill:{ height: '100%', borderRadius: 4 },
  ratingVal:    { fontSize: 17, fontWeight: '800', width: 39, textAlign: 'right' },
  formula:      { fontSize: 12, color: '#CBD5E1', marginTop: 13, textAlign: 'center' },

  recoSection:  { marginBottom: 16 },
  recoSubtitle: { fontSize: 16, color: '#94A3B8', marginTop: 3 },
  recoList:     { paddingHorizontal: 21, gap: 16, paddingBottom: 5 },
  recoCard: {
    width: CARD_W, backgroundColor: '#fff', borderRadius: 21, overflow: 'hidden',
    borderWidth: 1.5, borderColor: '#EEF2FF',
    shadowColor: '#1E3A8A', shadowOpacity: 0.07,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  recoTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    position: 'absolute', top: 10, left: 10, zIndex: 1,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  recoTypeTxt: { fontSize: 12, color: '#fff', fontWeight: '700' },
  recoImg:     { width: CARD_W, height: 130 },
  recoName:    { fontSize: 16, fontWeight: '800', color: '#0F172A', padding: 10, paddingBottom: 3 },
  recoTag:     { fontSize: 13, color: '#64748B', paddingHorizontal: 10, paddingBottom: 10 },
  recoAdd: {
    width: CARD_W, height: 200, borderRadius: 21,
    borderWidth: 2, borderColor: '#BFDBFE', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFF',
  },
  recoAddInner: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  recoAddLabel: { fontSize: 16, color: '#2563EB', fontWeight: '700' },

  modalScreen: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  modalTitle:    { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  typeToggle:    { flexDirection: 'row', margin: 16, gap: 10 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#2563EB',
  },
  typeBtnActive: { backgroundColor: '#2563EB' },
  typeBtnTxt:    { fontSize: 13, color: '#2563EB', fontWeight: '700' },
  searchRow:     { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchBtn:    { backgroundColor: '#2563EB', borderRadius: 12, width: 46, justifyContent: 'center', alignItems: 'center' },
  resultRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 12 },
  resultIcon:   { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  resultName:   { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  resultTag:    { fontSize: 12, color: '#64748B' },
  loadingTxt:   { textAlign: 'center', color: '#94A3B8', padding: 20 },
  noResults:    { textAlign: 'center', color: '#94A3B8', padding: 20, fontSize: 13 },
});

export default ProfileView;
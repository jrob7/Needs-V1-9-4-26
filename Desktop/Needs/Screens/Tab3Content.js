// Screens/Tab3Content.js
import React, { useEffect, useState, useContext, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Image, Animated, Share, Clipboard, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext } from '../server/CurrentUser';
import BusinessOffersModal from './BusinessOffersModal';
import BusinessVisitModal from './BusinessVisitModal';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const calcOverall = (r, resp, rec) =>
  (parseFloat(r) * 0.3 + parseFloat(resp) * 0.3 + parseFloat(rec) * 0.4).toFixed(1);

// Mongo ObjectIds embed their creation time in the first 4 bytes —
// gives a real "member since" date with no schema change needed.
const memberSinceFromId = (id) => {
  if (!id || typeof id !== 'string' || id.length < 8) return null;
  const seconds = parseInt(id.substring(0, 8), 16);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const StarRow = ({ rating, size = 15 }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= Math.floor(rating);
    const half   = !filled && i - 0.5 <= rating;
    stars.push(
      <Ionicons
        key={i}
        name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
        size={size}
        color="#2563EB"
        style={{ marginRight: 2 }}
      />
    );
  }
  return <View style={{ flexDirection: 'row', alignItems: 'center' }}>{stars}</View>;
};

// Full-width rating row
const RatingRow = ({ icon, label, value, color, weight }) => {
  const pct = (parseFloat(value) / 5) * 100;
  return (
    <View style={styles.ratingRow}>
      <View style={styles.ratingRowLeft}>
        <View style={[styles.ratingRowIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={IS_WEB ? 20 : 15} color={color} />
        </View>
        <Text style={styles.ratingRowLabel}>{label}</Text>
        <Text style={styles.ratingRowWeight}>{weight}</Text>
      </View>
      <View style={styles.ratingRowRight}>
        <View style={styles.ratingBar}>
          <View style={[styles.ratingBarFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <Text style={[styles.ratingRowVal, { color }]}>{value}</Text>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Expandable section — bold, professional
// ─────────────────────────────────────────────────────────────────────────────
const Section = ({ icon, title, color, children }) => {
  const [open, setOpen] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.timing(rot, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start();
    setOpen(!open);
  };

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={toggle} activeOpacity={0.8}>
        <View style={[styles.sectionIcon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={IS_WEB ? 20 : 15} color="#fff" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-forward" size={IS_WEB ? 21 : 16} color="#94A3B8" />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
};

const MenuItem = ({ icon, label, badge, onPress, destructive }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.menuIconWrap, { backgroundColor: destructive ? '#FEE2E2' : '#F1F5F9' }]}>
      <Ionicons name={icon} size={IS_WEB ? 18 : 14} color={destructive ? '#EF4444' : '#475569'} />
    </View>
    <Text style={[styles.menuLabel, destructive && { color: '#EF4444' }]}>{label}</Text>
    {badge != null && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    )}
    <Ionicons name="chevron-forward" size={IS_WEB ? 17 : 13} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
  </TouchableOpacity>
);


// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
const AccountTabContent = () => {
  const navigation = useNavigation();
  const ctx = useContext(UserContext);
  const globalUserId    = ctx.userId;
  const setUserId       = ctx.setUserId;
  const [userDetails, setUserDetails]         = useState(null);
  const [businessDoc, setBusinessDoc]         = useState(null);
  const [offersModalVisible, setOffersModal]  = useState(false);
  const [visitModalVisible, setVisitModal]   = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarLoading, setCalendarLoading]     = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const isBusiness = ctx.accountType === 'business';
  const isService  = isBusiness && ctx.businessType === 'service';

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const fetchForId = (id) => {
    if (!id) return;
    fetch(`${NODE_API}/getUserDetails?userId=${id}`)
      .then(r => r.json())
      .then(data => { setUserDetails(data); })
      .catch(e => console.error('User fetch:', e));
  };

  // Business accounts' name/address live on their Service or Restaurant
  // listing, not on the Users doc — pull that in too so the profile card
  // reflects the actual uploaded business info instead of generic fallbacks.
  const fetchBusinessListing = (id) => {
    if (!id || !isBusiness) { setBusinessDoc(null); return; }
    const endpoint = ctx.businessType === 'restaurant' ? 'myRestaurant' : ctx.businessType === 'nonprofit' ? 'myNonprofit' : 'myService';
    authFetch(`${NODE_API}/${endpoint}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setBusinessDoc(data))
      .catch(e => console.error('Business listing fetch:', e));
  };

  const fetchUserDetails = async () => {
    let id = globalUserId;
    if (!id) {
      try { id = await AsyncStorage.getItem('userId'); } catch {}
    }
    if (!id) { setUserDetails(null); setBusinessDoc(null); return; }
    fetchForId(id);
    fetchBusinessListing(id);
    // Check Google Calendar connection status for service providers
    if (ctx.accountType === 'business' && ctx.businessType === 'service') {
      authFetch(`${NODE_API}/auth/google/calendar/status`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setCalendarConnected(!!data.connected); })
        .catch(() => {});
    }
  };

  const handleConnectCalendar = async () => {
    const id = globalUserId || await AsyncStorage.getItem('userId').catch(() => null);
    if (!id) return;
    // Open the OAuth URL in the device browser; server redirects back via deep link
    const url = `${NODE_API}/auth/google/calendar?token=${await AsyncStorage.getItem('authToken').catch(() => '')}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open browser.'));
  };

  const handleDisconnectCalendar = () => {
    Alert.alert(
      'Disconnect Google Calendar',
      'Remove calendar sync? Existing appointments will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect', style: 'destructive',
          onPress: async () => {
            setCalendarLoading(true);
            try {
              const r = await authFetch(`${NODE_API}/auth/google/calendar`, { method: 'DELETE' });
              if (r.ok) { setCalendarConnected(false); Alert.alert('Disconnected', 'Google Calendar has been unlinked.'); }
            } catch { Alert.alert('Error', 'Could not disconnect. Please try again.'); }
            finally { setCalendarLoading(false); }
          },
        },
      ]
    );
  };

  useEffect(() => {
    setUserDetails(null); // clear stale data immediately on user switch
    setBusinessDoc(null);
    fetchUserDetails();
  }, [globalUserId, ctx.accountType, ctx.businessType]);

  // Business accounts edit their Service/Restaurant listing (same fields shown
  // when someone views the business in Matches); individuals edit ProfileView.
  const handleEditProfile = async () => {
    if (ctx.accountType !== 'business') {
      navigation.navigate('ProfileView');
      return;
    }
    const isRestaurant = ctx.businessType === 'restaurant';
    const endpoint = isRestaurant ? 'myRestaurant' : ctx.businessType === 'nonprofit' ? 'myNonprofit' : 'myService';
    try {
      const res = await authFetch(`${NODE_API}/${endpoint}`);
      if (!res.ok) {
        Alert.alert('No listing found', "We couldn't find your business listing yet.");
        return;
      }
      const existingDoc = await res.json();
      const editScreen = isRestaurant ? 'UploadRestaurant' : ctx.businessType === 'nonprofit' ? 'UploadNonprofit' : 'UploadService';
      navigation.navigate(editScreen, {
        editMode: true, existingDoc,
      });
    } catch (e) {
      console.error('Edit profile fetch failed:', e);
      Alert.alert('Error', 'Could not load your business listing.');
    }
  };

  useFocusEffect(
    React.useCallback(() => { fetchUserDetails(); }, [globalUserId, ctx.accountType, ctx.businessType])
  );

  const handleLogout = async () => {
    const doLogout = async () => {
      await AsyncStorage.multiRemove(['userId', 'authToken', 'accountType', 'businessType']);
      setUserId(null);
      navigation.navigate('Need');
    };
    if (IS_WEB) {
      if (!window.confirm('Are you sure you want to sign out?')) return;
      await doLogout();
      return;
    }
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: doLogout },
    ]);
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Camera roll access needed.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        const uploadRes = await fetch(`${NODE_API}/uploadImage`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: result.assets[0].base64,
        });
        const { imageUrl } = await uploadRes.json();
        const fullUrl = imageUrl.startsWith('http')
          ? imageUrl
          : /^[0-9a-f]{24}$/i.test(imageUrl)
            ? `${NODE_API}/images/${imageUrl}`
            : `${NODE_API}/uploads/${imageUrl}`;
        await fetch(`${NODE_API}/updateUserMedia`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: globalUserId, type: 'profilePicture', mediaPath: fullUrl }),
        });
        setUserDetails(prev => ({ ...prev, profilePicture: fullUrl }));
        Alert.alert('✅', 'Profile photo updated!');
      } catch (e) { Alert.alert('Error', 'Upload failed.'); }
    }
  };

  const reliability    = parseFloat(userDetails?.reliability    ?? 0);
  const responsiveness = parseFloat(userDetails?.responsiveness ?? 0);
  const recommended    = parseFloat(userDetails?.recommended    ?? 0);
  const overall        = calcOverall(reliability, responsiveness, recommended);
  const experiences    = userDetails?.experiences ?? 0;
  const firstName      = userDetails?.firstName || '';
  const lastName       = userDetails?.lastName  || '';
  const businessName   = businessDoc?.businessName || businessDoc?.name || '';
  const businessLocation = businessDoc?.serviceArea || businessDoc?.businessAddress || businessDoc?.address || '';
  const fullName       = isBusiness
    ? (businessName || 'Your Business')
    : ([firstName, lastName].filter(Boolean).join(' ') || 'Your Account');
  const locationText   = isBusiness ? businessLocation : (userDetails?.streetAddress || '');
  const rawAvatar  = userDetails?.profilePicture || userDetails?.profileImageUrl
    || (isBusiness ? (businessDoc?.logoUrl || businessDoc?.profileImageUrl) : null);
  const avatarUri  = rawAvatar
    ? (rawAvatar.startsWith('http')
        ? rawAvatar
        : /^[0-9a-f]{24}$/i.test(rawAvatar)
          ? `${NODE_API}/images/${rawAvatar}`
          : `${NODE_API}/uploads/${rawAvatar}`)
    : null;
  const avatarInitials = isBusiness
    ? (businessName ? businessName[0].toUpperCase() : '?')
    : ((firstName[0] || '') + (lastName[0] || '') || '?');
  const memberSince    = memberSinceFromId(userDetails?._id) || 'recently';

  if (!globalUserId) {
    return (
      <View style={styles.signedOut}>
        <View style={styles.signedOutIconWrap}>
          <Ionicons name="person-outline" size={IS_WEB ? 52 : 40} color="#2563EB" />
        </View>
        <Text style={styles.signedOutTitle}>Not Signed In</Text>
        <Text style={styles.signedOutSub}>Sign in to access your account and activity</Text>
        <TouchableOpacity style={styles.signInBtn}
          onPress={() => { navigation.navigate('Need'); Alert.alert('Sign in', 'Open the Account tab again to sign in.'); }}>
          <Text style={styles.signInBtnText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Animated.ScrollView
      style={[styles.scroll, { opacity: fade }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center' } : null}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Image
          source={require('/Users/joshhurst/Desktop/Needs/assets/NeedsLogo.png')}
          style={styles.logo} resizeMode="contain"
        />
      </View>

      {/* ── PROFILE CARD ─────────────────────────────────────────────── */}
      <View style={styles.profileCard}>

        {/* Left: avatar + info */}
        <View style={styles.profileLeft}>
          <View style={styles.avatarWrap}>
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
              : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{avatarInitials}</Text>
                </View>
              )
            }
            <View style={styles.verifiedDot}>
              <Ionicons name="checkmark-circle" size={IS_WEB ? 26 : 20} color="#2563EB" />
            </View>
          </View>
          <Text style={styles.profileName}>{fullName}</Text>
          <Text style={styles.profileSub}>Member since {memberSince}</Text>
          {!!locationText && (
            <View style={styles.profileLocation}>
              <Ionicons name="location-outline" size={12} color="#64748B" />
              <Text style={styles.profileLocationText}>{locationText}</Text>
            </View>
          )}
        </View>

        {/* Right: NeedCoin */}
        <View style={styles.coinWrap}>
          <Image
            source={require('/Users/joshhurst/Desktop/Needs/assets/NeedCoin.png')}
            style={styles.coinImage}
            resizeMode="contain"
          />
          <Text style={styles.coinLabel}>NeedCoins</Text>
          <Text style={styles.coinAmount}>{userDetails?.needCoins ?? 0}</Text>
        </View>

      </View>

      {/* ── RATINGS CARD ─────────────────────────────────────────────── */}
      <View style={styles.ratingsCard}>
        {/* Overall header */}
        <View style={styles.overallRow}>
          <View>
            <Text style={styles.overallLabel}>Overall Rating</Text>
            <View style={styles.overallNumRow}>
              <Text style={styles.overallNum}>{overall}</Text>
              <View style={{ marginLeft: 8, marginTop: 4 }}>
                <StarRow rating={parseFloat(overall)} size={IS_WEB ? 21 : 16} />
                <Text style={styles.overallExp}>Based on {experiences} experiences</Text>
              </View>
            </View>
          </View>
          <View style={styles.overallScoreBadge}>
            <Text style={styles.overallScoreText}>{overall}</Text>
            <Text style={styles.overallScoreMax}>/5</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Rating rows — full width */}
        <RatingRow
          icon="shield-checkmark-outline"
          label="Reliability"
          value={reliability.toFixed(1)}
          color="#2563EB"
          weight="30%"
        />
        <RatingRow
          icon="chatbubble-ellipses-outline"
          label="Responsiveness"
          value={responsiveness.toFixed(1)}
          color="#0EA5E9"
          weight="30%"
        />
        <RatingRow
          icon="people-outline"
          label="Recommended"
          value={recommended.toFixed(1)}
          color="#10B981"
          weight="40%"
        />
      </View>

      {/* ── MENU ─────────────────────────────────────────────────────── */}
      <View style={styles.menuWrap}>

        <Section icon="bookmark" title="Saved" color="#8B5CF6">
          <MenuItem icon="list-outline"          label="Saved Requests"    />
          <MenuItem icon="construct-outline"     label="Saved Services"    />
          <MenuItem icon="restaurant-outline"    label="Saved Restaurants" />
        </Section>

        <Section icon="wallet" title="Payment" color="#10B981">
          <MenuItem icon="receipt-outline"       label="Transactions"      />
          <MenuItem icon="cash-outline"          label="Payouts"           />
          <MenuItem icon="card-outline"          label="Payment Methods"   />
          <MenuItem icon="diamond-outline"       label="NeedCoins Balance" badge="💎" />
        </Section>

        {isBusiness && ctx.businessType === 'restaurant' && (
          <Section icon="pricetag" title="Rewards" color="#C2710C">
            <MenuItem
              icon="footsteps-outline"
              label="Visit Rewards"
              onPress={() => setVisitModal(true)}
            />
            <MenuItem
              icon="ticket-outline"
              label="Redeem Offer & History"
              onPress={() => setOffersModal(true)}
            />
          </Section>
        )}

        {isBusiness && businessDoc?.slug && (() => {
          const moduleUrl = `https://www.needs-module.com/m/${businessDoc.slug}`;
          return (
            <View style={styles.moduleLinkCard}>
              <View style={styles.moduleLinkHeader}>
                <View style={styles.moduleLinkIconWrap}>
                  <Ionicons name="globe-outline" size={18} color="#2563EB" />
                </View>
                <Text style={styles.moduleLinkTitle}>Your Module Link</Text>
              </View>
              <Text style={styles.moduleLinkDesc}>
                Share this link so anyone can find your profile on the web — no app needed.
              </Text>
              <View style={styles.moduleLinkUrlRow}>
                <Text style={styles.moduleLinkUrl} numberOfLines={1} ellipsizeMode="middle">
                  {moduleUrl}
                </Text>
              </View>
              <View style={styles.moduleLinkActions}>
                <TouchableOpacity
                  style={styles.moduleLinkBtn}
                  onPress={() => {
                    Clipboard.setString(moduleUrl);
                    Alert.alert('Copied!', 'Your module link has been copied to clipboard.');
                  }}
                >
                  <Ionicons name="copy-outline" size={16} color="#2563EB" />
                  <Text style={styles.moduleLinkBtnText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.moduleLinkBtn}
                  onPress={() => Share.share({ message: moduleUrl, url: moduleUrl, title: businessDoc.name || businessDoc.businessName || 'My Needs Module' })}
                >
                  <Ionicons name="share-outline" size={16} color="#2563EB" />
                  <Text style={styles.moduleLinkBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* ── Google Calendar (service providers only) ──────────────── */}
        {isService && (
          <Section icon="calendar" title="Integrations" color="#059669">
            <View style={styles.calendarRow}>
              <View style={styles.calendarLeft}>
                <View style={[styles.calendarIcon, calendarConnected && styles.calendarIconOn]}>
                  <Ionicons name="logo-google" size={IS_WEB ? 22 : 17} color={calendarConnected ? '#fff' : '#059669'} />
                </View>
                <View>
                  <Text style={styles.calendarLabel}>Google Calendar</Text>
                  <Text style={styles.calendarSub}>
                    {calendarConnected ? 'Connected — appointments sync automatically' : 'Sync confirmed appointments to your calendar'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.calendarBtn, calendarConnected && styles.calendarBtnOff]}
                onPress={calendarConnected ? handleDisconnectCalendar : handleConnectCalendar}
                disabled={calendarLoading}
              >
                <Text style={[styles.calendarBtnText, calendarConnected && styles.calendarBtnTextOff]}>
                  {calendarLoading ? '…' : calendarConnected ? 'Disconnect' : 'Connect'}
                </Text>
              </TouchableOpacity>
            </View>
          </Section>
        )}

        <Section icon="person" title="Profile" color="#475569">
          <MenuItem icon="person-outline"   label="View / Edit Profile" onPress={handleEditProfile} />
          <MenuItem icon="log-out-outline"  label="Sign Out"     onPress={handleLogout} destructive />
        </Section>

      </View>

      <View style={{ height: 50 }} />

      <BusinessOffersModal
        visible={offersModalVisible}
        onClose={() => setOffersModal(false)}
        restaurantDoc={businessDoc}
      />
      <BusinessVisitModal
        visible={visitModalVisible}
        onClose={() => setVisitModal(false)}
        restaurantDoc={businessDoc}
      />
      </View>
    </Animated.ScrollView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles — bold, professional, trust-centered
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: IS_WEB ? '#F8F8F8' : '#fff' },
  content:  { paddingBottom: IS_WEB ? 26 : 20 },

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: IS_WEB ? 26 : 20,
    paddingTop: IS_WEB ? WEB_HEADER_HEIGHT + 21 : 16,
    paddingBottom: IS_WEB ? 10 : 8,
    backgroundColor: '#fff',
    position: 'relative',
  },
  logo:      { width: IS_WEB ? 184 : 141, height: IS_WEB ? 64 : 49 },
  notifWrap: { position: 'absolute', right: IS_WEB ? 23 : 18, padding: IS_WEB ? 8 : 6 },
  notifDot: {
    position: 'absolute', top: 5, right: 5,
    width: IS_WEB ? 12 : 9, height: IS_WEB ? 12 : 9, borderRadius: IS_WEB ? 6 : 5,
    backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#EEF2F9',
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: IS_WEB ? 26 : 20,
    paddingHorizontal: IS_WEB ? 26 : 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: IS_WEB ? 5 : 4,
  },
  profileLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  avatarWrap:    { position: 'relative', marginBottom: IS_WEB ? 13 : 10 },
  avatar:        { width: IS_WEB ? 147 : 113, height: IS_WEB ? 147 : 113, borderRadius: IS_WEB ? 74 : 57, borderWidth: 3, borderColor: '#2563EB' },
  avatarFallback:{ backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  avatarInitials:{ fontSize: IS_WEB ? 49 : 38, fontWeight: '900', color: '#2563EB' },
  verifiedDot:   { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#fff', borderRadius: 12 },
  photoPlusBadge: {
    position: 'absolute', top: 0, right: -2,
    width: IS_WEB ? 29 : 22, height: IS_WEB ? 29 : 22, borderRadius: IS_WEB ? 15 : 11,
    backgroundColor: '#2563EB',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  profileName: { fontSize: IS_WEB ? 23 : 18, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3, marginBottom: IS_WEB ? 4 : 3 },
  profileSub:  { fontSize: IS_WEB ? 14 : 11, color: '#64748B', fontWeight: '500', marginBottom: IS_WEB ? 7 : 5 },
  profileLocation: { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 4 : 3, marginBottom: 0 },
  profileLocationText: { fontSize: IS_WEB ? 16 : 12, color: '#64748B' },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6,
    paddingHorizontal: IS_WEB ? 26 : 20, paddingVertical: IS_WEB ? 12 : 9,
    backgroundColor: '#EFF6FF',
    borderRadius: IS_WEB ? 16 : 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: IS_WEB ? 17 : 13, color: '#2563EB', fontWeight: '700' },

  // Ratings card
  ratingsCard: {
    backgroundColor: '#fff',
    paddingHorizontal: IS_WEB ? 26 : 20,
    paddingBottom: IS_WEB ? 21 : 16,
  },
  overallRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: IS_WEB ? 18 : 14,
  },
  overallLabel:  { fontSize: IS_WEB ? 14 : 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: IS_WEB ? 5 : 4 },
  overallNumRow: { flexDirection: 'row', alignItems: 'flex-start' },
  overallNum:    { fontSize: IS_WEB ? 55 : 42, fontWeight: '900', color: '#0F172A', lineHeight: IS_WEB ? 60 : 46 },
  overallExp:    { fontSize: IS_WEB ? 13 : 10, color: '#94A3B8', marginTop: IS_WEB ? 5 : 4 },
  overallScoreBadge: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#EFF6FF', borderRadius: IS_WEB ? 18 : 14,
    paddingHorizontal: IS_WEB ? 18 : 14, paddingVertical: IS_WEB ? 13 : 10,
    borderWidth: 1.5, borderColor: '#BFDBFE',
  },
  overallScoreText: { fontSize: IS_WEB ? 36 : 28, fontWeight: '900', color: '#2563EB' },
  overallScoreMax:  { fontSize: IS_WEB ? 18 : 14, color: '#93C5FD', fontWeight: '700', marginBottom: IS_WEB ? 4 : 3, marginLeft: IS_WEB ? 3 : 2 },

  cardDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: IS_WEB ? 16 : 12 },

  // Rating rows
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: IS_WEB ? 13 : 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  ratingRowLeft: {
    flexDirection: 'row', alignItems: 'center',
    width: IS_WEB ? 189 : 145,
  },
  ratingRowIcon: {
    width: IS_WEB ? 36 : 28, height: IS_WEB ? 36 : 28, borderRadius: IS_WEB ? 10 : 8,
    justifyContent: 'center', alignItems: 'center', marginRight: IS_WEB ? 10 : 8,
  },
  ratingRowLabel:  { fontSize: IS_WEB ? 17 : 13, fontWeight: '700', color: '#1E293B', marginRight: IS_WEB ? 5 : 4 },
  ratingRowWeight: { fontSize: IS_WEB ? 13 : 10, color: '#CBD5E1', fontWeight: '600' },
  ratingRowRight:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 10 : 8 },
  ratingBar: {
    flex: 1, height: IS_WEB ? 8 : 6, backgroundColor: '#F1F5F9',
    borderRadius: 3, overflow: 'hidden',
  },
  ratingBarFill: { height: '100%', borderRadius: 3 },
  ratingRowVal:  { fontSize: IS_WEB ? 17 : 13, fontWeight: '800', width: IS_WEB ? 36 : 28, textAlign: 'right' },

  // Menu
  menuWrap: { paddingHorizontal: IS_WEB ? 21 : 16, gap: IS_WEB ? 13 : 10 },

  // Module Link card
  moduleLinkCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: IS_WEB ? 18 : 14,
    padding: IS_WEB ? 20 : 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  moduleLinkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  moduleLinkIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleLinkTitle: {
    fontSize: IS_WEB ? 15 : 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  moduleLinkDesc: {
    fontSize: IS_WEB ? 13 : 12,
    color: '#3B82F6',
    lineHeight: 18,
    marginBottom: 10,
  },
  moduleLinkUrlRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  moduleLinkUrl: {
    fontSize: IS_WEB ? 13 : 12,
    color: '#1E40AF',
    fontFamily: 'monospace',
  },
  moduleLinkActions: {
    flexDirection: 'row',
    gap: 10,
  },
  moduleLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
  },
  moduleLinkBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: IS_WEB ? 14 : 13,
  },

  // Google Calendar integration row
  calendarRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_WEB ? 18 : 14, paddingVertical: IS_WEB ? 16 : 13, gap: 10,
  },
  calendarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 14 : 11 },
  calendarIcon: {
    width: IS_WEB ? 42 : 34, height: IS_WEB ? 42 : 34, borderRadius: IS_WEB ? 21 : 17,
    backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center',
  },
  calendarIconOn: { backgroundColor: '#059669' },
  calendarLabel: { fontSize: IS_WEB ? 16 : 14, fontWeight: '700', color: '#0F172A' },
  calendarSub:   { fontSize: IS_WEB ? 13 : 11, color: '#64748B', marginTop: 2, flexShrink: 1 },
  calendarBtn: {
    backgroundColor: '#059669', borderRadius: IS_WEB ? 10 : 8,
    paddingHorizontal: IS_WEB ? 16 : 13, paddingVertical: IS_WEB ? 8 : 7,
  },
  calendarBtnOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E2E8F0' },
  calendarBtnText:    { fontSize: IS_WEB ? 14 : 12, fontWeight: '700', color: '#fff' },
  calendarBtnTextOff: { color: '#94A3B8' },

  section: {
    backgroundColor: '#fff',
    borderRadius: IS_WEB ? 18 : 14,
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 20 : 15, gap: IS_WEB ? 16 : 12,
  },
  sectionIcon:  { width: IS_WEB ? 39 : 30, height: IS_WEB ? 39 : 30, borderRadius: IS_WEB ? 12 : 9, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { flex: 1, fontSize: IS_WEB ? 20 : 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  sectionBody:  { borderTopWidth: 1, borderTopColor: '#F8FAFC' },

  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 17 : 13,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: IS_WEB ? 16 : 12,
  },
  menuIconWrap: { width: IS_WEB ? 39 : 30, height: IS_WEB ? 39 : 30, borderRadius: IS_WEB ? 10 : 8, justifyContent: 'center', alignItems: 'center' },
  menuLabel:    { flex: 1, fontSize: IS_WEB ? 18 : 14, color: '#334155', fontWeight: '600' },
  badge: {
    backgroundColor: '#EFF6FF', borderRadius: IS_WEB ? 13 : 10,
    paddingHorizontal: IS_WEB ? 10 : 8, paddingVertical: IS_WEB ? 4 : 3, marginRight: IS_WEB ? 5 : 4,
  },
  badgeText: { fontSize: IS_WEB ? 14 : 11, color: '#2563EB', fontWeight: '800' },

  // Divider inside sections
  dividerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 10 : 8, gap: IS_WEB ? 10 : 8 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: '#F1F5F9' },
  dividerLabel: { fontSize: IS_WEB ? 13 : 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },

  // NeedCoin
  coinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0.8,
  },
  coinImage: {
    width: IS_WEB ? 143 : 110,
    height: IS_WEB ? 143 : 110,
    marginBottom: IS_WEB ? 8 : 6,
  },
  coinLabel: {
    fontSize: IS_WEB ? 13 : 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: IS_WEB ? 3 : 2,
  },
  coinAmount: {
    fontSize: IS_WEB ? 34 : 26,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: -0.5,
  },

  // Signed out
  signedOut:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEF2F9', padding: IS_WEB ? 52 : 40, maxWidth: IS_WEB ? 960 : undefined, width: IS_WEB ? '100%' : undefined, alignSelf: IS_WEB ? 'center' : undefined },
  signedOutIconWrap:{ width: IS_WEB ? 104 : 80, height: IS_WEB ? 104 : 80, borderRadius: IS_WEB ? 52 : 40, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: IS_WEB ? 21 : 16 },
  signedOutTitle:  { fontSize: IS_WEB ? 29 : 22, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  signedOutSub:    { fontSize: IS_WEB ? 18 : 14, color: '#64748B', marginTop: IS_WEB ? 10 : 8, marginBottom: IS_WEB ? 36 : 28, textAlign: 'center' },
  signInBtn:       { backgroundColor: '#2563EB', paddingHorizontal: IS_WEB ? 42 : 32, paddingVertical: IS_WEB ? 20 : 15, borderRadius: IS_WEB ? 18 : 14 },
  signInBtnText:   { color: '#fff', fontSize: IS_WEB ? 20 : 15, fontWeight: '800', letterSpacing: -0.2 },
});

export default AccountTabContent;
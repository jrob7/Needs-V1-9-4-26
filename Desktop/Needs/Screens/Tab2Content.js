// Screens/Tab2Content.js
import React, { useEffect, useState, useRef, useCallback, useContext } from 'react';
import { PanResponder } from 'react-native';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Dimensions,
  Modal,
  SafeAreaView,
  Animated,
  Alert,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { VideoView, useVideoPlayer } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { UserContext } from '../server/CurrentUser';
import { useAuthModal } from './AuthModalContext';
import { RestaurantDetail } from './MatchResults';
import { NODE_API as API, FLASK_API } from '../config';
import { webContainer, IS_WEB, WEB_HEADER_HEIGHT, WEB_MAX_WIDTH } from '../webLayout';
import NeedsMapView from './NeedsMapView';
const windowH = Dimensions.get('window').height;
const windowW = Dimensions.get('window').width;
const PAGE_W = windowW - 20;

// 🧠 Track all active videos
const activeVideos = new Set();

// Persists for the app session — tracks every restaurant/service name already
// shown in broad matches so the same result never appears twice across needs
// NOTE: shownBroadMatchIds used to be module-level, which caused names from
// one need's broad matches to permanently pollute the exclude list for ALL
// future needs in the same session. It now lives inside HorizontalNeedRow
// as a useRef so it resets per need card. See shownBroadMatchIdsRef below.

// Module-level cache — survives Tab2Content unmount/remount. Keyed by userId
// so it auto-invalidates on account switch.
let _tab2Cache = {
  userId: null, needs: [], fundraisers: [], latestNeedId: null,
  // Per-need pill UI state keyed by need._id
  pillState: {},
};

// Call this from Tab1Content after submitting a new need so Tab2 refreshes.
export const invalidateTab2Cache = () => { _tab2Cache = { ..._tab2Cache, needs: [], pillState: {} }; };

// HorizontalNeedRow calls these to persist pill state across remounts
const savePillState = (needId, state) => {
  if (!needId) return;
  const existing = _tab2Cache.pillState[needId] || {};
  _tab2Cache.pillState = { ..._tab2Cache.pillState, [needId]: { ...existing, ...state } };
};
const getPillState = (needId) => needId ? (_tab2Cache.pillState[needId] || {}) : {};

// Short summary for card display — full text shown in SingleItemView
const toTitle = (text, maxWords = 7) => {
  if (!text) return '';
  const firstSentence = text.split(/[.!?]/)[0].trim();
  const words = firstSentence.split(' ').filter(Boolean);
  if (words.length <= maxWords) return firstSentence;
  return words.slice(0, maxWords).join(' ') + '…';
};


// ── BlueSpinner ───────────────────────────────────────────────────────────────
function BlueSpinner({ size = 100 }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 1000, useNativeDriver: !IS_WEB })
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ width: size, height: size, alignSelf: 'center', transform: [{ rotate: spin }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {Array.from({ length: 12 }).map((_, i) => (
          <Rect key={i} x={45} y={5} width={10} height={25} rx={5}
            fill={`rgba(0,102,255,${1 - i * 0.07})`}
            transform={`rotate(${i * 30} 50 50)`} />
        ))}
      </Svg>
    </Animated.View>
  );
}

export default function NeedInquiryView() {
  const navigation    = useNavigation();
  const route         = useRoute();
  const { userId: currentUserId } = React.useContext(UserContext);
  const [needs, setNeeds] = useState([]);
  const scrollToNeedId    = route.params?.scrollToNeedId || null;
  const openMatchModal    = route.params?.openMatchModal  || null;
  const listScrollRef     = useRef(null);
  const [latestNeedId, setLatestNeedId] = useState(null);
  const [fundraisers, setFundraisers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [loading, setLoading]   = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardLayouts = useRef({});
  const isActiveScreen = useRef(true);

  useEffect(() => {
    (async () => {
      await setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
    })();
  }, []);

  // When arriving from a match notification, scroll to that need card
  useEffect(() => {
    if (!scrollToNeedId || needs.length === 0) return;
    const idx = needs.findIndex(n => String(n._id) === String(scrollToNeedId));
    if (idx === -1) { console.log('⚠️ scrollToNeedId not found:', scrollToNeedId); return; }
    const layout = cardLayouts.current[idx];
    if (layout && listScrollRef.current) {
      console.log('📍 Scrolling to need idx:', idx, 'y:', layout.y);
      listScrollRef.current.scrollTo({ y: layout.y, animated: true });
    }
  }, [scrollToNeedId, needs]);

  // Load data once on mount and again whenever the logged-in user changes.
  // We deliberately do NOT reload on every focus — returning from SingleItemView
  // or any other screen is a simple back-navigation with no re-fetch.
  useEffect(() => {
    loadAll();
  }, [currentUserId]);

  useFocusEffect(
    useCallback(() => {
      console.log('🟢 Tab2Content focused');
      isActiveScreen.current = true;
      // If Tab1 invalidated the cache (new need submitted), reload now
      if (_tab2Cache.needs.length === 0) loadAll();
      return () => {
        console.log('🔴 Tab2Content unfocused');
        isActiveScreen.current = false;
        stopAllVideos();
        setActiveIndex(-1);
      };
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  );

  const loadAll = async () => {
    console.log('🔄 loadAll started');

    // Cache hit — same user, data already loaded. Restore instantly with no
    // spinner. This covers remounts caused by the native stack detaching the
    // screen when SingleItemView is pushed, so the back button feels instant.
    if (_tab2Cache.userId === currentUserId && _tab2Cache.needs.length > 0) {
      console.log('⚡ Tab2 cache hit — skipping network fetch');
      setNeeds(_tab2Cache.needs);
      setFundraisers(_tab2Cache.fundraisers);
      setLatestNeedId(_tab2Cache.latestNeedId);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [needsRes, frRes] = await Promise.all([
        fetch(`${API}/createNeedRequest`),
        fetch(`${API}/fundraisers`),
      ]);
      const needsJson = await needsRes.json();
      const frJson    = await frRes.json();
      console.log('📦 Needs fetched:', needsJson?.length, '| Fundraisers:', frJson?.length);

      const latestFromUser = (needsJson || []).find(n => n.userId === currentUserId);
      const latestId = latestFromUser?._id || null;
      if (latestId) {
        setLatestNeedId(latestId);
        console.log('🎯 Latest need set:', latestId, latestFromUser.searchText);
      }

      const hydratedNeeds = await Promise.all(
        (needsJson || []).map(async (n) => {
          let enriched = { ...n };
          try {
            if (n.userId) {
              const uRes = await fetch(`${API}/getUserDetails?userId=${n.userId}`);
              const u = await uRes.json();
              enriched.firstName = u?.firstName || '';
              enriched.lastName  = u?.lastName  || '';
              const rawPic =
                u?.profilePicture || u?.profileImageUrl || u?.profileImage ||
                u?.image || (Array.isArray(u?.images) ? u.images[0] : null) || null;
              enriched.profilePicture = rawPic
                ? (rawPic.startsWith('http') ? rawPic : `${API}/uploads/${rawPic}`)
                : null;
              enriched.creatorId = n.userId;
            } else {
              enriched.firstName = 'Unknown';
              enriched.lastName  = '';
              enriched.profilePicture = null;
              enriched.creatorId = null;
            }
          } catch (err) {
            enriched.firstName = 'Unknown';
          }
          return enriched;
        })
      );

      // Save to module-level cache so the next remount is instant
      _tab2Cache = { userId: currentUserId, needs: hydratedNeeds, fundraisers: frJson, latestNeedId: latestId, pillState: _tab2Cache.pillState || {} };

      setNeeds(hydratedNeeds || []);
      setFundraisers(frJson || []);
      if (latestId) setLatestNeedId(latestId);
    } catch (e) {
      console.log('loadAll error', e);
    } finally {
      if (IS_WEB) {
        // On web, wait two paint cycles so content is visible before hiding the spinner
        requestAnimationFrame(() => requestAnimationFrame(() => setLoading(false)));
      } else {
        setLoading(false);
      }
    }
  };

  const filteredNeeds = needs.filter(n =>
    (n.searchText || '').toLowerCase().includes(searchText.toLowerCase())
  );
  const filteredFr = fundraisers.filter(f =>
    (f.title || '').toLowerCase().includes(searchText.toLowerCase())
  );
  const allItems = [
    ...filteredFr.map(f => ({ ...f, kind: 'fundraiser' })),
    ...filteredNeeds.map(n => ({ ...n, kind: 'need' })),
  ];
  console.log('📋 allItems:', allItems.length,
    '| needs:', filteredNeeds.length,
    '| fundraisers:', filteredFr.length);

  const stopAllVideos = () => {
    for (let player of activeVideos) {
      try { player.pause(); player.muted = true; } catch {}
    }
    activeVideos.clear();
  };

  const openNeed = async (item) => {
    stopAllVideos();
    isActiveScreen.current = false;
    setActiveIndex(-1);
    navigation.navigate('SingleItemView', { item, fromNeedInquiry: true });
  };

  const openFundraiser = async (item) => {
    stopAllVideos();
    isActiveScreen.current = false;
    setActiveIndex(-1);
    let createdByName = '';
    try {
      if (item.createdBy) {
        const u = await (await fetch(`${API}/getUserDetails?userId=${item.createdBy}`)).json();
        createdByName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.firstName || '';
      }
    } catch {}
    navigation.navigate('FundraiserDetail', { fundraiser: { ...item, createdByName } });
  };

  const getBestMedia = (item) => {
    console.log('🖼️ [getBestMedia] media.uri:', item?.media?.uri?.slice(0, 60), '| images[0]:', String(item?.images?.[0] || '').slice(0, 60));
    // skip file:// and non-http URIs (iOS simulator local paths can't load on web)
    if (item?.media?.uri && /^(https?:|data:)/i.test(item.media.uri)) {
      console.log('🖼️ [getBestMedia] → using media.uri (http/data)');
      return { type: item.media.type || guessType(item.media.uri), uri: item.media.uri };
    }
    if (item?.media?.uri) console.log('🖼️ [getBestMedia] skipping media.uri (not http/data):', item.media.uri?.slice(0, 60));
    const img0 = Array.isArray(item?.images) ? item.images[0] : null;
    if (!img0 || typeof img0 !== 'string') { console.log('🖼️ [getBestMedia] → null (no images[])'); return null; }
    const v = img0.trim();
    if (/^https?:\/\//i.test(v)) return { type: guessType(v), uri: v };
    if (/^data:image\/[a-zA-Z]+;base64,/.test(v)) return { type: 'image', uri: v };
    if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 100)
      return { type: 'image', uri: `data:image/png;base64,${v}` };
    // bare local filename only — no slashes/colons so file:// and paths are excluded
    if (/\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i.test(v) && !v.includes('/') && !v.includes(':'))
      return { type: guessType(v), uri: `${API}/uploads/${v}` };
    console.log('🖼️ [getBestMedia] → null (images[0] not usable):', v.slice(0, 60));
    return null;
  };
  const guessType = (uri) => uri?.toLowerCase()?.endsWith('.mp4') ? 'video' : 'image';

  const updateActiveFromScroll = (scrollY) => {
    if (!isActiveScreen.current) return;
    let bestIdx = null, maxVisible = 0;
    Object.entries(cardLayouts.current).forEach(([idx, { y, height }]) => {
      const top = y - scrollY, bottom = top + height;
      const visible = Math.max(0, Math.min(bottom, windowH) - Math.max(top, 0));
      if (visible > maxVisible) { maxVisible = visible; bestIdx = Number(idx); }
    });
    if (bestIdx !== null && bestIdx !== activeIndex) setActiveIndex(bestIdx);
  };

  useEffect(() => {
    const timer = setTimeout(() => updateActiveFromScroll(0), 800);
    return () => clearTimeout(timer);
  }, []);

  // When arriving from a match notification, scroll to that specific need card
  useEffect(() => {
    if (!scrollToNeedId || needs.length === 0) return;
    const needIdx = needs.findIndex(n => String(n._id) === String(scrollToNeedId));
    if (needIdx === -1) { console.log('⚠️ scrollToNeedId not found:', scrollToNeedId); return; }
    // Account for fundraisers at top of allItems
    const itemIdx = filteredFr.length + needIdx;
    const layout  = cardLayouts.current[itemIdx];
    if (layout && listScrollRef.current) {
      console.log('📍 Scrolling to need idx:', itemIdx, '| y:', layout.y);
      listScrollRef.current.scrollTo({ y: layout.y, animated: true });
    }
  }, [scrollToNeedId, needs]);

  const region = {
    latitude: 33.7701, longitude: -118.1937,
    latitudeDelta: 0.1, longitudeDelta: 0.1,
  };

  return (
    <>
    <View style={styles.container}>
      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center', alignItems: 'center',
          backgroundColor: '#F7F7F7', zIndex: 999 }}>
          <BlueSpinner size={100} />
        </View>
      )}
      <View style={[{ flex: 1, paddingTop: IS_WEB ? WEB_HEADER_HEIGHT : 0 }, webContainer]}>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleActive]}
          onPress={() => setViewMode('list')}>
          <Ionicons name={viewMode === 'list' ? 'list' : 'list-outline'} size={20}
            color={viewMode === 'list' ? '#fff' : '#007bff'} style={{ marginRight: 6 }} />
          <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'map' && styles.toggleActive]}
          onPress={() => setViewMode('map')}>
          <Ionicons name={viewMode === 'map' ? 'map' : 'map-outline'} size={20}
            color={viewMode === 'map' ? '#fff' : '#007bff'} style={{ marginRight: 6 }} />
          <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>Map</Text>
        </TouchableOpacity>
      </View>

      <TextInput style={styles.searchBar} placeholder="Search Needs & Fundraisers…"
        value={searchText} onChangeText={setSearchText} />

      {viewMode === 'list' ? (
        <>
          <ScrollView ref={listScrollRef} contentContainerStyle={styles.list} scrollEventThrottle={16}
            onScroll={(e) => updateActiveFromScroll(e.nativeEvent.contentOffset.y)}>
            {allItems.map((item, idx) => {
              const isFr = item.kind === 'fundraiser';
              const media = getBestMedia(item);
              console.log(`🃏 Rendering idx=${idx} kind=${item.kind} title=${item.searchText || item.title}`);
              return isFr ? (
                <Card key={item._id || idx} badgeLabel="Fundraiser" badgeColor="#0A84FF"
                  title={item.title || 'Untitled Fundraiser'}
                  metaRight={item.createdByName || item.firstName ? `by ${item.createdByName || item.firstName}` : ''}
                  infoLine={item.targetAmount != null ? `Goal: $${item.targetAmount}` : ''}
                  media={media} compact onPress={() => openFundraiser(item)}
                  isActive={idx === activeIndex}
                  onLayout={(e) => { const { y, height } = e.nativeEvent.layout; cardLayouts.current[idx] = { y, height }; }} />
              ) : (
                <HorizontalNeedRow key={item._id || idx} need={item} media={media}
                  idx={idx} isActive={idx === activeIndex}
                  isSessionNeed={item._id === latestNeedId}
                  autoOpenModal={openMatchModal && String(item._id) === String(openMatchModal)}
                  onOpenNeed={() => openNeed(item)}
                  onViewCreator={() => {
                    if (!item.creatorId) return;
                    navigation.navigate('ProfileView', { userId: item.creatorId, readOnly: true });
                  }}
                  onLayout={(e) => { const { y, height } = e.nativeEvent.layout; cardLayouts.current[idx] = { y, height }; }} />
              );
            })}
            <View style={{ height: 96 }} />
          </ScrollView>
          {/* <TouchableOpacity style={styles.fab} activeOpacity={0.9}
            onPress={() => navigation.navigate('UploadTypeSelector')}>
            <Text style={styles.fabText}>+ Upload</Text>
          </TouchableOpacity> */}
        </>
      ) : (
        <NeedsMapView
          region={region}
          filteredNeeds={filteredNeeds}
          filteredFr={filteredFr}
          openNeed={openNeed}
          openFundraiser={openFundraiser}
          getBestMedia={getBestMedia}
        />
      )}
      </View>{/* end webContainer */}
    </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HorizontalNeedRow
// ─────────────────────────────────────────────────────────────────────────────
function HorizontalNeedRow({ need, media, idx, isActive, isSessionNeed, autoOpenModal, onOpenNeed, onViewCreator, onLayout }) {
  const [matches, setMatches]           = useState([]);
  const [loaded, setLoaded]             = useState(false);
  const cached = getPillState(need?._id);
  const [broadMatches, setBroadMatches] = useState(() => cached.broadMatches || []);
  const [showSwipeHint, setShowSwipeHint] = useState(() => !!cached.showSwipeHint);
  const [modalVisible, setModalVisible] = useState(false);
  const [pillOpened, setPillOpened] = useState(() => !!cached.pillOpened);

  // Write pill state back to module cache so it survives remounts
  useEffect(() => { savePillState(need?._id, { broadMatches }); }, [broadMatches]);
  useEffect(() => { savePillState(need?._id, { showSwipeHint }); }, [showSwipeHint]);
  useEffect(() => { savePillState(need?._id, { pillOpened }); }, [pillOpened]);

  // Per-card set of already-surfaced broad match names — resets when need._id
  // changes so one need's matches never bleed into another need's exclude list.
  const shownBroadMatchIdsRef = useRef(new Set());

  // Blink animation — pill pulses until the user taps it, then stays solid
  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!showSwipeHint && matches.length === 0) return;
    if (pillOpened) { blinkAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.25, duration: 500, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showSwipeHint, matches.length, pillOpened]);

  // Track previous need ID — used to distinguish a genuine need CHANGE from
  // a component remount with the same need (which happens when SingleItemView
  // is popped and Tab2Content remounts). Only reset pill/match state when the
  // ID actually changes, not on every fresh mount.
  const prevNeedIdRef = useRef(need?._id);

  useEffect(() => {
    const prevId = prevNeedIdRef.current;
    prevNeedIdRef.current = need?._id;

    if (prevId === need?._id) {
      // Same need, just a remount — skip the reset so cached pill state survives.
      return;
    }

    setMatches([]); setLoaded(false); setBroadMatches([]);
    setShowSwipeHint(false); setModalVisible(false); setPillOpened(false);
    shownBroadMatchIdsRef.current = new Set();
    console.log('🔄 HorizontalNeedRow changed:', need?.searchText);
  }, [need?._id]);

  // Auto-open modal when navigated from a match notification
  useEffect(() => {
    if (autoOpenModal && (broadMatches.length > 0 || matches.length > 0)) {
      console.log('🔔 Auto-opening matches modal from notification');
      setPillOpened(true);
      setModalVisible(true);
    }
  }, [autoOpenModal, broadMatches.length, matches.length]);

  // Existing item matches (silent background fetch)
  useEffect(() => {
    if (loaded) return;
    fetch(`${API}/searchUploadedItems?title=${encodeURIComponent(need.searchText || '')}&maxPrice=${need.bidprice}&urgency=${need.urgency || ''}`)
      .then(r => r.json())
      .then(data => { setMatches(Array.isArray(data) ? data : []); setLoaded(true); })
      .catch(() => { setMatches([]); setLoaded(true); });
  }, [loaded, need?.searchText, need?.bidprice, need?.urgency]);

  // Background broad match prefetch — fires after timer, shows pill, does NOT
  // change the need card at all. User taps/swipes pill to open the modal.
  useEffect(() => {
    // Older NeedRequests may not have needType stored — fall back to a quick
    // keyword check so their cards still get the broad match treatment.
    const rawType = need?.needType;
    const needType = rawType || (() => {
      const t = (need?.searchText || '').toLowerCase();
      const SERVICE_HINTS = ['plumber','plumbing','electrician','mechanic','repair','fix','install','service','handyman','cleaner','hvac','painter','mover','barber','salon','attorney','lawyer','tutor'];
      const FOOD_HINTS    = ['food','taco','restaurant','pizza','burger','eat','dinner','lunch','breakfast','sushi','tacos','coffee'];
      if (FOOD_HINTS.some(w => t.includes(w)))    return 'food';
      if (SERVICE_HINTS.some(w => t.includes(w))) return 'service';
      return 'item';
    })();
    // Don't restart the timer if matches are already showing — this prevents
    // the pill from reverting to blinking after returning from a detail view.
    const shouldFire = isSessionNeed && ['food', 'service'].includes(needType) && !showSwipeHint;
    console.log('⏱ Timer check:', need?.searchText?.slice(0, 20), '| fires:', shouldFire);
    if (!shouldFire) return;

    const timer = setTimeout(async () => {
      console.log('🔥 Prefetching matches for:', need?.searchText);
      try {
        const fromNeed    = Array.isArray(need.initialMatchNames) ? need.initialMatchNames : [];
        const fromSession = Array.from(shownBroadMatchIdsRef.current);
        const excludeNames = [...new Set([...fromNeed, ...fromSession])];

        const words = (need.searchText || '').trim().split(/\s+/).filter(Boolean);
        const broadQuery = words.length > 1 ? words.slice(1).join(' ') : need.searchText;

        console.log('📡 Prefetch query:', broadQuery, '| excluding:', excludeNames);

        const res = await fetch(`${FLASK_API}/ai/findMatches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: broadQuery, type: needType, needId: need._id, excludeNames }),
        });
        const data = await res.json();
        const allResults = data?.matches || [];

        // No fallback to an unfiltered re-query here — if nothing remains
        // after excluding what Tab1 already showed, the pill should simply
        // not appear rather than re-surfacing the same matches.
        const filtered = allResults.filter(m => {
          const key = (m.name || m.businessName || '').toLowerCase().trim();
          return key && !shownBroadMatchIdsRef.current.has(key);
        });

        filtered.forEach(m => {
          const key = (m.name || m.businessName || '').toLowerCase().trim();
          if (key) shownBroadMatchIdsRef.current.add(key);
        });

        console.log('✅ Prefetched:', filtered.length, 'matches');

        if (filtered.length > 0) {
          setBroadMatches(filtered);
          setShowSwipeHint(true);

          // Fire notification
          const matchNames = filtered.slice(0, 2)
            .map(m => m.name || m.businessName).filter(Boolean).join(', ');
          fetch(`${API}/createNotification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId:   need.userId,
              type:     'match',
              title:    '🍽️ Local matches found',
              body:     `${matchNames} match your request for "${need.searchText}"`,
              needId:   need._id,
              needText: need.searchText,
            }),
          })
          .then(r => r.json())
          .then(d => console.log('🔔 Notification created:', d._id || d.duplicate))
          .catch(e => console.log('⚠️ Notification create failed:', e));
        }
      } catch (e) { console.log('❌ prefetch error:', e); }
    }, 10 * 1000); // set to 3 * 60 * 1000 for production

    return () => clearTimeout(timer);
  }, [need?._id, isSessionNeed, showSwipeHint]);

  const hasMatches      = matches.length > 0;
  const hasBroadMatches = broadMatches.length > 0;
  const hasAnyMatches   = hasMatches || hasBroadMatches;
  const allMatchItems = (() => {
    const seen = new Set();
    return [...broadMatches.slice(0, 3), ...matches].filter(m => {
      const key = (m.name || m.businessName || m.title || '').toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  // On web: only show the need's own attached media — never fall back to match
  // images (business logos). getBestMedia already filters out file:// and blob:
  // URIs, so `media` here is either a valid http/data URI or null.
  const webMedia = media;

  // On web the pill lives inside the Card's topRow (not absolute) so it sits
  // in the text column and never overlaps the right-side image.
  const pillNode = (isSessionNeed && hasAnyMatches) ? (
    <TouchableOpacity
      onPress={() => { setPillOpened(true); setModalVisible(true); }}
      activeOpacity={0.85}
    >
      <Animated.View style={[
        hasMatches ? styles.matchPill : styles.swipeHintPill,
        { opacity: blinkAnim, position: 'relative', top: 0, right: 0 },
      ]}>
        <Text style={hasMatches ? styles.matchPillText : styles.swipeHintText}>
          {hasMatches
            ? `${matches.length} Match${matches.length !== 1 ? 'es' : ''}`
            : `${broadMatches.length} New Match${broadMatches.length !== 1 ? 'es' : ''} Swipe >>>`}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  ) : null;

  // Detect left swipe on the card to open the matches modal
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 40) {
          // Swiped right — open matches modal if there are any
          console.log('👉 Right swipe detected — opening matches modal');
          setPillOpened(true);
          setModalVisible(true);
        }
      },
    })
  ).current;

  return (
    <View style={{ width: '100%' }} onLayout={onLayout} {...(hasAnyMatches ? swipePan.panHandlers : {})}>
      {/* ── Need card with pill overlaid on top ── */}
      <View style={{ width: '100%', position: 'relative' }}>
        <Card
          badgeLabel="Need" badgeColor="#007bff"
          title={toTitle((need.searchText || '').replace(/\*\*/g, ''))}
          subtitle={need.urgency ? `When: ${(need.urgency).replace(/\*\*/g, '')}` : ''}
          infoLine={need.bidprice != null && need.bidprice !== 'N/A' && need.bidprice !== 0 ? `Offer: $${need.bidprice}` : ''}
          media={IS_WEB ? webMedia : media} isActive={isActive} onPress={onOpenNeed}
          creatorName={[need.firstName, need.lastName].filter(Boolean).join(' ') || null}
          creatorPic={need.profilePicture}
          onViewCreator={onViewCreator}
          rightSlot={IS_WEB ? pillNode : undefined}
        />

        {/* Matches pill — native only; on web it lives inside the Card topRow
            so it never overlaps the right-side image. */}
        {!IS_WEB && isSessionNeed && hasAnyMatches && (
          <TouchableOpacity
            style={{ position: 'absolute', top: 14, right: 16, zIndex: 30 }}
            onPress={() => {
              console.log('💡 Pill tapped — opening matches modal');
              setPillOpened(true);
              setModalVisible(true);
            }}
            activeOpacity={0.85}
          >
            <Animated.View style={[
              hasMatches ? styles.matchPill : styles.swipeHintPill,
              { opacity: blinkAnim, position: 'relative', top: 0, right: 0 },
            ]}>
              <Text style={hasMatches ? styles.matchPillText : styles.swipeHintText}>
                {hasMatches
                  ? `${matches.length} Match${matches.length !== 1 ? 'es' : ''}`
                  : `${broadMatches.length} New Match${broadMatches.length !== 1 ? 'es' : ''} Swipe >>>`}
              </Text>
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Matches Modal — swipeable full-screen overlay ── */}
      <MatchesModal
        visible={modalVisible}
        matches={allMatchItems}
        needType={need?.needType}
        needText={need?.searchText}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MatchesModal — full-screen horizontal swipeable modal
// ─────────────────────────────────────────────────────────────────────────────
function MatchesModal({ visible, matches, needType, needText, onClose }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const scrollRef = useRef(null);
  // Slide in from the left — starts off-screen left, animates to 0
  const slideX = useRef(new Animated.Value(-windowW)).current;

  useEffect(() => {
    if (visible) {
      setCurrentIdx(0);
      // Reset to off-screen left then animate in
      slideX.setValue(-windowW);
      Animated.spring(slideX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
      console.log('📋 MatchesModal opened with', matches.length, 'matches');
    }
  }, [visible]);

  const handleClose = () => {
    // Animate back out to the left before closing
    Animated.timing(slideX, {
      toValue: -windowW,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handlePageChange = (e) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / windowW);
    console.log('📄 Match page:', page, 'of', matches.length);
    setCurrentIdx(page);
    if (page >= matches.length) {
      console.log('↩️ Swiped past last match — closing modal');
      handleClose();
    }
  };

  if (!visible) return null;

  // ── Web: single-card view with side-arrow navigation ────────────────────
  if (IS_WEB) {
    const MODAL_MAX_W = 960;
    const isFirst = currentIdx === 0;
    const isLast  = currentIdx >= matches.length - 1;
    const arrowBtn = (dir, onPress, disabled) => (
      <TouchableOpacity
        onPress={onPress} disabled={disabled}
        style={{
          position: 'absolute', top: '40%', zIndex: 10,
          [dir]: -52,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: disabled ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.18)',
          justifyContent: 'center', alignItems: 'center',
          opacity: disabled ? 0.3 : 1,
        }}
      >
        <Ionicons name={dir === 'left' ? 'chevron-back' : 'chevron-forward'} size={22} color="#fff" />
      </TouchableOpacity>
    );

    return (
      <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={handleClose}>
        <View style={{ flex: 1, backgroundColor: '#F7F7F7' }}>
          <View style={{ maxWidth: MODAL_MAX_W, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' }}>
            <View style={[modalStyles.header, { paddingTop: WEB_HEADER_HEIGHT + 8 }]}>
              <TouchableOpacity onPress={handleClose} style={modalStyles.closeBtn}>
                <Ionicons name="chevron-down" size={24} color="#374151" />
              </TouchableOpacity>
              <Text style={modalStyles.headerTitle}>
                Local Matches ({currentIdx + 1}/{matches.length})
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={modalStyles.dotsRow}>
              {matches.map((_, i) => (
                <View key={i} style={[modalStyles.dot, i === currentIdx && modalStyles.dotActive]} />
              ))}
            </View>

            {/* Card + side arrows */}
            <View style={{ flex: 1, position: 'relative' }}>
              {arrowBtn('left',  () => setCurrentIdx(i => i - 1), isFirst)}
              {arrowBtn('right', () => { if (isLast) handleClose(); else setCurrentIdx(i => i + 1); }, false)}
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} key={currentIdx}>
                <BroadSummaryCard
                  match={matches[currentIdx]}
                  needType={needType}
                  onPress={() => setSelectedMatch(matches[currentIdx])}
                />
              </ScrollView>
            </View>
          </View>

          {selectedMatch && needType === 'food' ? (
            <Modal visible animationType="slide" transparent={false} onRequestClose={() => setSelectedMatch(null)}>
              <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
                <RestaurantDetail doc={selectedMatch} colors={MC.food} onClose={() => setSelectedMatch(null)} />
              </SafeAreaView>
            </Modal>
          ) : selectedMatch ? (
            <BroadDetailModal match={selectedMatch} needType={needType} needText={needText} onClose={() => setSelectedMatch(null)} />
          ) : null}
        </View>
      </Modal>
    );
  }

  // ── Native: full-screen horizontal swipeable carousel ────────────────────
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      onRequestClose={handleClose}
    >
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideX }] }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={handleClose} style={modalStyles.closeBtn}>
            <Ionicons name="chevron-down" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle}>
            Local Matches ({currentIdx + 1}/{matches.length})
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={modalStyles.dotsRow}>
          {matches.map((_, i) => (
            <View key={i} style={[modalStyles.dot, i === currentIdx && modalStyles.dotActive]} />
          ))}
          <View style={[modalStyles.dot, { opacity: 0.3 }]} />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={handlePageChange}
          onScrollEndDrag={handlePageChange}
          style={{ flex: 1 }}
        >
          {matches.map((match, i) => (
            <View key={i} style={{ width: windowW, flex: 1 }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <BroadSummaryCard match={match} needType={needType} onPress={() => setSelectedMatch(match)} />
              </ScrollView>
            </View>
          ))}
          <View style={{ width: windowW, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#D1D5DB" />
            <Text style={{ color: '#9CA3AF', fontSize: 16, marginTop: 12, fontWeight: '600' }}>That's all the matches!</Text>
            <TouchableOpacity style={modalStyles.doneBtn} onPress={handleClose}>
              <Text style={modalStyles.doneBtnText}>Back to Request</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {selectedMatch && needType === 'food' ? (
          <Modal visible animationType="slide" transparent={false} onRequestClose={() => setSelectedMatch(null)}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
              <RestaurantDetail doc={selectedMatch} colors={MC.food} onClose={() => setSelectedMatch(null)} />
            </SafeAreaView>
          </Modal>
        ) : selectedMatch ? (
          <BroadDetailModal match={selectedMatch} needType={needType} needText={needText} onClose={() => setSelectedMatch(null)} />
        ) : null}
      </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  closeBtn:    { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  dotsRow:     { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, gap: 6 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  dotActive:   { backgroundColor: '#10B981', width: 20 },
  doneBtn: {
    marginTop: 20, backgroundColor: '#10B981',
    paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14,
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});


// ── Helpers ───────────────────────────────────────────────────────────────────
const MC = {
  food:    { accent: '#D97706', bg: '#FFF8EE', badge: '#16A34A', star: '#F59E0B' },
  service: { accent: '#2563EB', bg: '#EFF6FF', badge: '#16A34A', star: '#F59E0B' },
};

const resolveMatchImg = (url, type) => {
  if (!url) return type === 'food'
    ? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80'
    : 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80';
  if (url.startsWith('http')) return url;
  return `${API}/uploads/${url}`;
};

const formatMatchRate = (doc) => {
  if (!doc.rateMin && !doc.rateMax) return null;
  const min = doc.rateMin ? `$${doc.rateMin}` : '';
  const max = doc.rateMax ? `$${doc.rateMax}` : '';
  const type = doc.rateType ? `/${doc.rateType}` : '';
  return min && max ? `${min}–${max}${type}` : `${min || max}${type}`;
};

function BroadSummaryCard({ match, needType, onPress }) {
  const colors  = MC[needType] || MC.service;
  const isFood  = needType === 'food';
  const cover   = resolveMatchImg(isFood ? match.coverImageUrl : match.portfolioImageUrls?.[0], needType);
  const rate    = formatMatchRate(match);
  const topItem = isFood ? match.topDishes?.[0] : match.topServices?.[0];

  return (
    <TouchableOpacity style={mStyles.card} onPress={onPress} activeOpacity={0.92}>
      <Image source={{ uri: cover }} style={mStyles.cardCover} resizeMode="cover" />
      <View style={[mStyles.availBadge, { backgroundColor: colors.badge }]}>
        <Text style={mStyles.availText}>Available</Text>
      </View>
      <TouchableOpacity style={mStyles.favBtn}>
        <Ionicons name="heart-outline" size={18} color="#fff" />
      </TouchableOpacity>
      <View style={mStyles.cardBody}>
        <Text style={mStyles.cardName}>{isFood ? match.name : match.businessName}</Text>
        <Text style={[mStyles.cardTagline, { color: colors.accent }]}>
          {isFood ? match.tagline : match.providerName}
        </Text>
        <View style={mStyles.metaRow}>
          <Ionicons name="star" size={13} color={colors.star} />
          <Text style={mStyles.metaText}> {match.rating || '4.8'} · </Text>
          <Text style={mStyles.metaText}>{isFood ? match.cuisine : match.category}</Text>
          {(match.serviceArea || match.location) &&
            <Text style={mStyles.metaText}> · {match.serviceArea || match.location}</Text>}
        </View>
        {rate && (
          <View style={mStyles.statsRow}>
            <View style={mStyles.statBox}>
              <Ionicons name="cash-outline" size={16} color="#6B7280" />
              <Text style={mStyles.statVal}>{rate}</Text>
              <Text style={[mStyles.statSub, { color: colors.accent }]}>rate</Text>
            </View>
            {match.availability && (
              <View style={mStyles.statBox}>
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text style={mStyles.statVal}>{match.availability}</Text>
                <Text style={mStyles.statSub}>availability</Text>
              </View>
            )}
          </View>
        )}
        {topItem && (
          <View style={mStyles.topPickRow}>
            <Text style={[mStyles.topPickLabel, { color: colors.badge }]}>
              {isFood ? 'Top pick' : 'Top service'}
            </Text>
            <Text style={mStyles.topPickName}>{topItem.name || topItem.dishName}</Text>
            {topItem.price && <Text style={mStyles.topPickDesc}>Est. ${topItem.price}</Text>}
          </View>
        )}
        <View style={[mStyles.aiNote, { backgroundColor: colors.bg }]}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Text style={[mStyles.aiNoteText, { color: colors.accent }]}>Matched for your request</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function BroadDetailModal({ match, needType, needText, onClose }) {
  const colors = MC[needType] || MC.service;
  const isFood = needType === 'food';
  const cover  = resolveMatchImg(isFood ? match.coverImageUrl : match.portfolioImageUrls?.[0], needType);
  const displayName = isFood ? match.name : match.businessName;
  const { userId, userProfile } = useContext(UserContext);
  const { show: showAuth } = useAuthModal();
  const [notified, setNotified] = useState(false);

  const notifyBusiness = async () => {
    if (!userId) { showAuth?.(); return; }
    if (!match.userId) { Alert.alert('Unavailable', "This business can't be notified right now."); return; }
    try {
      const fromName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || 'Someone';
      const resp = await fetch(`${API}/createNotification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: match.userId,
          type: 'lead',
          title: '📋 New service request',
          body: `${fromName} needs help with: "${needText || ''}"`,
          needText: needText || '',
          fromUserId: userId,
          fromName,
        }),
      });
      if (!resp.ok) throw new Error('Server error');
      setNotified(true);
      Alert.alert('✅ Notified', `${displayName} has been notified about your request.`);
    } catch (e) {
      Alert.alert('Error', "Couldn't notify this business. Please try again.");
    }
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: IS_WEB ? '#F7F7F7' : '#fff' }}>
      <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={mStyles.detailHeroWrap}>
            <Image source={{ uri: cover }} style={mStyles.detailHero} resizeMode="cover" />
            <TouchableOpacity style={mStyles.detailBackBtn} onPress={onClose}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={mStyles.detailBody}>
            <View style={[mStyles.availBadge, {
              position: 'relative', top: 0, left: 0, width: '30%',
              alignItems: 'center', paddingVertical: 8,
              backgroundColor: colors.badge, marginBottom: 10,
            }]}>
              <Text style={mStyles.availText}>Available</Text>
            </View>
            <Text style={mStyles.detailName}>{isFood ? match.name : match.businessName}</Text>
            {(isFood ? match.tagline : match.providerName) ? (
              <Text style={[mStyles.cardTagline, { color: colors.accent, marginBottom: 6 }]}>
                {isFood ? match.tagline : match.providerName}
              </Text>
            ) : null}
            <View style={mStyles.metaRow}>
              <Ionicons name="star" size={18} color={colors.star} />
              <Text style={mStyles.metaText}> {match.rating || '4.8'} · </Text>
              <Text style={mStyles.metaText}>{isFood ? match.cuisine : match.category}</Text>
              {(match.serviceArea || match.location) &&
                <Text style={mStyles.metaText}> · {match.serviceArea || match.location}</Text>}
            </View>
            {match.description ? (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>About</Text>
                <Text style={mStyles.aboutText}>{match.description}</Text>
              </View>
            ) : null}
            {isFood && match.topDishes?.length > 0 && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Top Dishes</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {match.topDishes.slice(0, 3).map((dish, i) => (
                    <View key={i} style={mStyles.dishCard}>
                      <Image source={{ uri: resolveMatchImg(dish.imageUrl, 'food') }}
                        style={mStyles.dishImg} resizeMode="cover" />
                      <Text style={mStyles.dishName} numberOfLines={1}>{dish.name}</Text>
                      {dish.description && <Text style={mStyles.dishDesc} numberOfLines={2}>{dish.description}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            {!isFood && match.topServices?.filter(s => s.name).length > 0 && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Top Services</Text>
                {match.topServices.filter(s => s.name).map((sv, i) => (
                  <View key={i} style={mStyles.serviceRow}>
                    <Text style={mStyles.serviceRowName}>{sv.name}</Text>
                  </View>
                ))}
              </View>
            )}
            {(match.availability || match.responseTime) && (
              <View style={mStyles.statsGrid}>
                {match.availability && <View style={mStyles.statGridBox}>
                  <Text style={mStyles.statGridVal}>{match.availability}</Text>
                  <Text style={mStyles.statGridLbl}>Availability</Text>
                </View>}
                {match.responseTime && <View style={mStyles.statGridBox}>
                  <Text style={mStyles.statGridVal} numberOfLines={2}>{match.responseTime}</Text>
                  <Text style={mStyles.statGridLbl}>Response</Text>
                </View>}
              </View>
            )}
            {!isFood && match.portfolioImageUrls?.length > 1 && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Portfolio</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {match.portfolioImageUrls.slice(0, 4).map((url, i) => (
                    <Image key={i} source={{ uri: resolveMatchImg(url, 'service') }}
                      style={mStyles.portfolioImg} resizeMode="cover" />
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={[mStyles.aiNote, { backgroundColor: colors.bg, marginTop: 16 }]}>
              <Ionicons name="sparkles" size={17} color={colors.accent} />
              <Text style={[mStyles.aiNoteText, { color: colors.accent }]}>Matched for your request</Text>
            </View>

            <TouchableOpacity
              style={[mStyles.ctaPrimary, { backgroundColor: notified ? '#9CA3AF' : colors.accent }]}
              onPress={notifyBusiness}
              disabled={notified}
            >
              <Text style={mStyles.ctaPrimaryText}>{notified ? '✅ Notified' : `Notify ${displayName}`}</Text>
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
      </View>
      </View>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    marginBottom: 16, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  cardCover:   { width: '100%', aspectRatio: 1.2 },
  availBadge:  { position: 'absolute', top: 21, left: 21, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8 },
  availText:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  favBtn:      { position: 'absolute', top: 18, right: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  cardBody:    { padding: 21 },
  cardName:    { fontSize: 26, fontWeight: '900', color: '#111827', marginBottom: 3 },
  cardTagline: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  metaText:    { fontSize: 17, color: '#6B7280' },
  statsRow:    { flexDirection: 'row', gap: 13, marginBottom: 18 },
  statBox:     { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 13, padding: 13, alignItems: 'center', gap: 4 },
  statVal:     { fontSize: 17, fontWeight: '800', color: '#111827', textAlign: 'center' },
  statSub:     { fontSize: 14, color: '#9CA3AF' },
  topPickRow:  { backgroundColor: '#F9FAFB', borderRadius: 13, padding: 16, marginBottom: 18 },
  topPickLabel:{ fontSize: 14, fontWeight: '800', textTransform: 'uppercase', marginBottom: 5 },
  topPickName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 3 },
  topPickDesc: { fontSize: 16, color: '#6B7280' },
  aiNote:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, padding: 16 },
  aiNoteText:  { fontSize: 17, fontWeight: '700' },
  detailHeroWrap: { position: 'relative' },
  detailHero:     { width: '100%', aspectRatio: 1.4 },
  detailBackBtn:  { position: 'absolute', top: 21, left: 21, width: 47, height: 47, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  detailBody:     { padding: 26 },
  detailName:     { fontSize: 31, fontWeight: '900', color: '#111827', marginBottom: 5 },
  section:        { marginBottom: 26 },
  sectionTitle:   { fontSize: 21, fontWeight: '800', color: '#111827', marginBottom: 13 },
  aboutText:      { fontSize: 18, color: '#374151', lineHeight: 29 },
  serviceRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  serviceRowName: { fontSize: 20, fontWeight: '600', color: '#111827' },
  statsGrid:      { flexDirection: 'row', gap: 13, marginBottom: 26 },
  statGridBox:    { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 18, alignItems: 'center' },
  statGridVal:    { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 5 },
  statGridLbl:    { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  dishCard:       { width: 182, marginRight: 16, backgroundColor: '#F9FAFB', borderRadius: 16, overflow: 'hidden' },
  dishImg:        { width: 182, height: 130 },
  dishName:       { fontSize: 17, fontWeight: '700', color: '#111827', padding: 10, paddingBottom: 3 },
  dishDesc:       { fontSize: 14, color: '#6B7280', paddingHorizontal: 10, paddingBottom: 10 },
  portfolioImg:   { width: 156, height: 117, borderRadius: 13, marginRight: 13 },
  inlineBadge:    { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7, marginBottom: 13 },
  ctaPrimary:     { marginTop: 23, height: 65, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaPrimaryText: { fontSize: 18, fontWeight: '800', color: '#fff' },
});

function Card({ badgeLabel, badgeColor, title, subtitle, infoLine, metaRight, media, compact, onPress, isActive, onLayout, creatorName, creatorPic, onViewCreator, rightSlot }) {
  const isVideo = media?.type === 'video' || (media?.uri || '').toLowerCase().endsWith('.mp4');
  const player = useVideoPlayer(isVideo ? (media?.uri ?? null) : null, p => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!player || !isVideo) return;
    if (isActive) {
      activeVideos.add(player);
      try { player.play(); } catch {}
      player.muted = false;
    } else {
      try { player.pause(); } catch {}
      player.muted = true;
      activeVideos.delete(player);
    }
  }, [isActive, player, isVideo]);

  // ── Web layout: text left, image right ───────────────────────────────────
  if (IS_WEB) {
    const canShowImg = !!media?.uri && /^(https?:|data:)/i.test(media.uri);
    console.log(`🃏 [Card web] title="${title?.slice(0,30)}" | media.uri=${media?.uri?.slice(0,60) ?? 'null'} | canShowImg=${canShowImg}`);
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9} onLayout={onLayout} style={styles.cardWrap}>
        <View style={[styles.card, { flexDirection: 'row', alignItems: 'stretch', padding: 0, overflow: 'hidden', minHeight: 340 }]}>
          {/* Left: text top, avatar pinned to bottom */}
          <View style={{ flex: 1, padding: 20, paddingVertical: 24, justifyContent: 'space-between' }}>
            <View>
              <View style={styles.topRow}>
                <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.badgeText}>{badgeLabel}</Text>
                </View>
                {rightSlot || (!!metaRight && <Text style={styles.meta}>{metaRight}</Text>)}
              </View>
              {!!title    && <Text style={styles.title}>{title}</Text>}
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              {!!infoLine && <Text style={styles.info}>{infoLine}</Text>}
            </View>
            {!!creatorName && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}
                onPress={onViewCreator} activeOpacity={0.8}
              >
                {creatorPic
                  ? <Image source={{ uri: creatorPic }} style={styles.webCreatorAvatar} />
                  : <View style={[styles.webCreatorAvatar, styles.creatorCircleFallback]}>
                      <Text style={styles.creatorCircleInitial}>{(creatorName[0] || '?').toUpperCase()}</Text>
                    </View>}
                <Text style={styles.creatorCircleName}>{creatorName}</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Right: only show media actually attached to this need */}
          {canShowImg && (
            <View style={{ width: '50%', padding: 12 }}>
              <Image source={{ uri: media.uri }} style={{ flex: 1, borderRadius: 10 }} resizeMode="cover" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ── Native layout: stacked ────────────────────────────────────────────────
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} onLayout={onLayout} style={styles.cardWrap}>
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
        {!!creatorName && (
          <TouchableOpacity style={styles.creatorCircleWrap} onPress={onViewCreator} activeOpacity={0.8}>
            {(() => {
              const resolvedPic = creatorPic || null;
              return resolvedPic
                ? <Image source={{ uri: resolvedPic }} style={styles.creatorCircleAvatar} />
                : <View style={[styles.creatorCircleAvatar, styles.creatorCircleFallback]}>
                    <Text style={styles.creatorCircleInitial}>{(creatorName[0] || '?').toUpperCase()}</Text>
                  </View>;
            })()}
            <Text style={styles.creatorCircleName}>{creatorName}</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F7' },
  creatorCircleWrap: { alignItems: 'center', alignSelf: 'flex-end', marginTop: 12, paddingTop: 10 },
  creatorCircleAvatar:   { width: 72, height: 72, borderRadius: 41, borderWidth: 2.5, borderColor: '#2563EB', marginBottom: 6 },
  webCreatorAvatar:      { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#2563EB' },
  creatorCircleFallback: { backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  creatorCircleInitial:  { fontSize: 24, fontWeight: '900', color: '#2563EB' },
  creatorCircleName:     { fontSize: 14, color: '#0F172A', fontWeight: '700', textAlign: 'center' },
  toggleContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  toggleButton: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 20,
    borderWidth: 1.5, borderColor: '#007bff',
    borderRadius: 25, marginHorizontal: 2, backgroundColor: 'white',
  },
  toggleActive: { backgroundColor: '#007bff' },
  toggleText: { color: '#007bff', fontWeight: '700', fontSize: 15 },
  toggleTextActive: { color: 'white' },
  searchBar: {
    height: IS_WEB ? 58 : 40,
    minHeight: IS_WEB ? 58 : 40,
    flexShrink: 0,
    margin: IS_WEB ? 14 : 10,
    borderColor: '#2563EB',
    backgroundColor: 'white',
    borderWidth: IS_WEB ? 1.5 : 1,
    borderRadius: IS_WEB ? 14 : 15,
    paddingHorizontal: IS_WEB ? 20 : 10,
    fontSize: IS_WEB ? 19 : 14,
  },
  list: { alignItems: 'center', paddingHorizontal: 10, paddingTop: 4 },
  cardWrap: { width: '100%', marginBottom: 12 },
  card: {
    width: '100%', backgroundColor: 'white',
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#94A3B8',
    shadowColor: '#000', shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4,
  },
  cardCompact: {},
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 999 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  meta: { color: '#6B7280', fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 26, fontWeight: '900', color: 'black', marginTop: 8 },
  subtitle: { color: '#374151', marginTop: 6 },
  info: { color: '#065F46', fontWeight: '800', marginTop: 8, fontSize: 16 },
  media: { width: '100%', height: 290, borderRadius: 14, marginTop: 12, borderWidth: 1, borderColor: '#3B82F6', backgroundColor: '#000' },
  mediaCompact: { height: 200 },
  matchPill: {
    position: 'absolute', zIndex: 20, right: 16, top: 14,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#10B981', borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 10,
    shadowColor: '#000', shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3,
  },
  matchPillText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  fab: {
    position: 'absolute', right: 16, bottom: 16,
    backgroundColor: '#007bff', paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 5, elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '700' },
  pinContainer: { alignItems: 'center', justifyContent: 'center', width: 70, height: 90 },
  pinBubble: {
    width: 50, height: 50, borderRadius: 25, overflow: 'hidden',
    borderWidth: 1.5, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 3,
  },
  pinImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  pinLabel: { fontSize: 10, fontWeight: '600', color: '#007bff' },
  pinTail: {
    width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 15,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', alignSelf: 'center', marginTop: -3,
  },
  pinTitle: { fontSize: 11, fontWeight: '600', color: '#111', textAlign: 'center', marginTop: 2 },
  swipeHintPill: {
    position: 'absolute', zIndex: 20, right: 16, top: 14,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#10B981', borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3,
  },
  swipeHintText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  broadMatchHeader: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 10, marginTop: 6 },
  broadMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  broadMatchImg:  { width: 48, height: 48, borderRadius: 10, backgroundColor: '#F1F5F9' },
  broadMatchName: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  broadMatchSub:  { fontSize: 12, color: '#64748B' },
  broadMatchBadge:{ backgroundColor: '#10B981', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  broadMatchBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', overflow: 'hidden' },
  modalCover:  { width: '100%', height: 220, resizeMode: 'cover' },
  modalAvailBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: '#16A34A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  modalAvailTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalBody:   { padding: 16 },
  modalName:   { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  modalOwner:  { fontSize: 14, color: '#2563EB', fontWeight: '700', marginBottom: 6 },
  modalMeta:   { flexDirection: 'row', marginBottom: 14 },
  modalRating: { fontSize: 13, color: '#F59E0B', fontWeight: '700' },
  modalMetaTxt:{ fontSize: 13, color: '#64748B' },
  modalInfoRow:{ flexDirection: 'row', gap: 12, marginBottom: 16 },
  modalInfoBox:{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  modalInfoVal:{ fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  modalInfoLabel: { fontSize: 11, color: '#94A3B8' },
  modalTopService: { marginBottom: 16 },
  modalTopServiceLabel: { fontSize: 11, color: '#10B981', fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  modalTopServiceName:  { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  modalTopServicePrice: { fontSize: 13, color: '#64748B', marginTop: 2 },
  modalMatchedPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  modalMatchedTxt: { fontSize: 14, color: '#2563EB', fontWeight: '700' },
  modalClose: { position: 'absolute', top: 16, right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
});
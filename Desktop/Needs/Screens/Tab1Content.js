// Screens/Tab1Content.js
import React, { useState, useContext, useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Image,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
} from 'react-native';
import { IS_WEB, webContainer } from '../webLayout';
import api from '../server/api';
const screenH = Dimensions.get('window').height;
import Svg, { Rect, G } from 'react-native-svg';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import NeedsVideoPlayer from '../utils/NeedsVideoPlayer';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CreateNewUser from './CreateNewUser';
import { UserContext } from '../server/CurrentUser';

// ====== Configure these for your setup ======
import { NODE_API, FLASK_API } from '../config';
import { invalidateTab2Cache } from './Tab2Content';
// ============================================

const HELP_CATEGORIES = [
  { emoji: '🍎',    label: 'Food & Meals',               query: 'food meals groceries pantry hungry' },
  { emoji: '🛏️',   label: 'Shelter & Temporary Housing', query: 'shelter housing homeless temporary rent' },
  { emoji: '👨‍👩‍👧', label: 'Family Support',              query: 'family children kids parenting domestic' },
];

// Fundraiser initiation disabled for now — app is currently focused on services & restaurants.
// Flip back to true to re-enable the "start a fundraiser" flow.
const FUNDRAISERS_ENABLED = false;

const GOOGLE_VISION_API_KEY = 'AIzaSyDcozWA1GD5WpZUONt7V7lscHn80PddUps';
const GOOGLE_VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;

const TypingBubble = () => {
  const dot1 = useState(new Animated.Value(0))[0];
  const dot2 = useState(new Animated.Value(0))[0];
  const dot3 = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true, delay }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    };
    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, [dot1, dot2, dot3]);

  return (
    <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
      <Animated.View style={[styles.dot, { opacity: dot1 }]} />
      <Animated.View style={[styles.dot, { opacity: dot2 }]} />
      <Animated.View style={[styles.dot, { opacity: dot3 }]} />
    </View>
  );
};




// ── BlueSpinner — SVG 12-pill gradient loader ────────────────────────────────
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
  const segments = 12;
  return (
    <Animated.View style={{ width: size, height: size, alignSelf: 'center', transform: [{ rotate: spin }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {Array.from({ length: segments }).map((_, i) => (
          <Rect
            key={i}
            x={45} y={5}
            width={10} height={25}
            rx={5}
            fill={`rgba(0,102,255,${1 - i * 0.07})`}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

export default function SearchScreen() {
  const navigation = useNavigation();
  const { userId: currentUserId } = useContext(UserContext);
  const insets = useSafeAreaInsets();
  const tabBarOffset = 49 + insets.bottom;

  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState([]);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [pendingQuery, setPendingQuery]         = useState(null);

  const [media, setMedia] = useState(null);

  const mediaRef = useRef(null);
  useEffect(() => { mediaRef.current = media; }, [media]);

  // Fundraiser flow
  const [mode, setMode] = useState('none');
  const [fundStep, setFundStep] = useState(0);
  const [fundraiser, setFundraiser] = useState({
    title: '', description: '', targetAmount: 0,
    mediaType: null, mediaUri: null, fileName: null, createdBy: null,
  });

  const [awaitingDecision, setAwaitingDecision] = useState(false);
  const [lastCreatedNeed, setLastCreatedNeed] = useState(null);

  const [awaitingEnhancementChoice, setAwaitingEnhancementChoice] = useState(false);
  const [pendingOriginalText, setPendingOriginalText] = useState(null);
  const [pendingEnhancedText, setPendingEnhancedText] = useState(null);
  const [pendingMedia, setPendingMedia] = useState(null);

  // Routing-readiness clarification — at most ONE question, ever, per request.
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const [pendingClarification, setPendingClarification] = useState(null); // { finalText, media }
  const [awaitingHelpCategory, setAwaitingHelpCategory] = useState(false);

  const [enhancing, setEnhancing] = useState(false);

  // ── Location capture ──────────────────────────────────────────────────────
  // Persists for the session; { lat, lng } from GPS or { city } from user text.
  const locationRef = useRef(null);
  const [awaitingLocationInput, setAwaitingLocationInput]       = useState(false);
  const awaitingLocationRef = useRef(false); // mirrors state for synchronous reads
  const [pendingNeedAfterLocation, setPendingNeedAfterLocation] = useState(null);

  // Clear the entire conversation when the logged-in user changes (login,
  // logout, or switching accounts). Tab 1 stays mounted while tabs are
  // switched, so without this the previous user's chat history stays visible.
  useEffect(() => {
    setConversation([]);
    setInput('');
    setMedia(null);
    setAwaitingDecision(false);
    setLastCreatedNeed(null);
    setAwaitingEnhancementChoice(false);
    setPendingOriginalText(null);
    setPendingEnhancedText(null);
    setPendingMedia(null);
    setAwaitingClarification(false);
    setPendingClarification(null);
    setAwaitingHelpCategory(false);
    setEnhancing(false);
    setAwaitingLocationInput(false); awaitingLocationRef.current = false;
    setPendingNeedAfterLocation(null);
    locationRef.current = null;
    setMode('none');
    setFundStep(0);
    inputRef.current = '';
    if (imageEnhanceTimeoutRef.current) clearTimeout(imageEnhanceTimeoutRef.current);
  }, [currentUserId]);

  const scrollViewRef = useRef(null);
  const inputRef = useRef('');
  const imageEnhanceTimeoutRef = useRef(null);
  // True only once the auto-enhance-after-image-pick flow actually finishes
  // populating the input. Lets sendQuery tell "media attached + already
  // enhanced" apart from "media attached + user typed their own text".
  const wasAutoEnhancedRef = useRef(false);

  // ── pushAI now accepts optional matchData so the bubble can show a "View Results" link ──
  const pushAI = (content, matchData = null) =>
    setConversation((prev) => [...prev, { ai: content, matchData }]);

  const pushUser = (content, withMedia = false) =>
    setConversation((prev) => [
      ...prev,
      { user: content, media: withMedia ? media : null },
    ]);

  useEffect(() => { inputRef.current = input; }, [input]);

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [conversation]);

  useEffect(() => {
    return () => {
      if (imageEnhanceTimeoutRef.current) clearTimeout(imageEnhanceTimeoutRef.current);
    };
  }, []);

  const BLOCKED_TERMS = [
    "best buy", "amazon", "walmart", "target",
    "costco", "ebay", "gamestop", "ikea",
    "home depot", "lowes", "etsy", "shop",
    "store", "buy", "near me", "deal", "price"
  ];

  const scrubRetailTerms = (text) => {
    let clean = text.toLowerCase();
    BLOCKED_TERMS.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, "gi");
      clean = clean.replace(regex, "");
    });
    return clean.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  };

  // Attempts to get GPS coords. On native: requests foreground permission (shows
  // the OS dialog). On web: calls navigator.geolocation (browser asks once).
  // Returns true if coords were captured, false if denied/unavailable.
  const captureLocation = async () => {
    if (locationRef.current) return true; // already have it
    try {
      if (IS_WEB) {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
        return await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              resolve(true);
            },
            () => resolve(false),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          );
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return false;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        // Reject cold-start WiFi guesses — accuracy > 500m is not trustworthy
        if (loc.coords.accuracy > 500) return false;
        locationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        return true;
      }
    } catch {
      return false;
    }
  };

  // Builds the location params object to pass to /ai/findMatches.
  const locationParams = () => {
    const loc = locationRef.current;
    if (!loc) return {};
    if (loc.lat != null) return { userLat: loc.lat, userLng: loc.lng };
    if (loc.city)        return { userCity: loc.city };
    return {};
  };

  // Returns a GeoJSON Point for createNeedRequest, or null if no GPS coords.
  const locationGeoJSON = () => {
    const loc = locationRef.current;
    if (loc?.lat != null && loc?.lng != null) {
      return { type: 'Point', coordinates: [loc.lng, loc.lat] };
    }
    return null;
  };

  const analyzeImageWithVisionAPI = async (base64Image) => {
    try {
      const response = await fetch(GOOGLE_VISION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 5 },
              { type: 'WEB_DETECTION' },
              { type: 'LOGO_DETECTION' },
            ],
          }],
        }),
      });
      const data = await response.json();
      const labels = data.responses?.[0]?.labelAnnotations || [];
      const web = data.responses?.[0]?.webDetection || {};
      const logo = data.responses?.[0]?.logoAnnotations?.[0]?.description || '';
      const bestGuess = web.bestGuessLabels?.[0]?.label || '';

      // LABEL_DETECTION identifies the actual object (e.g. "Tire"); WEB_DETECTION's
      // bestGuess is a reverse-image-search caption and is unreliable for close-up crops.
      const topLabels = labels.slice(0, 3).map((l) => l.description).join(' ');

      const rawResult = [topLabels || bestGuess, logo].filter(Boolean).join(" ");
      const cleanedResult = scrubRetailTerms(rawResult);
      console.log("✅ Vision Cleaned:", cleanedResult);
      return cleanedResult;
    } catch (error) {
      console.error('🚨 Vision API error:', error);
      return '';
    }
  };

  const handleMediaPick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { alert('Camera roll access is required!'); return; }
    const picker = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false, // crop editor on web requires an extra confirm step; skip it
      quality: 1, base64: true,
    });
    console.log('📷 [PICKER] canceled:', picker.canceled, '| assets:', picker.assets?.length, '| asset0:', JSON.stringify({ type: picker.assets?.[0]?.type, uri: picker.assets?.[0]?.uri?.slice(0,60), hasBase64: !!picker.assets?.[0]?.base64 }));

    if (!picker.canceled && picker.assets?.[0]) {
      const asset = picker.assets[0];
      console.log('📷 [PICKER] setMedia asset type:', asset.type, '| uri prefix:', asset.uri?.slice(0,30), '| base64 len:', asset.base64?.length);
      setMedia(asset);
      wasAutoEnhancedRef.current = false;

      if (mode === 'fundraiser' && fundStep === 2) {
        setFundraiser((prev) => ({
          ...prev, mediaType: asset.type, mediaUri: asset.uri,
          fileName: asset.fileName || 'media',
        }));
      }

      if (asset.type === 'image' && asset.base64 && mode === 'none') {
        if (imageEnhanceTimeoutRef.current) clearTimeout(imageEnhanceTimeoutRef.current);

        imageEnhanceTimeoutRef.current = setTimeout(async () => {
          if (inputRef.current.trim()) return;
          if (!mediaRef.current || mediaRef.current.uri !== asset.uri) return;
          try {
            setEnhancing(true);
            const labels = await analyzeImageWithVisionAPI(asset.base64);
            let finalDesc = labels;
            try {
              const enhResp = await axios.post(`${FLASK_API}/ai/enhanceNeedDescription`, {
                labels, userText: '',
              });
              const desc = enhResp.data?.description;
              if (desc && desc.trim()) finalDesc = desc.trim();
            } catch (e) {
              console.log('⚠️ enhanceNeedDescription failed:', e?.message);
            }
            if (!inputRef.current.trim() && finalDesc) {
              setInput(finalDesc);
              wasAutoEnhancedRef.current = true;
            }
          } catch (err) {
            console.error('🚨 Error during image-only enhancement:', err);
          } finally {
            setEnhancing(false);
          }
        }, 3000);
      }
    }
  };

  const parseFundraiserText = (txt) => {
    const amountMatch = (txt || '').match(/\$?\s*([\d,]+)(?:\.\d{1,2})?/);
    const targetAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 0;
    const words = (txt || '').trim().split(/\s+/);
    const title = words.slice(0, Math.min(words.length, 8)).join(' ') || 'Fundraiser';
    return { title, description: (txt || '').trim(), targetAmount: Number.isFinite(targetAmount) ? targetAmount : 0 };
  };

  const resetFundraiserState = () => {
    setMode('none'); setFundStep(0);
    setFundraiser({ title: '', description: '', targetAmount: 0, mediaType: null, mediaUri: null, fileName: null, createdBy: null });
    setMedia(null);
  };

  const finalizeFundraiser = async () => {
    try {
      const payload = {
        ...fundraiser,
        targetAmount: Number.isFinite(Number(fundraiser.targetAmount)) ? Number(fundraiser.targetAmount) : 0,
        createdBy: fundraiser.createdBy || currentUserId || null,
        mediaType: fundraiser.mediaType ?? media?.type ?? null,
        mediaUri: fundraiser.mediaUri ?? media?.uri ?? null,
        fileName: fundraiser.fileName ?? media?.fileName ?? null,
      };
      const r = await api.post(`${NODE_API}/createFundraiser`, payload);
      if (r.status >= 200 && r.status < 300 && r.data) {
        pushAI(
          <Text>
            Your fundraiser has been created!
            {'\n'}• Title: <Text style={{ fontWeight: '700' }}>{payload.title}</Text>
            {'\n'}• Goal: <Text style={{ fontWeight: '700' }}>${payload.targetAmount}</Text>
            {'\n'}• Description: {payload.description || '(none)'}
          </Text>
        );
      } else {
        pushAI('Fundraiser saving failed. Please try again.');
      }
    } catch (e) {
      const status = e?.response?.status;
      pushAI(`Fundraiser saving failed${status ? ` (status ${status})` : ''}. Please try again.`);
    } finally {
      resetFundraiserState();
    }
  };

  const extractPriceFromText = (text) => {
    const match = (text || '').match(/\$\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const uploadMediaAndGetUri = async (mediaAsset) => {
    if (!mediaAsset?.uri) return null;
    if (/^https?:/i.test(mediaAsset.uri)) return mediaAsset.uri;
    try {
      let b64 = mediaAsset.base64 || null;
      if (!b64) {
        const r = await fetch(mediaAsset.uri);
        const blob = await r.blob();
        b64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      }
      if (!b64) return null;
      const up = await api.post(`${NODE_API}/uploadImage`, `data:image/jpeg;base64,${b64}`, { headers: { 'Content-Type': 'text/plain' } });
      return up.data?.url || null;
    } catch (e) {
      console.warn('⚠️ uploadMediaAndGetUri failed:', e.message);
      return null;
    }
  };

  const processNeedFlow = async (finalText, mediaForNeed, opts = {}) => {
    const { skipReadinessCheck = false } = opts;
    if (!finalText || !finalText.trim()) {
      pushAI('I lost track of your description. Please type your need again.');
      return;
    }

    setConversation((prev) => [...prev, { aiThinking: true }]);
    try {
      const resp = await axios.post(`${FLASK_API}/search`, {
        query: finalText, userId: currentUserId,
        mediaUri: mediaForNeed?.uri || null,
        mediaType: mediaForNeed?.type || null,
        fileName: mediaForNeed?.fileName || 'media',
      });
      const intentType = resp.data?.type;
      const extractedData = resp.data?.searchParams;
      const needType = resp.data?.needType || 'item';

      if (FUNDRAISERS_ENABLED && intentType === 'fundraiser') {
        setConversation((prev) => prev.filter((m) => !m.aiThinking));
        pushAI(<Text>I can help you start a fundraiser. First, please share a short <Text style={{ fontWeight: '700' }}>description</Text> and your <Text style={{ fontWeight: '700' }}>target amount</Text> (e.g., $2500).</Text>);
        setMode('fundraiser'); setFundStep(1);
        setFundraiser((prev) => ({ ...prev, createdBy: currentUserId || null }));
        return;
      }

      if (!extractedData || !extractedData.searchText) {
        setConversation((prev) => prev.filter((m) => !m.aiThinking));
        pushAI("I couldn't extract item, urgency, and price. Could you rephrase?");
        return;
      }

      // Routing-readiness check — only for service requests, only once per
      // request (skipReadinessCheck is set when resuming after the user has
      // already answered the one allowed clarification question).
      if (needType === 'service' && !skipReadinessCheck) {
        try {
          const readyRes = await axios.post(`${FLASK_API}/ai/checkServiceReadiness`, { query: finalText });
          if (readyRes.data?.ready === false && readyRes.data?.question) {
            setConversation((prev) => prev.filter((m) => !m.aiThinking));
            pushAI(readyRes.data.question);
            setPendingClarification({ finalText, media: mediaForNeed });
            setAwaitingClarification(true);
            return;
          }
        } catch (e) {
          console.log('⚠️ Readiness check failed, proceeding without it:', e?.message);
        }
      }

      // Upload media to the server so the stored URI is an http:// URL
      // accessible from web browsers. On web the picker returns blob:/data:
      // URIs (not file://) so we convert to base64 if needed before uploading.
      let resolvedMediaUri = mediaForNeed?.uri || null;
      console.log('📎 [UPLOAD] mediaForNeed:', { type: mediaForNeed?.type, uri: mediaForNeed?.uri?.slice(0, 60), hasBase64: !!mediaForNeed?.base64 });
      if (mediaForNeed?.type === 'image' || (mediaForNeed?.uri && !/\.(mp4|mov|avi|webm)$/i.test(mediaForNeed.uri) && mediaForNeed?.type !== 'video')) {
        try {
          // Get base64: use asset.base64 if available, otherwise fetch the blob/data URI
          let b64 = mediaForNeed.base64 || null;
          console.log('📎 [UPLOAD] b64 from asset:', b64 ? `${b64.slice(0, 20)}... (len=${b64.length})` : 'none');
          if (!b64 && resolvedMediaUri) {
            console.log('📎 [UPLOAD] fetching blob from URI:', resolvedMediaUri?.slice(0, 60));
            const resp = await fetch(resolvedMediaUri);
            const blob = await resp.blob();
            b64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            console.log('📎 [UPLOAD] b64 from blob:', b64 ? `len=${b64.length}` : 'null');
          }
          if (b64) {
            console.log('📎 [UPLOAD] POSTing to /uploadImage...');
            const up = await axios.post(
              `${NODE_API}/uploadImage`,
              `data:image/jpeg;base64,${b64}`,
              { headers: { 'Content-Type': 'text/plain' } }
            );
            console.log('📎 [UPLOAD] response:', up.data);
            if (up.data?.url) resolvedMediaUri = up.data.url;
          } else {
            console.warn('📎 [UPLOAD] no b64 — skipping upload, mediaUri stays:', resolvedMediaUri?.slice(0, 60));
          }
        } catch (e) {
          console.warn('⚠️ Image pre-upload failed:', e.message);
        }
      } else if (mediaForNeed?.type === 'video' && resolvedMediaUri?.startsWith('file://')) {
        try {
          const fd = new FormData();
          fd.append('video', { uri: resolvedMediaUri, type: 'video/mp4', name: mediaForNeed?.fileName || 'video.mp4' });
          const up = await api.post(`${NODE_API}/uploadVideo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (up.data?.url) resolvedMediaUri = up.data.url;
        } catch (e) {
          console.warn('⚠️ Video pre-upload failed:', e.message);
        }
      }

      console.log('📎 [UPLOAD] final resolvedMediaUri:', resolvedMediaUri?.slice(0, 80));
      const needPayload = {
        ...extractedData, context: finalText, needType,
        mediaType: mediaForNeed?.type || null, mediaUri: resolvedMediaUri,
        fileName: mediaForNeed?.fileName || 'media', userId: currentUserId,
        location: locationGeoJSON(),
      };
      console.log('📎 [PAYLOAD] mediaType:', needPayload.mediaType, '| mediaUri:', needPayload.mediaUri?.slice(0, 80));

      let createdNeed = null;
      try {
        const createRes = await api.post(`${NODE_API}/createNeedRequest`, needPayload);
        createdNeed = createRes.data;
        invalidateTab2Cache();
      } catch (e) {
        setConversation((prev) => prev.filter((m) => !m.aiThinking));
        pushAI('I tried to save your need request, but something went wrong. Please try again.');
        if (mode !== 'fundraiser') setMedia(null);
        return;
      }

      setConversation((prev) => prev.filter((m) => !m.aiThinking));
      setLastCreatedNeed(createdNeed);

      if (needType === 'service') {
        pushAI('Your service request has been created! Finding matching providers...');
        try {
          const matchRes = await axios.post(`${FLASK_API}/ai/findMatches`, { query: finalText, type: 'service', ...locationParams() });
          const matches = matchRes.data?.matches || [];
          if (matches.length === 0) {
            pushAI("No matching providers found yet — your request is live on the feed.");
            setAwaitingDecision(true);
          } else {
            navigation.navigate('MatchResults', { matches, type: 'service', query: finalText });
            pushAI(`Found ${matches.length} service provider${matches.length > 1 ? 's' : ''} for you!`,
              { matches, query: finalText, type: 'service' });
          }
        } catch (e) {
          pushAI(`Your service request has been created. Would you like to view it or create another request?${FUNDRAISERS_ENABLED ? ' Or start a fundraiser?' : ''}`);
          setAwaitingDecision(true);
        }
        return;
      }

      // Item flow disabled for now — app is currently focused on services & restaurants,
      // so anything that isn't a service falls into the food/restaurant match flow below.
      // if (needType === 'item') {
      //   pushAI('Your Need request has been created. Would you like to view it, browse available related items, create another request, or start a fundraiser?');
      //   setAwaitingDecision(true);
      //   return;
      // }

      pushAI('Your request has been created! Finding matching restaurants...');
      try {
        const matchRes = await axios.post(`${FLASK_API}/ai/findMatches`, { query: finalText, type: 'food', ...locationParams() });
        const matches = matchRes.data?.matches || [];
        if (matches.length === 0) {
          pushAI("No matching restaurants found yet — your request is live on the feed.");
          setAwaitingDecision(true);
        } else {
          navigation.navigate('MatchResults', { matches, type: 'food', query: finalText });
          pushAI(`Found ${matches.length} restaurant${matches.length > 1 ? 's' : ''} for you!`,
            { matches, query: finalText, type: 'food' });
        }
      } catch (e) {
        pushAI(`Your request has been created. Would you like to view it or create another request?${FUNDRAISERS_ENABLED ? ' Or start a fundraiser?' : ''}`);
        setAwaitingDecision(true);
      }
    } catch (err) {
      console.error('❌ Error in /search:', err);
      setConversation((prev) => prev.filter((m) => !m.aiThinking));
      pushAI('Something went wrong. Please try again.');
    } finally {
      setInput('');
      if (mode !== 'fundraiser') setMedia(null);
    }
  };

  const handleEnhancementChoice = async () => {
    const choice = (input || '').trim();
    if (!choice) return;
    pushUser(choice, false);
    setInput('');
    const lower = choice.toLowerCase();
    let useEnhanced = null;
    if (lower.startsWith('y')) useEnhanced = true;
    else if (lower.startsWith('n')) useEnhanced = false;
    else { pushAI('Please type "Yes" to use the enhanced version or "No" to keep your original description.'); return; }

    const finalText = useEnhanced && pendingEnhancedText ? pendingEnhancedText : (pendingOriginalText || '');
    const mediaToUse = pendingMedia || media;
    setAwaitingEnhancementChoice(false);
    setPendingOriginalText(null); setPendingEnhancedText(null); setPendingMedia(null);
    if (!finalText.trim()) { pushAI('I lost track of your description. Please type your need again.'); return; }
    await processNeedFlow(finalText, mediaToUse);
  };

  // Resumes routing after the one allowed clarification question — appends
  // the answer to the original text and proceeds without asking again.
  const handleClarificationAnswer = async () => {
    const answer = (input || '').trim();
    if (!answer) return;
    pushUser(answer, false);
    setInput('');

    const base = pendingClarification?.finalText || '';
    const mediaToUse = pendingClarification?.media || null;
    setAwaitingClarification(false);
    setPendingClarification(null);

    if (!base.trim()) { pushAI('I lost track of your request. Please describe your need again.'); return; }
    const combinedText = `${base} ${answer}`.trim();
    await processNeedFlow(combinedText, mediaToUse, { skipReadinessCheck: true });
  };

  const handleDecisionStage = async () => {
    const userReply = (input || '').trim();
    if (!userReply) return;
    pushUser(userReply, false);
    setInput('');
    setConversation((prev) => [...prev, { aiThinking: true }]);
    try {
      const resp = await axios.post(`${FLASK_API}/ai/nextAction`, { userReply });
      const action = resp.data?.action || 'NEW_REQUEST';
      setConversation((prev) => prev.filter((m) => !m.aiThinking));

      if (action === 'VIEW_NEED' && lastCreatedNeed) {
        navigation.navigate('Fill Needs', { screen: 'SingleItemView', params: { item: lastCreatedNeed, fromNeedInquiry: true } });
        setAwaitingDecision(false); return;
      }

      if (action === 'VIEW_UPLOADED') {
        if (lastCreatedNeed?.needType === 'service') {
          pushAI('This is a service request, so there are no items to browse. Providers will be matched soon.');
          setAwaitingDecision(false); return;
        }
        try {
          if (lastCreatedNeed) {
            const matchRes = await api.get(`${NODE_API}/searchUploadedItems`, {
              params: { title: lastCreatedNeed.searchText || '', maxPrice: lastCreatedNeed.bidprice || '', urgency: lastCreatedNeed.urgency || '' },
            });
            const matches = Array.isArray(matchRes.data) ? matchRes.data : [];
            if (matches.length === 0) { pushAI('No close matches were found for your request yet.'); }
            else { navigation.navigate('SearchResults', { searchResults: matches, searchText: lastCreatedNeed.searchText || '', urgency: lastCreatedNeed.urgency || '', bidprice: lastCreatedNeed.bidprice || '' }); }
          } else {
            const browseRes = await api.get(`${NODE_API}/uploadedItemsAll`);
            const allItems = Array.isArray(browseRes.data) ? browseRes.data : [];
            if (allItems.length === 0) { pushAI('There are no uploaded items available yet.'); }
            else { navigation.navigate('SearchResults', { searchResults: allItems, searchText: 'All Available Items', urgency: '', bidprice: '' }); }
          }
        } catch (e) { pushAI('I could not load items right now. Please try again.'); }
        setAwaitingDecision(false); return;
      }

      if (FUNDRAISERS_ENABLED && action === 'FUNDRAISER') {
        pushAI(<Text>Let&apos;s start a fundraiser. First, please share a short <Text style={{ fontWeight: '700' }}>description</Text> and your <Text style={{ fontWeight: '700' }}>target amount</Text> (e.g., $2500).</Text>);
        setMode('fundraiser'); setFundStep(1);
        setFundraiser((prev) => ({ ...prev, createdBy: currentUserId || null }));
        setAwaitingDecision(false); return;
      }

      pushAI('Okay, describe your next need request.');
      setAwaitingDecision(false);
      setLastCreatedNeed(null);
    } catch (err) {
      setConversation((prev) => prev.filter((m) => !m.aiThinking));
      pushAI('I could not understand your choice. Please try again.');
    }
  };

  const searchNonprofits = async (query) => {
    setConversation(prev => [...prev, { aiThinking: true }]);
    try {
      const res = await axios.post(`${FLASK_API}/ai/findMatches`, { query, type: 'nonprofit', ...locationParams() });
      setConversation(prev => prev.filter(m => !m.aiThinking));
      const matches = res.data?.matches || [];
      if (matches.length === 0) {
        pushAI("I couldn't find matching resources right now. You can also dial 211 to connect with local community support.");
      } else {
        navigation.navigate('MatchResults', { matches, type: 'nonprofit', query });
        pushAI(
          `Found ${matches.length} resource${matches.length > 1 ? 's' : ''} that may help!`,
          { matches, query, type: 'nonprofit' }
        );
      }
    } catch (e) {
      setConversation(prev => prev.filter(m => !m.aiThinking));
      pushAI('Could not search resources right now. Please try again, or dial 211 for local support.');
    }
  };

  const handleLocationInput = async () => {
    const text = (input || '').trim();
    if (!text) { pushAI("Please provide a City, Zip code, or Address so I can search nearby."); return; }
    pushUser(text, false);
    setInput('');
    // Strip natural-language prefixes so "look in long beach" → "long beach"
    const cleanedCity = text
      .replace(/^(look(?:ing)?\s+(?:in|near|around|at)|search(?:ing)?\s+(?:in|near|around|at|for)?|find\s+(?:in|near|around)?|near|around|in|at)\s+/i, '')
      .trim();
    locationRef.current = { city: cleanedCity || text };
    setAwaitingLocationInput(false); awaitingLocationRef.current = false;
    const pending = pendingNeedAfterLocation;
    setPendingNeedAfterLocation(null);
    if (pending?.originalText) {
      await sendQuery(pending.originalText);
    }
  };

  const handleHelpCategorySelect = async (cat) => {
    setAwaitingHelpCategory(false);
    pushUser(`${cat.emoji} ${cat.label}`, false);
    await searchNonprofits(cat.query);
  };

  const sendQuery = async (overrideText = null) => {
    // Guard: onPress can pass the event object; treat any non-string as no override
    if (overrideText !== null && typeof overrideText !== 'string') overrideText = null;
    Keyboard.dismiss();
    if (!currentUserId) {
      setPendingQuery((input || '').trim());
      setAuthModalVisible(true);
      return;
    }

    if (mode === 'fundraiser') {
      if (fundStep === 1) {
        pushUser(input || '(no text)', false);
        const parsed = parseFundraiserText(input || '');
        setFundraiser((prev) => ({ ...prev, ...parsed, createdBy: prev.createdBy || currentUserId || null }));
        setInput('');
        pushAI(<Text>Great—now please <Text style={{ fontWeight: '700' }}>upload an image or a short video</Text> for your fundraiser, or type <Text style={{ fontStyle: 'italic' }}>"skip"</Text> to continue without media.</Text>);
        setFundStep(2); return;
      }
      if (fundStep === 2) {
        const saidSkip = (input || '').trim().toLowerCase() === 'skip';
        if (saidSkip || media) {
          pushUser(saidSkip ? 'skip' : '(uploaded media)', !!media);
          setInput('');
          await finalizeFundraiser(); return;
        }
        pushAI('Please upload an image/video or type "skip" to continue.'); return;
      }
      return;
    }

    if (!overrideText && awaitingLocationRef.current) { await handleLocationInput(); return; }
    if (awaitingDecision) { await handleDecisionStage(); return; }
    if (awaitingEnhancementChoice) { await handleEnhancementChoice(); return; }
    if (awaitingClarification) { await handleClarificationAnswer(); return; }

    if (awaitingHelpCategory) {
      const answer = (input || '').trim();
      if (!answer) return;
      pushUser(answer, false);
      setInput('');
      setAwaitingHelpCategory(false);
      await searchNonprofits(answer);
      return;
    }

    const originalText = overrideText || (input || '').trim();
    if (!originalText) return;

    // ── Help / Nonprofit trigger ──────────────────────────────────────────────
    const isJustHelp = /^help[!?. ]*$/i.test(originalText);
    const helpWithMatch = originalText.match(
      /^help\s+(?:with|finding|find|for|me(?:\s+(?:find|get))?|getting|get)?\s+(.+)/i
    );
    if (isJustHelp || helpWithMatch) {
      pushUser(originalText, false);
      setInput('');
      if (isJustHelp) {
        setConversation(prev => [...prev, { helpCategoryPicker: true }]);
        setAwaitingHelpCategory(true);
        return;
      }
      const helpTopic = (helpWithMatch[1] || '').trim();
      await searchNonprofits(helpTopic);
      return;
    }

    // Show user message immediately and clear input (skip on re-run after location)
    if (!overrideText) { pushUser(originalText, !!media); setInput(''); }

    // Show spinner immediately — visible during all async checks below
    setConversation((prev) => [...prev, { aiThinking: true }]);

    // Global browse / action check
    if (!awaitingDecision) {
      try {
        const resp = await axios.post(`${FLASK_API}/ai/nextAction`, { userReply: originalText });
        const action = resp.data?.action;

        // Location is required for all need searches. Skip for fundraiser/browse actions.
        if (action !== 'FUNDRAISER' && action !== 'VIEW_UPLOADED') {
          if (!locationRef.current) {
            const gotGPS = await captureLocation();
            if (!gotGPS) {
              setConversation(prev => prev.filter(m => !m.aiThinking));
              setPendingNeedAfterLocation({ originalText });
              setAwaitingLocationInput(true); awaitingLocationRef.current = true;
              pushAI("I currently do not have access to your location for this request. Could you please provide a City, Zip code, or Address so I can look in that area?");
              return;
            }
          }
        }

        if (FUNDRAISERS_ENABLED && action === 'FUNDRAISER') {
          pushAI(<Text>Let's start your fundraiser! First, give me a short <Text style={{ fontWeight: '700' }}>description</Text> and your <Text style={{ fontWeight: '700' }}>target amount</Text> (e.g., $2500).</Text>);
          setMode('fundraiser'); setFundStep(1);
          setFundraiser(prev => ({ ...prev, createdBy: currentUserId }));
          return;
        }

        if (action === 'VIEW_UPLOADED') {
          if (lastCreatedNeed) {
            const matchRes = await api.get(`${NODE_API}/searchUploadedItems`, {
              params: { title: lastCreatedNeed.searchText || '', maxPrice: lastCreatedNeed.bidprice || '', urgency: lastCreatedNeed.urgency || '' },
            });
            const matches = Array.isArray(matchRes.data) ? matchRes.data : [];
            if (matches.length === 0) { pushAI('No close matches were found for your request yet.'); }
            else { navigation.navigate('SearchResults', { searchResults: matches, searchText: lastCreatedNeed.searchText || '', urgency: lastCreatedNeed.urgency || '', bidprice: lastCreatedNeed.bidprice || '' }); }
          } else {
            const browseRes = await api.get(`${NODE_API}/uploadedItemsAll`);
            const allItems = Array.isArray(browseRes.data) ? browseRes.data : [];
            if (allItems.length === 0) { pushAI('There are no uploaded items available yet.'); }
            else { navigation.navigate('SearchResults', { searchResults: allItems, searchText: 'All Available Items', urgency: '', bidprice: '' }); }
          }
          return;
        }

        if (action === 'FIND_RESTAURANT') {
          try {
            let enhancedText = originalText;
            // Skip re-enhancing only when the auto-enhance-after-image-pick flow already
            // ran and produced this text. If media is attached but the user typed their
            // own text before that flow fired, it never ran — so still enhance here.
            if (!media || !wasAutoEnhancedRef.current) {
              try {
                const enhResp = await axios.post(`${FLASK_API}/ai/enhanceNeedDescription`, { labels: '', userText: originalText });
                const desc = (enhResp.data?.description || '').trim();
                if (desc && desc.toLowerCase() !== originalText.toLowerCase()) {
                  enhancedText = desc;
                  pushAI(`Here's how I understood your request:\n\n"${enhancedText}"`);
                }
              } catch (e) {
                console.log('⚠️ enhanceNeedDescription failed (restaurant fast-path):', e?.message);
              }
            }

            const loc = locationRef.current;
            const res = await axios.post(`${FLASK_API}/ai/findMatches`, {
              query: enhancedText, type: 'food',
              ...(loc?.lat != null && loc?.lng != null ? { userLat: loc.lat, userLng: loc.lng } : {}),
              ...(loc?.city ? { userCity: loc.city } : {}),
            });
            setConversation((prev) => prev.filter((m) => !m.aiThinking));
            const matches = res.data?.matches || [];
            const context = res.data?.context || {};
            if (matches.length === 0) {
              pushAI("I couldn't find any matching restaurants yet. New ones are added regularly!");
            } else {
              navigation.navigate('MatchResults', { matches, type: 'food', query: enhancedText, context });
              pushAI(`Found ${matches.length} restaurant${matches.length > 1 ? 's' : ''} matching your request!`,
                { matches, query: enhancedText, type: 'food' });
            }
            if (currentUserId) {
              const initialMatchNames = matches.map(m => (m.name || '').toLowerCase()).filter(Boolean);
              const mediaHttpUri = media ? await uploadMediaAndGetUri(media) : null;
              api.post(`${NODE_API}/createNeedRequest`, {
                searchText: context.searchText || enhancedText, urgency: context.urgency || 'Now',
                bidprice: context.bidprice || 0, mealType: context.mealType || null,
                budgetMin: context.budgetMin || null, budgetMax: context.budgetMax || null,
                budgetLabel: context.budgetLabel || null, distance: context.distance || null,
                context: enhancedText, needType: 'food', userId: currentUserId,
                initialMatchNames,
                mediaType: media?.type || null,
                mediaUri: mediaHttpUri,
                fileName: media?.fileName || 'media',
                location: locationGeoJSON(),
              }).then(r => console.log('✅ Food NeedRequest saved:', r.data?._id))
                .catch(e => console.log('⚠️ Food NeedRequest save failed:', e?.message));
            }
          } catch (e) {
            setConversation((prev) => prev.filter((m) => !m.aiThinking));
            pushAI('Could not search restaurants right now. Please try again.');
          }
          return;
        }

        if (action === 'FIND_SERVICE') {
          try {
            let enhancedText = originalText;
            // Skip re-enhancing only when the auto-enhance-after-image-pick flow already
            // ran and produced this text. If media is attached but the user typed their
            // own text before that flow fired, it never ran — so still enhance here.
            if (!media || !wasAutoEnhancedRef.current) {
              try {
                const enhResp = await axios.post(`${FLASK_API}/ai/enhanceNeedDescription`, { labels: '', userText: originalText });
                const desc = (enhResp.data?.description || '').trim();
                if (desc && desc.toLowerCase() !== originalText.toLowerCase()) {
                  enhancedText = desc;
                  pushAI(`Here's how I understood your request:\n\n"${enhancedText}"`);
                }
              } catch (e) {
                console.log('⚠️ enhanceNeedDescription failed (service fast-path):', e?.message);
              }
            }

            // Routing-readiness check — at most one clarifying question, ever.
            try {
              const readyRes = await axios.post(`${FLASK_API}/ai/checkServiceReadiness`, { query: enhancedText });
              if (readyRes.data?.ready === false && readyRes.data?.question) {
                setConversation((prev) => prev.filter((m) => !m.aiThinking));
                pushAI(readyRes.data.question);
                setPendingClarification({ finalText: enhancedText, media });
                setAwaitingClarification(true);
                return;
              }
            } catch (e) {
              console.log('⚠️ Readiness check failed, proceeding without it:', e?.message);
            }

            const loc = locationRef.current;
            const res = await axios.post(`${FLASK_API}/ai/findMatches`, {
              query: enhancedText, type: 'service',
              ...(loc?.lat != null && loc?.lng != null ? { userLat: loc.lat, userLng: loc.lng } : {}),
              ...(loc?.city ? { userCity: loc.city } : {}),
            });
            setConversation((prev) => prev.filter((m) => !m.aiThinking));
            const matches = res.data?.matches || [];
            if (matches.length === 0) {
              pushAI("Good, I posted your request for providers to fulfill in the Needs Stack. But, I couldn't find any matching service providers yet. Check back shortly to see which providers can fulfill your request  !");
            } else {
              navigation.navigate('MatchResults', { matches, type: 'service', query: enhancedText });
              pushAI(`Found ${matches.length} service provider${matches.length > 1 ? 's' : ''} matching your request!`,
                { matches, query: enhancedText, type: 'service' });
            }
            if (currentUserId) {
              const initialMatchNames = matches.map(m => (m.businessName || m.name || '').toLowerCase()).filter(Boolean);
              const mediaHttpUri = media ? await uploadMediaAndGetUri(media) : null;
              api.post(`${NODE_API}/createNeedRequest`, {
                searchText: enhancedText, urgency: 'ASAP',
                bidprice: extractPriceFromText(enhancedText), context: enhancedText,
                needType: 'service', userId: currentUserId,
                mediaType: media?.type || null,
                mediaUri: mediaHttpUri,
                fileName: media?.fileName || 'media',
                initialMatchNames,
                location: locationGeoJSON(),
              }).then(r => { setLastCreatedNeed(r.data); })
                .catch(e => console.log('Service NeedRequest save failed:', e?.message));
            }
          } catch (e) {
            setConversation((prev) => prev.filter((m) => !m.aiThinking));
            pushAI('Could not search services right now. Please try again.');
          }
          return;
        }

      } catch (e) {
        console.log('Global browse check failed:', e?.message);
      }
    }

    // Fallthrough path (general need / processNeedFlow) also requires location
    if (!locationRef.current) {
      const gotGPS = await captureLocation();
      if (!gotGPS) {
        setConversation(prev => prev.filter(m => !m.aiThinking));
        setPendingNeedAfterLocation({ originalText });
        setAwaitingLocationInput(true); awaitingLocationRef.current = true;
        pushAI("I currently do not have access to your location for this request. Could you please provide a City, Zip code, or Address so I can look in that area?");
        return;
      }
    }

    const attachedMedia = media;

    try {
      let labels = '';
      if (attachedMedia?.type === 'image' && attachedMedia.base64) {
        labels = await analyzeImageWithVisionAPI(attachedMedia.base64);
      }
      let enhancedDescription = '';
      let unclear = false;
      try {
        const enhResp = await axios.post(`${FLASK_API}/ai/enhanceNeedDescription`, { labels, userText: originalText });
        enhancedDescription = (enhResp.data?.description || '').trim();
        unclear = !!enhResp.data?.unclear;
      } catch (err) {
        console.log('⚠️ enhanceNeedDescription failed:', err?.message);
      }
      setConversation((prev) => prev.filter((m) => !m.aiThinking));

      // Neither a service nor a restaurant request was detected — ask the user to
      // restate it instead of forcing a guess (we only support those two for now).
      if (unclear) {
        pushAI(" Sorry, I could not complete your Need Request. Please restate it more specifically, so I can connect you with the resource? For example, describe what work you need done, or what kind of food you're craving, or upload an image or video.");
        if (mode !== 'fundraiser') setMedia(null);
        return;
      }

      if (enhancedDescription && enhancedDescription.toLowerCase() !== originalText.toLowerCase()) {
        pushAI(`Here's an improved version of your description.\n\n"${enhancedDescription}"\n\nUse enhanced version? Yes or No?`);
        setPendingOriginalText(originalText); setPendingEnhancedText(enhancedDescription);
        setPendingMedia(attachedMedia); setAwaitingEnhancementChoice(true);
        return;
      }
      await processNeedFlow(originalText, attachedMedia);
    } catch (err) {
      console.error('❌ Error in sendQuery enhancement stage:', err);
      setConversation((prev) => prev.filter((m) => !m.aiThinking));
      pushAI('Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={tabBarOffset}
    >
      <View style={[{ flex: 1, width: '100%', alignItems: 'center' }, webContainer, IS_WEB && { maxWidth: 1037 }]}>
      <View style={styles.headingRow}>
        <Image
          source={require('/Users/joshhurst/Desktop/Needs/assets/NeedsLogo.png')}
          style={styles.logoImage}
        />
      </View>

      <ScrollView
        style={[styles.chatContainer, IS_WEB && { maxHeight: screenH * 0.74 }]}
        ref={scrollViewRef}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {conversation.map((msg, i) => (
          <View key={i} style={styles.chatMessage}>
            {msg.aiThinking && (
              <View style={[styles.bubble, styles.aiBubble, { flexDirection: 'row', alignItems: 'center' }]}>
                <Text style={styles.nameLabelAI}>NeedAI: </Text>
                <BlueSpinner size={24} />
              </View>
            )}

            {msg.helpCategoryPicker && (
              <View style={[styles.bubble, styles.aiBubble, { maxWidth: '95%' }]}>
                <Text style={IS_WEB && { fontSize: 18 }}>
                  <Text style={styles.nameLabelAI}>NeedAI: </Text>
                  What type of help do you need:
                </Text>
                <View style={styles.helpGrid}>
                  {HELP_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat.label}
                      style={styles.helpCategoryBtn}
                      onPress={() => handleHelpCategorySelect(cat)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.helpCategoryEmoji}>{cat.emoji}</Text>
                      <Text style={styles.helpCategoryLabel}>{cat.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.helpOrText}>Or tell me what you need help with?</Text>
              </View>
            )}

            {msg.user && (
              <View style={[styles.bubble, styles.userBubble]}>
                <Text style={IS_WEB && { fontSize: 18 }}>
                  <Text style={styles.nameLabelUser}>You: </Text>
                  {msg.user}
                </Text>
                {msg.media?.type === 'image' && (
                  <Image source={{ uri: msg.media.uri }} style={IS_WEB ? { width: 130, height: 130, marginTop: 13 } : { width: 100, height: 100, marginTop: 10 }} />
                )}
                {msg.media?.type === 'video' && (
                  <NeedsVideoPlayer uri={msg.media.uri} style={IS_WEB ? { width: 208, height: 130, marginTop: 13 } : { width: 160, height: 100, marginTop: 10 }} contentFit="cover" />
                )}
              </View>
            )}

            {msg.ai && (
              <View style={[styles.bubble, styles.aiBubble]}>
                {/* Handle both plain string and JSX element (fundraiser steps use JSX) */}
                {typeof msg.ai === 'string' ? (
                  <Text style={IS_WEB && { fontSize: 18 }}>
                    <Text style={styles.nameLabelAI}>NeedAI: </Text>
                    {msg.ai}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    <Text style={styles.nameLabelAI}>NeedAI: </Text>
                    {msg.ai}
                  </View>
                )}

                {/* ── View Results button — appears when msg has match data ── */}
                {msg.matchData?.matches?.length > 0 && (
                  <TouchableOpacity
                    style={styles.viewResultsBtn}
                    onPress={() => navigation.navigate('MatchResults', {
                      matches: msg.matchData.matches,
                      query: msg.matchData.query,
                      type: msg.matchData.type,
                    })}
                  >
                    <Ionicons name="search-outline" size={13} color="#2563EB" />
                    <Text style={styles.viewResultsTxt}>
                      View {msg.matchData.matches.length}{' '}
                      {msg.matchData.type === 'food' ? 'Restaurant' : 'Provider'}{msg.matchData.matches.length !== 1 ? 's' : ''} →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}


          </View>
        ))}
      </ScrollView>

      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.imageButton} onPress={handleMediaPick}>
            <Image source={require('../assets/Camer Button 2.png')} style={[styles.cameraButtonImage, IS_WEB && { width: 72, height: 72 }]} />
          </TouchableOpacity>

          <View style={styles.previewHolder}>
            {media && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.mediaPreview}>
                  {media.type === 'image' ? (
                    <Image source={{ uri: media.uri }} style={styles.thumbnail} />
                  ) : (
                    <NeedsVideoPlayer uri={media.uri} style={styles.thumbnail} contentFit="cover" />
                  )}
                </View>
                <TouchableOpacity onPress={() => setMedia(null)} style={{ marginLeft: 8, padding: 4 }} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <Ionicons name="close-circle" size={IS_WEB ? 34 : 26} color="black" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.arrowButton} onPress={() => sendQuery()}>
            <Image source={require('../assets/Up Arrow Button 2.png')} style={[styles.arrowButtonImage, IS_WEB && { width: 72, height: 72 }]} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.searchInput, IS_WEB && { minHeight: 52, maxHeight: 130, padding: 13, paddingHorizontal: 22, fontSize: 22 }]}
          placeholder={
            mode === 'fundraiser'
              ? fundStep === 1 ? 'Describe your fundraiser & target (e.g., "Playground rebuild $2500")'
                : 'Type "skip" or add notes while/after uploading media...'
              : awaitingDecision ? 'Type your choice...'
              : awaitingEnhancementChoice ? 'Type "Yes" or "No"...'
              : awaitingClarification ? 'Type your answer...'
              : awaitingHelpCategory ? 'Tell me what you need help with...'
              : 'Use an image or describe what you need...'
          }
          onChangeText={(text) => { wasAutoEnhancedRef.current = false; setInput(text); }}
          value={input}
          multiline
        />
      </View>
      </View>{/* end webContainer */}

      {enhancing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" />
          <Text style={styles.overlayText}>Analyzing image...</Text>
        </View>
      )}

      <Modal
        visible={authModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setAuthModalVisible(false)}
      >
        <CreateNewUser
          onLoginSuccess={() => {
            setAuthModalVisible(false);
            if (pendingQuery) {
              setInput(pendingQuery);
              setPendingQuery(null);
              setTimeout(() => sendQuery(), 300);
            }
          }}
          onCancel={() => { setAuthModalVisible(false); setPendingQuery(null); }}
        />
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', backgroundColor: 'white' },
  headingRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 11 },
  logoImage: { marginTop: 10, width: 150, height: 50 },
  chatContainer: {
    flex: 1, width: '90%', padding: IS_WEB ? 16 : 10,
    borderWidth: 2, borderColor: 'black', borderRadius: IS_WEB ? 20 : 15,
    backgroundColor: 'white', marginBottom: 5,
  },
  chatMessage: { marginBottom: IS_WEB ? 14 : 10 },
  bubble: { padding: IS_WEB ? 16 : 10, borderRadius: IS_WEB ? 20 : 15, marginVertical: IS_WEB ? 8 : 5, maxWidth: '80%' },
  userBubble: { backgroundColor: '#e6f0ff', alignSelf: 'flex-end', borderColor: '#007bff', borderWidth: 1 },
  aiBubble:  { backgroundColor: '#F5F5F5', alignSelf: 'flex-start', borderColor: '#708090', borderWidth: 1 },
  nameLabelUser: { fontWeight: 'bold', color: 'black', fontSize: IS_WEB ? 18 : 14 },
  nameLabelAI:   { fontWeight: 'bold', color: '#007bff', fontSize: IS_WEB ? 18 : 14 },

  // View Results button inside AI bubble
  viewResultsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 7 : 5,
    marginTop: IS_WEB ? 10 : 8, paddingVertical: IS_WEB ? 8 : 6, paddingHorizontal: IS_WEB ? 16 : 12,
    backgroundColor: '#EFF6FF', borderRadius: 20,
    borderWidth: 1.5, borderColor: '#BFDBFE',
    alignSelf: 'flex-start',
  },
  viewResultsTxt: { fontSize: IS_WEB ? 17 : 13, color: '#2563EB', fontWeight: '700' },

  dot: { width: IS_WEB ? 8 : 6, height: IS_WEB ? 8 : 6, borderRadius: IS_WEB ? 4 : 3, backgroundColor: '#888' },

  searchContainer: { width: '90%', flexDirection: 'column', marginBottom: 20 },
  searchRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', marginBottom: 10, overflow: 'visible',
  },
  searchInput: {
    width: '100%', minHeight: 40, maxHeight: 100, padding: 10,
    borderWidth: 1, borderColor: 'black', borderRadius: 25,
    fontSize: 16, backgroundColor: '#fff', textAlignVertical: 'top',
  },
  imageButton: {
    marginBottom: IS_WEB ? 13 : 10, marginTop: IS_WEB ? 13 : 10, alignSelf: 'flex-start',
  },
  cameraButtonImage: { width: 59, height: 59, resizeMode: 'contain' },
  arrowButton: {
    marginLeft: IS_WEB ? 13 : 10,
  },
  arrowButtonImage: { width: 59, height: 59, resizeMode: 'contain' },
  previewHolder: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'visible' },
  mediaPreview: { borderWidth: 0, borderColor: '#007bff', borderRadius: 10, padding: 2, overflow: 'visible' },
  thumbnail: { width: IS_WEB ? 170 : 130, height: IS_WEB ? 130 : 100, borderRadius: 10, borderWidth: 1, borderColor: '#007bff' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center',
  },
  overlayText: { marginTop: IS_WEB ? 13 : 10, color: '#fff', fontSize: IS_WEB ? 21 : 16, fontWeight: '600' },
  typingBubble: { flexDirection: 'row', gap: IS_WEB ? 5 : 4, paddingHorizontal: IS_WEB ? 16 : 12 },

  helpGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: IS_WEB ? 10 : 8,
    marginTop: IS_WEB ? 13 : 10, marginBottom: IS_WEB ? 8 : 6,
  },
  helpCategoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6,
    backgroundColor: '#EFF6FF', borderRadius: 20,
    borderWidth: 1.5, borderColor: '#BFDBFE',
    paddingVertical: IS_WEB ? 10 : 8, paddingHorizontal: IS_WEB ? 16 : 12,
  },
  helpCategoryEmoji: { fontSize: IS_WEB ? 21 : 16 },
  helpCategoryLabel: { fontSize: IS_WEB ? 17 : 13, fontWeight: '700', color: '#1D4ED8' },
  helpOrText: { fontSize: IS_WEB ? 18 : 14, fontWeight: '400', color: '#000', marginTop: IS_WEB ? 13 : 10 },
});
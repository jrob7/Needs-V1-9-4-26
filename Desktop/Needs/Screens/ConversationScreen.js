// Screens/ConversationScreen.js
import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, SafeAreaView, KeyboardAvoidingView,
  Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { UserContext } from '../server/CurrentUser';
import InfoRequestBubble from './InfoRequestBubble';
import QuoteBubble, { AppointmentConfirmedBubble, TimeRequestBubble, TimeCounterBubble } from './QuoteBubble';
import RespondToLeadModal from './RespondToLeadModal';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { getSocket } from '../server/socketClient';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const resolveImg = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('data:')) return uri;
  return `${NODE_API}/uploads/${uri}`;
};

const timeStr = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Typing indicator ──────────────────────────────────────────────────────────
const TypingDots = () => {
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    [[d1, 0], [d2, 200], [d3, 400]].forEach(([dot, delay]) => {
      Animated.loop(Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])).start();
    });
  }, []);

  return (
    <View style={styles.typingBubble}>
      {[d1, d2, d3].map((d, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: d }]} />
      ))}
    </View>
  );
};

// ── Submitted answers to a more-details request ──────────────────────────────
const InfoAnswerCard = ({ item, isMine, onSendQuote }) => {
  const data = item.data || {};
  const answers = data.answers || [];
  const photoUri = data.photoUrl ? resolveImg(data.photoUrl) : null;
  const videoUri = data.videoId ? `${NODE_API}/videos/${data.videoId}` : null;

  return (
    <View style={styles.infoAnswerCard}>
      <View style={styles.infoAnswerHeader}>
        <Ionicons name="clipboard" size={IS_WEB ? 18 : 14} color="#2563EB" />
        <Text style={styles.infoAnswerTitle}>More details</Text>
      </View>
      {answers.map((a, i) => (
        <View key={i} style={{ marginBottom: 6 }}>
          <Text style={styles.infoAnswerQ}>{a.question}</Text>
          <Text style={styles.infoAnswerA}>{a.answer}</Text>
        </View>
      ))}
      {photoUri && <Image source={{ uri: photoUri }} style={styles.infoAnswerMedia} />}
      {videoUri && (
        <Video source={{ uri: videoUri }} style={styles.infoAnswerMedia} useNativeControls resizeMode="cover" />
      )}
      {!isMine && onSendQuote && (
        <TouchableOpacity style={styles.sendQuoteBtn} onPress={onSendQuote}>
          <Ionicons name="document-text-outline" size={IS_WEB ? 18 : 14} color="#fff" />
          <Text style={styles.sendQuoteBtnTxt}>Send Quote</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const ConversationScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { userId } = useContext(UserContext);

  const {
    conversationId,
    recipientId,
    recipientName: paramName = '',
    recipientPic:  paramPic  = null,
    regardingTitle,
  } = route.params || {};

  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState(null);
  const flatRef         = useRef(null);
  const socketRef       = useRef(null);
  const typingTimeout   = useRef(null);

  // Resolved recipient info — fetched from server so it's always accurate
  const [resolvedName, setResolvedName] = useState(paramName || '');
  const [resolvedPic,  setResolvedPic]  = useState(paramPic  || null);

  // ── Fetch recipient details (name + photo) ───────────────────────────────
  const fetchAndSetProfile = useCallback((lookupId) => {
    if (!lookupId) return;
    fetch(`${NODE_API}/getUserDetails?userId=${lookupId}`)
      .then(r => r.json())
      .then(u => {
        const name = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || paramName || 'Unknown';
        const rawPic = u?.profilePicture || u?.profileImageUrl || null;
        setResolvedName(name);
        setResolvedPic(rawPic ? resolveImg(rawPic) : null);
      })
      .catch(e => console.log('Recipient fetch error:', e));
  }, [paramName]);

  // Initial load: fetch by recipientId so the header shows a name right away
  useEffect(() => { fetchAndSetProfile(recipientId); }, [recipientId]);

  // After messages arrive, cross-check using the actual senderId of the first
  // non-mine message. Fixes cases where recipientId navigation param is wrong.
  useEffect(() => {
    if (!messages.length || !userId) return;
    const otherMsg = messages.find(m => m.senderId?.toString() !== userId?.toString());
    if (!otherMsg?.senderId) return;
    const senderIdFromMsg = otherMsg.senderId.toString();
    if (senderIdFromMsg === recipientId) return; // already fetched the right profile
    fetchAndSetProfile(senderIdFromMsg);
  }, [messages, userId]);

  // ── Fetch messages ───────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!conversationId) { console.log('⚠️ No conversationId'); return; }
    console.log('📨 Fetching messages for conv:', conversationId);
    try {
      const url = `${NODE_API}/getMessages?conversationId=${conversationId}`;
      const r = await authFetch(url);
      const data = await r.json();
      console.log('📨 Messages result:', Array.isArray(data) ? `${data.length} messages` : data);
      if (Array.isArray(data)) setMessages(data);
    } catch (e) { console.log('Messages fetch error:', e); }
  }, [conversationId, userId]);

  useFocusEffect(useCallback(() => {
    if (!conversationId) return;
    fetchMessages();
    const earlyRecheck = setTimeout(() => fetchMessages(), 400);

    // Polling fallback — runs regardless of socket status so messages always
    // update even if the WebSocket connection fails or is slow to auth.
    let errorCount = 0;
    const pollInterval = setInterval(() => {
      if (errorCount >= 3) { clearInterval(pollInterval); return; }
      authFetch(`${NODE_API}/getMessages?conversationId=${conversationId}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) { setMessages(data); errorCount = 0; } })
        .catch(() => { errorCount++; });
    }, 6000);

    // Socket.IO — delivers messages instantly when it works.
    // If the socket is down the poll above keeps the screen live anyway.
    let mounted = true;
    (async () => {
      const s = await getSocket();
      if (!mounted) return;
      socketRef.current = s;

      s.emit('join_conversation', conversationId);

      s.on('new_message', (msg) => {
        if (msg.senderId?.toString() === userId?.toString()) return;
        setMessages(prev => [...prev, msg]);
      });

      s.on('message_updated', (update) => {
        setMessages(prev =>
          prev.map(m => m._id === update._id ? { ...m, ...update } : m)
        );
      });

      s.on('user_typing',      () => setOtherTyping(true));
      s.on('user_stop_typing', () => setOtherTyping(false));
      s.on('connect',          () => fetchMessages());
    })();

    return () => {
      mounted = false;
      clearTimeout(earlyRecheck);
      clearInterval(pollInterval);
      const s = socketRef.current;
      if (s) {
        s.emit('leave_conversation', conversationId);
        s.off('new_message');
        s.off('message_updated');
        s.off('user_typing');
        s.off('user_stop_typing');
        s.off('connect');
      }
    };
  }, [conversationId, fetchMessages, userId]));

  useEffect(() => {
    if (flatRef.current && messages.length) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // ── Typing indicator ─────────────────────────────────────────────────────
  const handleInputChange = (text) => {
    setInput(text);
    const s = socketRef.current;
    if (!s?.connected || !conversationId) return;
    s.emit('typing', conversationId);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      s.emit('stop_typing', conversationId);
    }, 2000);
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || !userId || !recipientId) return;
    setSending(true);
    setInput('');
    // Stop the typing indicator as soon as the message is sent
    clearTimeout(typingTimeout.current);
    socketRef.current?.emit('stop_typing', conversationId);

    const optimistic = {
      _id: `opt_${Date.now()}`,
      senderId: userId,
      text,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      await authFetch(`${NODE_API}/sendMessage`, {
        method: 'POST',
        body: JSON.stringify({
          recipientId,
          text,
          regardingTitle: regardingTitle || null,
        }),
      });
      await fetchMessages();
    } catch (e) {
      console.error('Send message error:', e);
    } finally {
      setSending(false);
    }
  };

  // ── Render each message ──────────────────────────────────────────────────
  const renderMessage = ({ item, index }) => {
    const isMine   = item.senderId?.toString() === userId?.toString();
    const showTime = index === messages.length - 1 ||
      messages[index + 1]?.senderId?.toString() !== item.senderId?.toString();

    // For business-originated message types, use businessName from the message
    // data as the display name — fixes cases where the user profile name is wrong.
    const BUSINESS_TYPES = ['quote', 'timeRequest', 'timeCounterSuggestion', 'appointmentConfirmed'];
    const avatarDisplayName = (!isMine && item.data?.businessName && BUSINESS_TYPES.includes(item.type))
      ? item.data.businessName
      : resolvedName;

    const avatarCol = !isMine && (
      <View style={styles.msgAvatarCol}>
        {resolvedPic
          ? <Image source={{ uri: resolvedPic }} style={styles.msgAvatarImg} />
          : <View style={[styles.msgAvatarImg, styles.msgAvatarFallback]}>
              <Text style={styles.msgAvatarInitial}>
                {(avatarDisplayName[0] || '?').toUpperCase()}
              </Text>
            </View>
        }
        {showTime && (
          <Text style={styles.msgAvatarName} numberOfLines={1}>
            {avatarDisplayName.split(' ')[0]}
          </Text>
        )}
      </View>
    );

    if (item.type === 'infoRequest') {
      return (
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {avatarCol}
          <InfoRequestBubble
            message={item}
            isMine={isMine}
            userId={userId}
            recipientId={recipientId}
            onAnswered={(updated) => setMessages(prev => prev.map(m => m._id === item._id ? updated : m))}
          />
        </View>
      );
    }

    if (item.type === 'infoAnswer') {
      return (
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {avatarCol}
          <InfoAnswerCard
            item={item}
            isMine={isMine}
            onSendQuote={() => setQuoteTarget({
              fromUserId: item.senderId?.toString(),
              needText:   regardingTitle || item.data?.regardingTitle || '',
              _id:        null,
            })}
          />
        </View>
      );
    }

    if (item.type === 'quote') {
      return (
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {avatarCol}
          <QuoteBubble
            message={item}
            isMine={isMine}
            userId={userId}
            recipientId={recipientId}
            conversationId={conversationId}
            onUpdated={(updated) => setMessages(prev => prev.map(m => m._id === item._id ? updated : m))}
          />
        </View>
      );
    }

    if (item.type === 'appointmentConfirmed') {
      return (
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {avatarCol}
          <AppointmentConfirmedBubble message={item} />
        </View>
      );
    }

    if (item.type === 'timeRequest') {
      return (
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {avatarCol}
          <TimeRequestBubble
            message={item}
            isMine={isMine}
            userId={userId}
            conversationId={conversationId}
            onUpdated={(updated) => setMessages(prev => prev.map(m => m._id === item._id ? updated : m))}
          />
        </View>
      );
    }

    if (item.type === 'timeCounterSuggestion') {
      return (
        <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
          {avatarCol}
          <TimeCounterBubble
            message={item}
            isMine={isMine}
            userId={userId}
            conversationId={conversationId}
            onUpdated={(updated) => setMessages(prev => prev.map(m => m._id === item._id ? updated : m))}
          />
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
        {avatarCol}

        <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
          <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{item.text}</Text>
          {showTime && (
            <Text style={[styles.msgTime, isMine && { textAlign: 'right' }]}>
              {timeStr(item.createdAt)}
              {isMine && <Text style={{ color: '#93C5FD' }}> ✓✓</Text>}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: IS_WEB ? '#F0F2F5' : '#fff' }}>
      <View style={IS_WEB ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1, backgroundColor: '#fff' } : { flex: 1 }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={IS_WEB ? 29 : 22} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => recipientId && navigation.navigate('ProfileView', { userId: recipientId, readOnly: true })}
        >
          {resolvedPic
            ? <Image source={{ uri: resolvedPic }} style={styles.headerAvatar} />
            : <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                <Text style={styles.headerAvatarInitial}>
                  {(resolvedName[0] || '?').toUpperCase()}
                </Text>
              </View>
          }
          <View style={styles.onlineDot} />
          <View>
            <Text style={styles.headerName}>{resolvedName || 'Loading…'}</Text>
            <Text style={styles.headerStatus}>Active now</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionBtn}>
            <Ionicons name="call-outline" size={IS_WEB ? 29 : 22} color="#2563EB" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn}>
            <Ionicons name="ellipsis-horizontal" size={IS_WEB ? 29 : 22} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Regarding banner ───────────────────────────────────── */}
      {regardingTitle && (
        <View style={styles.regardingBanner}>
          <Text style={styles.regardingTxt}>
            Regarding: <Text style={{ fontWeight: '700' }}>{regardingTitle}</Text>
          </Text>
          <TouchableOpacity>
            <Text style={styles.regardingLink}>View Request</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Messages ───────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={item => item._id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={otherTyping ? <TypingDots /> : null}
        />

        {/* ── Input bar ─────────────────────────────────────────── */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.inputPlus}>
            <Ionicons name="add" size={IS_WEB ? 34 : 26} color="#2563EB" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={handleInputChange}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity style={styles.inputEmoji}>
            <Ionicons name="happy-outline" size={IS_WEB ? 29 : 22} color="#64748B" />
          </TouchableOpacity>
          {input.trim() ? (
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
              <Ionicons name="send" size={IS_WEB ? 23 : 18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.inputEmoji}>
              <Ionicons name="mic-outline" size={IS_WEB ? 29 : 22} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
      </View>

      {quoteTarget && (
        <RespondToLeadModal
          notification={quoteTarget}
          onClose={() => setQuoteTarget(null)}
          onSent={() => {
            setQuoteTarget(null);
            fetchMessages();
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: IS_WEB ? 16 : 12,
    paddingTop: IS_WEB ? WEB_HEADER_HEIGHT + 13 : 10,
    paddingBottom: IS_WEB ? 13 : 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn:    { padding: IS_WEB ? 5 : 4, marginRight: IS_WEB ? 5 : 4 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 13 : 10, position: 'relative' },
  headerAvatar:        { width: IS_WEB ? 52 : 40, height: IS_WEB ? 52 : 40, borderRadius: IS_WEB ? 26 : 20, borderWidth: 2, borderColor: '#2563EB' },
  headerAvatarFallback:{ backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  headerAvatarInitial: { fontSize: IS_WEB ? 21 : 16, fontWeight: '900', color: '#2563EB' },
  onlineDot: {
    position: 'absolute', bottom: 0, left: IS_WEB ? 36 : 28,
    width: IS_WEB ? 14 : 11, height: IS_WEB ? 14 : 11, borderRadius: IS_WEB ? 7 : 6,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#fff', zIndex: 1,
  },
  headerName:   { fontSize: IS_WEB ? 20 : 15, fontWeight: '800', color: '#0F172A' },
  headerStatus: { fontSize: IS_WEB ? 16 : 12, color: '#22C55E', fontWeight: '500' },
  headerActions:{ flexDirection: 'row', gap: IS_WEB ? 10 : 8 },
  headerActionBtn: { padding: IS_WEB ? 8 : 6 },

  regardingBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F8FAFC', paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 13 : 10,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  regardingTxt:  { fontSize: IS_WEB ? 17 : 13, color: '#475569' },
  regardingLink: { fontSize: IS_WEB ? 17 : 13, color: '#2563EB', fontWeight: '700' },

  messagesList: { paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 16 : 12, paddingBottom: IS_WEB ? 10 : 8 },
  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', marginBottom: IS_WEB ? 5 : 4, gap: IS_WEB ? 10 : 8 },
  msgRowMine: { flexDirection: 'row-reverse' },

  msgAvatarCol:      { alignItems: 'center', width: IS_WEB ? 68 : 52, marginBottom: IS_WEB ? 5 : 4 },
  msgAvatarImg:      { width: IS_WEB ? 57 : 44, height: IS_WEB ? 57 : 44, borderRadius: IS_WEB ? 29 : 22, borderWidth: 2.5, borderColor: '#2563EB', marginBottom: IS_WEB ? 4 : 3 },
  msgAvatarFallback: { backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  msgAvatarInitial:  { fontSize: IS_WEB ? 21 : 16, fontWeight: '900', color: '#2563EB' },
  msgAvatarName:     { fontSize: IS_WEB ? 13 : 10, fontWeight: '700', color: '#0F172A', textAlign: 'center' },

  msgBubble: {
    maxWidth: '75%', paddingHorizontal: IS_WEB ? 18 : 14, paddingVertical: IS_WEB ? 13 : 10,
    borderRadius: IS_WEB ? 23 : 18, backgroundColor: '#F1F5F9',
  },
  msgBubbleOther:{ borderBottomLeftRadius: 4 },
  msgBubbleMine: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  msgText:       { fontSize: IS_WEB ? 20 : 15, color: '#0F172A', lineHeight: IS_WEB ? 27 : 21 },
  msgTextMine:   { color: '#fff' },
  msgTime:       { fontSize: IS_WEB ? 14 : 11, color: '#94A3B8', marginTop: IS_WEB ? 5 : 4 },

  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 5 : 4,
    backgroundColor: '#F1F5F9', borderRadius: IS_WEB ? 23 : 18, borderBottomLeftRadius: 4,
    paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 16 : 12,
    alignSelf: 'flex-start', marginLeft: IS_WEB ? 65 : 50, marginBottom: IS_WEB ? 10 : 8,
  },
  typingDot: { width: IS_WEB ? 10 : 8, height: IS_WEB ? 10 : 8, borderRadius: IS_WEB ? 5 : 4, backgroundColor: '#94A3B8' },

  infoAnswerCard: {
    backgroundColor: '#fff', borderRadius: IS_WEB ? 21 : 16, padding: IS_WEB ? 18 : 14,
    borderWidth: 1, borderColor: '#E2E8F0', maxWidth: '90%', marginBottom: IS_WEB ? 5 : 4,
  },
  infoAnswerHeader: { flexDirection: 'row', alignItems: 'center', gap: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 13 : 10 },
  infoAnswerTitle: { fontSize: IS_WEB ? 18 : 14, fontWeight: '800', color: '#0F172A' },
  infoAnswerQ: { fontSize: IS_WEB ? 16 : 12, color: '#94A3B8', marginBottom: IS_WEB ? 3 : 2 },
  infoAnswerA: { fontSize: IS_WEB ? 18 : 14, fontWeight: '600', color: '#0F172A' },
  infoAnswerMedia: { width: IS_WEB ? 208 : 160, height: IS_WEB ? 143 : 110, borderRadius: IS_WEB ? 13 : 10, backgroundColor: '#000', marginTop: IS_WEB ? 8 : 6 },
  sendQuoteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: IS_WEB ? 8 : 6, marginTop: IS_WEB ? 16 : 12,
    height: IS_WEB ? 52 : 40, borderRadius: IS_WEB ? 13 : 10,
    backgroundColor: '#2563EB',
  },
  sendQuoteBtnTxt: { fontSize: IS_WEB ? 17 : 13, fontWeight: '800', color: '#fff' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: IS_WEB ? 16 : 12, paddingVertical: IS_WEB ? 13 : 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#fff', gap: IS_WEB ? 10 : 8,
  },
  inputPlus:  { padding: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 3 : 2 },
  input: {
    flex: 1, backgroundColor: '#F8FAFC',
    borderRadius: IS_WEB ? 29 : 22, paddingHorizontal: IS_WEB ? 21 : 16, paddingVertical: IS_WEB ? 13 : 10,
    fontSize: IS_WEB ? 20 : 15, color: '#0F172A', maxHeight: IS_WEB ? 156 : 120,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  inputEmoji: { padding: IS_WEB ? 8 : 6, marginBottom: IS_WEB ? 3 : 2 },
  sendBtn: {
    width: IS_WEB ? 49 : 38, height: IS_WEB ? 49 : 38, borderRadius: IS_WEB ? 25 : 19,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginBottom: IS_WEB ? 3 : 2,
  },
});

export default ConversationScreen;
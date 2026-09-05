// Screens/MessagesScreen.js
import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, TextInput, SafeAreaView, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { UserContext } from '../server/CurrentUser';

import { NODE_API } from '../config';
const { width: W } = Dimensions.get('window');
const SIDEBAR_W = 220;

const FILTERS = ['Messages', 'Updates & Alerts', 'Match Notifications', 'Activity Reminders'];
const FILTER_ICONS = ['chatbubble-ellipses', 'megaphone', 'git-network', 'alarm'];
const FILTER_SUBS  = ['Your conversations', 'Important updates', 'New matches & offers', 'Tasks & follow-ups'];

const resolveImg = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('data:')) return uri;
  return `${NODE_API}/uploads/${uri}`;
};

const timeLabel = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)         return 'now';
  if (diff < 3600)       return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor(diff / 86400);
  if (days === 1)        return 'Yesterday';
  if (days < 7)         return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// ── Conversation row — EXACT Tab2 style: circle photo + name below ───────────
const ConvRow = ({ item, onPress }) => {
  const rawPic = item.other?.profilePicture;
  const pic    = resolveImg(rawPic);
  const name   = item.other?.name || 'Unknown';
  const initial = name[0]?.toUpperCase() || '?';

  return (
    <TouchableOpacity style={styles.convRow} onPress={onPress} activeOpacity={0.75}>

      {/* LEFT: circle photo + name below — exactly like Tab2 */}
      <View style={styles.convAvatarCol}>
        <View style={styles.convAvatarWrap}>
          {pic
            ? <Image source={{ uri: pic }} style={styles.convAvatarImg} />
            : <View style={[styles.convAvatarImg, styles.convAvatarFallback]}>
                <Text style={styles.convAvatarInitial}>{initial}</Text>
              </View>
          }
          <View style={styles.onlineDot} />
        </View>
        <Text style={styles.convAvatarName} numberOfLines={1}>{name}</Text>
      </View>

      {/* RIGHT: last message + time */}
      <View style={styles.convMeta}>
        <View style={styles.convTopRow}>
          <Text style={styles.convLast} numberOfLines={2}>
            {item.lastMessage || 'Start a conversation'}
          </Text>
          <Text style={styles.convTime}>{timeLabel(item.lastMessageAt)}</Text>
        </View>
        {item.regardingTitle && (
          <Text style={styles.convRegarding} numberOfLines={1}>
            Re: <Text style={{ fontWeight: '700' }}>{item.regardingTitle}</Text>
          </Text>
        )}
      </View>

      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const MessagesScreen = () => {
  const navigation = useNavigation();
  const { userId } = useContext(UserContext);

  const [conversations, setConversations] = useState([]);
  const [activeFilter, setActiveFilter] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const slideX = useRef(new Animated.Value(-SIDEBAR_W)).current;

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(`${NODE_API}/getConversations?userId=${userId}`);
      const data = await r.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch (e) { console.log('Conversations fetch error:', e); }
  }, [userId]);

  useFocusEffect(useCallback(() => { fetchConversations(); }, [fetchConversations]));

  const toggleSidebar = () => {
    const toVal = sidebarOpen ? -SIDEBAR_W : 0;
    Animated.spring(slideX, { toValue: toVal, useNativeDriver: true, bounciness: 0 }).start();
    setSidebarOpen(!sidebarOpen);
  };

  const filtered = conversations.filter(c =>
    (c.other?.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (c.lastMessage || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.screen}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={toggleSidebar} style={styles.headerBtn}>
          <Ionicons name="menu" size={26} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('NewMessage')}>
          <Ionicons name="create-outline" size={24} color="#2563EB" />
        </TouchableOpacity>
      </View>



      {/* ── Conversation list ───────────────────────────────────── */}
      {!userId ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Sign in to view messages</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>Start a conversation from a profile or need request</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item._id}
          renderItem={({ item }) => (
            <ConvRow
              item={item}
              onPress={() => navigation.navigate('Conversation', {
                conversationId: item._id,
                recipientId: item.other?._id,
                recipientName: item.other?.name,
                recipientPic: item.other?.profilePicture,
                regardingTitle: item.regardingTitle,
              })}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Sidebar overlay ────────────────────────────────────── */}
      {sidebarOpen && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={toggleSidebar}
        />
      )}

      <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideX }] }]}>
        <SafeAreaView>
          <Text style={styles.sidebarTitle}>Messages</Text>
          {FILTERS.map((label, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.sidebarRow, activeFilter === i && styles.sidebarRowActive]}
              onPress={() => { setActiveFilter(i); toggleSidebar(); }}
            >
              <View style={[styles.sidebarIcon, activeFilter === i && styles.sidebarIconActive]}>
                <Ionicons name={FILTER_ICONS[i]} size={18} color={activeFilter === i ? '#2563EB' : '#475569'} />
              </View>
              <View>
                <Text style={[styles.sidebarLabel, activeFilter === i && { color: '#2563EB' }]}>{label}</Text>
                <Text style={styles.sidebarSub}>{FILTER_SUBS[i]}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </SafeAreaView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerBtn:   { padding: 4, width: 36 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },

  // Conversation row — exact Tab2 layout
  convRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },

  // Left column: circle + name below (Tab2 exact)
  convAvatarCol:  { alignItems: 'center', width: 80, marginRight: 12 },
  convAvatarWrap: { position: 'relative', marginBottom: 5 },
  convAvatarImg:  {
    width: 62, height: 62, borderRadius: 31,
    borderWidth: 2.5, borderColor: '#2563EB',
  },
  convAvatarFallback:{ backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  convAvatarInitial: { fontSize: 24, fontWeight: '900', color: '#2563EB' },
  convAvatarName:    { fontSize: 12, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#fff',
  },

  // Right: message preview
  convMeta:     { flex: 1 },
  convTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 },
  convLast:     { fontSize: 13, color: '#334155', flex: 1 },
  convTime:     { fontSize: 11, color: '#94A3B8', marginLeft: 8, marginTop: 1 },
  convRegarding:{ fontSize: 11, color: '#64748B' },
  unreadBadge:  {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  unreadText:   { color: '#fff', fontSize: 11, fontWeight: '800' },
  separator:    { height: 1, backgroundColor: '#F1F5F9', marginLeft: 108 },

  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginTop: 16, marginBottom: 6 },
  emptySub:   { fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  // Sidebar
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 10 },
  sidebar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_W,
    backgroundColor: '#fff', zIndex: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 4, height: 0 },
    elevation: 10, paddingTop: 16,
  },
  sidebarTitle:    { fontSize: 18, fontWeight: '900', color: '#0F172A', paddingHorizontal: 16, marginBottom: 12 },
  sidebarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, marginHorizontal: 8, marginBottom: 2,
  },
  sidebarRowActive:{ backgroundColor: '#EFF6FF' },
  sidebarIcon:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  sidebarIconActive:{ backgroundColor: '#DBEAFE' },
  sidebarLabel:    { fontSize: 14, fontWeight: '700', color: '#334155' },
  sidebarSub:      { fontSize: 11, color: '#94A3B8' },
});

export default MessagesScreen;
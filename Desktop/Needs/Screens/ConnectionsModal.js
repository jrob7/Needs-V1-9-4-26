// Screens/ConnectionsModal.js
import React, { useState, useCallback, useRef, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, Alert, SafeAreaView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { UserContext } from '../server/CurrentUser';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const resolveImg = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('http')) return uri;
  if (/^[0-9a-f]{24}$/i.test(uri)) return `${NODE_API}/images/${uri}`;
  return `${NODE_API}/uploads/${uri}`;
};

const STATUS_LABEL = {
  pending:   { text: 'Pending',   color: '#F59E0B', icon: 'time-outline' },
  connected: { text: 'Connected', color: '#10B981', icon: 'checkmark-circle-outline' },
};

// ── Existing connection row ──────────────────────────────────────────────────
function ConnectionRow({ item, isMuted, onDisconnect, onToggleMute, onViewProfile, onAccept }) {
  const status = STATUS_LABEL[item.status] || STATUS_LABEL.pending;
  const avatarUri = resolveImg(item.otherPic);
  const initials = (item.otherName || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => onViewProfile(item.otherId)} activeOpacity={0.8}>
        {avatarUri
          ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
          : <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.rowInfo} onPress={() => onViewProfile(item.otherId)} activeOpacity={0.8}>
        <Text style={styles.rowName}>{item.otherName}</Text>
        <View style={styles.statusRow}>
          <Ionicons name={status.icon} size={13} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.text}
            {item.role === 'sent'     && item.status === 'pending' ? ' (you requested)' : ''}
            {item.role === 'received' && item.status === 'pending' ? ' (wants to connect)' : ''}
          </Text>
        </View>
        {isMuted && <Text style={styles.mutedLabel}>Shared needs muted</Text>}
      </TouchableOpacity>

      {item.role === 'received' && item.status === 'pending' ? (
        <>
          <TouchableOpacity
            style={{ backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginLeft: 4 }}
            onPress={() => onAccept(item)}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginLeft: 6 }}
            onPress={() => onDisconnect(item)}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 13 }}>Decline</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onToggleMute(item)} activeOpacity={0.8}>
            <Ionicons
              name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
              size={17}
              color={isMuted ? '#94A3B8' : '#2563EB'}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onDisconnect(item)} activeOpacity={0.8}>
            <Ionicons name="person-remove-outline" size={17} color="#EF4444" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── Search result row ────────────────────────────────────────────────────────
function SearchResultRow({ item, connectionStatus, onRequest, onViewProfile }) {
  const avatarUri = resolveImg(item.profilePicture);
  const displayName = item.organization || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'User';
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => onViewProfile(item._id)} activeOpacity={0.8}>
        {avatarUri
          ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
          : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: '#7C3AED' }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.rowInfo} onPress={() => onViewProfile(item._id)} activeOpacity={0.8}>
        <Text style={styles.rowName}>{displayName}</Text>
        {item.organization && (item.firstName || item.lastName) && (
          <Text style={styles.statusText}>{[item.firstName, item.lastName].filter(Boolean).join(' ')}</Text>
        )}
      </TouchableOpacity>

      {connectionStatus === 'connected' ? (
        <View style={[styles.statusChip, { backgroundColor: '#D1FAE5' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>Connected</Text>
        </View>
      ) : connectionStatus === 'pending' ? (
        <View style={[styles.statusChip, { backgroundColor: '#FEF3C7' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>Pending</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.connectBtn} onPress={() => onRequest(item)} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={14} color="#fff" />
          <Text style={styles.connectBtnText}>Connect</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function ConnectionsModal() {
  const navigation  = useNavigation();
  const { userId: currentUserId } = useContext(UserContext);

  const [connections, setConnections] = useState([]);
  const [mutedFrom, setMutedFrom]     = useState([]);
  const [loading, setLoading]         = useState(true);

  const [query, setQuery]             = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]     = useState(false);
  const searchTimer = useRef(null);

  // ── Fetch existing connections + mute settings ───────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [connRes, muteRes] = await Promise.all([
        authFetch(`${NODE_API}/connections`),
        authFetch(`${NODE_API}/muteSettings`),
      ]);
      const connData = await connRes.json();
      const muteData = await muteRes.json();
      setConnections(Array.isArray(connData) ? connData : []);
      setMutedFrom(Array.isArray(muteData?.mutedFrom) ? muteData.mutedFrom : []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // ── Search with debounce ─────────────────────────────────────────────────
  const handleSearch = (text) => {
    setQuery(text);
    clearTimeout(searchTimer.current);
    if (!text.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await authFetch(`${NODE_API}/searchUsers?q=${encodeURIComponent(text.trim())}&excludeId=${currentUserId || ''}`);
        const data = await r.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (_) { setSearchResults([]); }
      setSearching(false);
    }, 350);
  };

  // ── Derive connection status for search results ──────────────────────────
  const getConnectionStatus = (userId) => {
    const conn = connections.find(c => c.otherId === userId || c.otherId === String(userId));
    if (!conn) return 'none';
    return conn.status; // 'connected' | 'pending'
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleRequest = async (user) => {
    try {
      const r = await authFetch(`${NODE_API}/connections/request`, {
        method: 'POST',
        body: JSON.stringify({ targetId: String(user._id) }),
      });
      const data = await r.json();
      if (data.alreadyExists) {
        Alert.alert('Already sent', 'A connection request already exists with this person.');
        return;
      }
      // Add a pending entry so the button updates immediately
      setConnections(prev => [...prev, {
        _id: data.connection?._id,
        otherId: String(user._id),
        otherName: user.organization || [user.firstName, user.lastName].filter(Boolean).join(' '),
        otherPic: user.profilePicture || null,
        status: 'pending',
        role: 'sent',
      }]);
      Alert.alert('Request sent!', `${user.organization || user.firstName || 'User'} will be notified.`);
    } catch (_) {
      Alert.alert('Error', 'Could not send request. Please try again.');
    }
  };

  const handleAccept = async (item) => {
    try {
      await authFetch(`${NODE_API}/connections/accept`, {
        method: 'POST',
        body: JSON.stringify({ connectionId: String(item._id) }),
      });
      setConnections(prev => prev.map(c => String(c._id) === String(item._id) ? { ...c, status: 'connected', role: 'received' } : c));
    } catch (_) {
      Alert.alert('Error', 'Could not accept connection request.');
    }
  };

  const handleDisconnect = (item) => {
    Alert.alert(
      'Remove Connection',
      `Remove ${item.otherName} from your connections?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await authFetch(`${NODE_API}/connections/${item._id}`, { method: 'DELETE' });
              setConnections(prev => prev.filter(c => String(c._id) !== String(item._id)));
            } catch (_) {
              Alert.alert('Error', 'Could not remove connection.');
            }
          },
        },
      ]
    );
  };

  const handleToggleMute = async (item) => {
    const targetId = item.otherId;
    const wasMuted = mutedFrom.includes(targetId);
    setMutedFrom(prev => wasMuted ? prev.filter(id => id !== targetId) : [...prev, targetId]);
    try {
      await authFetch(`${NODE_API}/muteConnection/${targetId}`, { method: 'POST' });
    } catch (_) {
      setMutedFrom(prev => wasMuted ? [...prev, targetId] : prev.filter(id => id !== targetId));
      Alert.alert('Error', 'Could not update mute setting.');
    }
  };

  const handleViewProfile = (userId) => {
    navigation.navigate('ProfileView', { userId, readOnly: true });
  };

  const isSearching = query.trim().length > 0;

  return (
    <SafeAreaView style={styles.screen}>
      {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={29} color="#2563EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Connections</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people or organizations…"
          placeholderTextColor="#94A3B8"
          value={query}
          onChangeText={handleSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }}>
            <Ionicons name="close-circle" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#2563EB" />
      ) : isSearching ? (
        /* ── Search results ── */
        searching ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#2563EB" />
        ) : searchResults.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="person-outline" size={44} color="#CBD5E1" />
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={item => String(item._id)}
            renderItem={({ item }) => (
              <SearchResultRow
                item={item}
                connectionStatus={getConnectionStatus(String(item._id))}
                onRequest={handleRequest}
                onViewProfile={handleViewProfile}
              />
            )}
            contentContainerStyle={{ padding: 16 }}
          />
        )
      ) : (
        /* ── My connections list ── */
        connections.filter(c => c.status === 'connected' || c.status === 'pending').length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={54} color="#CBD5E1" />
            <Text style={styles.emptyText}>No connections yet</Text>
            <Text style={styles.emptySubText}>Search above to find and connect with people.</Text>
          </View>
        ) : (
          <FlatList
            data={connections}
            keyExtractor={item => String(item._id)}
            renderItem={({ item }) => (
              <ConnectionRow
                item={item}
                isMuted={mutedFrom.includes(item.otherId)}
                onDisconnect={handleDisconnect}
                onToggleMute={handleToggleMute}
                onViewProfile={handleViewProfile}
                onAccept={handleAccept}
              />
            )}
            contentContainerStyle={{ padding: 16 }}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#F8FAFD' },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn:        { width: 36, alignItems: 'flex-start' },
  headerTitle:    { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0F172A' },

  searchWrap:     { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput:    { flex: 1, fontSize: 15, color: '#0F172A' },

  row:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  avatar:         { width: 46, height: 46, borderRadius: 23, marginRight: 12 },
  avatarFallback: { backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontWeight: '700', fontSize: 16 },
  rowInfo:        { flex: 1 },
  rowName:        { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText:     { fontSize: 12, fontWeight: '600', color: '#64748B' },
  mutedLabel:     { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  actionBtn:      { padding: 8 },

  statusChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  connectBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  connectBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:      { fontSize: 17, fontWeight: '700', color: '#94A3B8', marginTop: 14, textAlign: 'center' },
  emptySubText:   { fontSize: 13, color: '#CBD5E1', textAlign: 'center', marginTop: 6 },
});

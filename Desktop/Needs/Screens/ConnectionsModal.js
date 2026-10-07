// Screens/ConnectionsModal.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NODE_API } from '../config';
import { authFetch } from '../server/api';
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

function ConnectionRow({ item, onDisconnect, onViewProfile, isMuted, onToggleMute }) {
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
            </View>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.rowInfo} onPress={() => onViewProfile(item.otherId)} activeOpacity={0.8}>
        <Text style={styles.rowName}>{item.otherName}</Text>
        <View style={styles.statusRow}>
          <Ionicons name={status.icon} size={13} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.text}{item.role === 'sent' && item.status === 'pending' ? ' (you requested)' : ''}
            {item.role === 'received' && item.status === 'pending' ? ' (wants to connect)' : ''}
          </Text>
        </View>
        {isMuted && (
          <Text style={styles.mutedLabel}>Shared needs muted</Text>
        )}
      </TouchableOpacity>

      {/* Mute toggle */}
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => onToggleMute(item)}
        activeOpacity={0.8}
      >
        <Ionicons
          name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
          size={17}
          color={isMuted ? '#94A3B8' : '#2563EB'}
        />
      </TouchableOpacity>

      {/* Disconnect */}
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => onDisconnect(item)}
        activeOpacity={0.8}
      >
        <Ionicons name="person-remove-outline" size={17} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );
}

export default function ConnectionsModal() {
  const navigation = useNavigation();
  const [connections, setConnections] = useState([]);
  const [mutedFrom, setMutedFrom]     = useState([]);
  const [loading, setLoading]         = useState(true);

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
    // Optimistic update
    setMutedFrom(prev => wasMuted ? prev.filter(id => id !== targetId) : [...prev, targetId]);
    try {
      await authFetch(`${NODE_API}/muteConnection/${targetId}`, { method: 'POST' });
    } catch (_) {
      // Revert on failure
      setMutedFrom(prev => wasMuted ? [...prev, targetId] : prev.filter(id => id !== targetId));
      Alert.alert('Error', 'Could not update mute setting.');
    }
  };

  const handleViewProfile = (userId) => {
    navigation.navigate('ProfileView', { userId, readOnly: true });
  };

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

      {loading
        ? <ActivityIndicator style={{ marginTop: 40 }} color="#2563EB" />
        : connections.length === 0
          ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={54} color="#CBD5E1" />
              <Text style={styles.emptyText}>No connections yet</Text>
              <Text style={styles.emptySubText}>Visit someone's profile to send a connection request.</Text>
            </View>
          )
          : (
            <FlatList
              data={connections}
              keyExtractor={item => String(item._id)}
              renderItem={({ item }) => (
                <ConnectionRow
                  item={item}
                  onDisconnect={handleDisconnect}
                  onViewProfile={handleViewProfile}
                  isMuted={mutedFrom.includes(item.otherId)}
                  onToggleMute={handleToggleMute}
                />
              )}
              contentContainerStyle={{ padding: 16 }}
            />
          )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#F8FAFD' },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn:        { width: 36, alignItems: 'flex-start' },
  headerTitle:    { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0F172A' },

  row:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  avatar:         { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarFallback: { backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontWeight: '700', fontSize: 17 },
  rowInfo:        { flex: 1 },
  rowName:        { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText:     { fontSize: 12, fontWeight: '600' },
  mutedLabel:     { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  actionBtn:      { padding: 8 },

  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:      { fontSize: 17, fontWeight: '700', color: '#94A3B8', marginTop: 14 },
  emptySubText:   { fontSize: 13, color: '#CBD5E1', textAlign: 'center', marginTop: 6 },
});

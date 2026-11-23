// Screens/ConnectedAiScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, SafeAreaView, Alert, Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const SCOPE_LABELS = {
  search:   'Search businesses',
  request:  'Create requests & questions',
  read:     'Read your conversations',
  respond:  'Respond to businesses',
  schedule: 'Schedule appointments',
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function ConnectedAiScreen() {
  const navigation = useNavigation();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [revokingId, setRevokingId]   = useState(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await authFetch(`${NODE_API}/connectedAi`);
      const data = await res.json();
      if (!data.error) setConnections(data.connections || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchConnections(); }, [fetchConnections]));

  const mcpUrl = `${NODE_API}/mcp/account`;

  const handleDisconnect = (conn) => {
    Alert.alert(
      'Disconnect this AI?',
      `${conn.clientName} will immediately lose access to your Needs account. Reconnecting later starts a fresh approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setRevokingId(conn.clientId);
            try {
              await authFetch(`${NODE_API}/connectedAi/${encodeURIComponent(conn.clientId)}/revoke`, { method: 'POST' });
              setConnections(prev => prev.filter(c => c.clientId !== conn.clientId));
            } catch (_) {
              Alert.alert('Error', "Couldn't disconnect. Please try again.");
            }
            setRevokingId(null);
          },
        },
      ]
    );
  };

  const active = connections.filter(c => !c.revoked);

  return (
    <SafeAreaView style={styles.screen}>
      {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={29} color="#2563EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connected AI</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.connectCard}>
          <Text style={styles.connectTitle}>Connect ChatGPT, Claude, or another AI</Text>
          <Text style={styles.connectDesc}>
            In your AI's settings, add a custom connector and paste this address. You'll be asked to sign in to your Needs account to finish connecting.
          </Text>
          <View style={styles.urlRow}>
            <Text style={styles.urlText} numberOfLines={1} ellipsizeMode="middle">{mcpUrl}</Text>
          </View>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => {
              Clipboard.setString(mcpUrl);
              Alert.alert('Copied!', "Paste this into your AI's connector settings.");
            }}
          >
            <Ionicons name="copy-outline" size={16} color="#2563EB" />
            <Text style={styles.copyBtnText}>Copy Address</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>YOUR CONNECTIONS</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#2563EB" />
        ) : active.length === 0 ? (
          <Text style={styles.emptyText}>No AI assistants connected yet.</Text>
        ) : (
          active.map((conn) => {
            const statusInfo = conn.suspended
              ? { label: 'Suspended', bg: '#FEE2E2', color: '#DC2626' }
              : conn.needsReverification
              ? { label: 'Needs re-verification', bg: '#FEF3C7', color: '#B45309' }
              : { label: 'Active', bg: '#D1FAE5', color: '#059669' };

            return (
              <View key={conn.clientId} style={styles.connCard}>
                <View style={styles.connHeader}>
                  <Text style={styles.connName} numberOfLines={1}>{conn.clientName}</Text>
                  <View style={[styles.statusChip, { backgroundColor: statusInfo.bg }]}>
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                  </View>
                </View>

                <Text style={styles.connMeta}>
                  Connected {conn.grantedAt ? new Date(conn.grantedAt).toLocaleDateString() : ''}
                  {conn.lastVerifiedAt ? ` · Last verified ${timeAgo(conn.lastVerifiedAt)}` : ''}
                </Text>

                {(conn.scopes || []).length > 0 && (
                  <View style={styles.scopeRow}>
                    {conn.scopes.map(s => (
                      <View key={s} style={styles.scopeChip}>
                        <Text style={styles.scopeChipText}>{SCOPE_LABELS[s] || s}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {conn.recentActivity?.length > 0 && (
                  <View style={styles.activityBox}>
                    <Text style={styles.activityLabel}>Recent activity</Text>
                    {conn.recentActivity.slice(0, 5).map((a, i) => (
                      <View key={i} style={styles.activityRow}>
                        <Ionicons
                          name={a.outcome === 'success' ? 'checkmark-circle' : a.outcome === 'denied' ? 'ban' : 'alert-circle'}
                          size={13}
                          color={a.outcome === 'success' ? '#059669' : a.outcome === 'denied' ? '#94A3B8' : '#DC2626'}
                        />
                        <Text style={styles.activityText} numberOfLines={1}>{a.tool}</Text>
                        <Text style={styles.activityTime}>{timeAgo(a.at)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => handleDisconnect(conn)}
                  disabled={revokingId === conn.clientId}
                >
                  {revokingId === conn.clientId
                    ? <ActivityIndicator size="small" color="#DC2626" />
                    : <Text style={styles.disconnectBtnText}>Disconnect</Text>}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#F8FAFD' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn:     { width: 36, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0F172A' },

  body: { flex: 1, padding: 20 },

  connectCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  connectTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  connectDesc:  { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 12 },
  urlRow:       { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  urlText:      { fontSize: 12, color: '#334155' },
  copyBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#2563EB', borderRadius: 10, paddingVertical: 10 },
  copyBtnText:  { fontSize: 13, fontWeight: '700', color: '#2563EB' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 10 },
  emptyText:    { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },

  connCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  connHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  connName:     { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  statusChip:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: '700' },
  connMeta:     { fontSize: 12, color: '#94A3B8', marginBottom: 10 },

  scopeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  scopeChip:      { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  scopeChipText:  { fontSize: 11, fontWeight: '600', color: '#2563EB' },

  activityBox:    { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 10 },
  activityLabel:  { fontSize: 11, fontWeight: '700', color: '#94A3B8', marginBottom: 6 },
  activityRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  activityText:   { fontSize: 12, color: '#334155', flex: 1 },
  activityTime:   { fontSize: 11, color: '#94A3B8' },

  disconnectBtn:      { alignSelf: 'flex-start', borderWidth: 1.5, borderColor: '#FEE2E2', backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  disconnectBtnText:  { fontSize: 13, fontWeight: '700', color: '#DC2626' },
});

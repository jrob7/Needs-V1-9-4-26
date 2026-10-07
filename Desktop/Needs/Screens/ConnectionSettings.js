// Screens/ConnectionSettings.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Switch, ActivityIndicator,
  SafeAreaView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const TOGGLES = [
  { key: 'services',     icon: 'construct-outline',   label: 'Services',     desc: 'Prioritize your connections when matching service needs.' },
  { key: 'restaurants',  icon: 'restaurant-outline',  label: 'Restaurants',  desc: 'Prioritize your connections when finding restaurant matches.' },
  { key: 'nonprofits',   icon: 'heart-outline',       label: 'Nonprofits',   desc: 'Prioritize your connections when matching nonprofit needs.' },
];

export default function ConnectionSettings() {
  const navigation = useNavigation();
  const [prefs, setPrefs]       = useState({ services: true, restaurants: true, nonprofits: true });
  const [mutedAll, setMutedAll] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      const [prefRes, muteRes] = await Promise.all([
        authFetch(`${NODE_API}/connectionPreferences`),
        authFetch(`${NODE_API}/muteSettings`),
      ]);
      const prefData = await prefRes.json();
      const muteData = await muteRes.json();
      if (!prefData.error) setPrefs(prefData);
      setMutedAll(!!muteData?.mutedAll);
    } catch (_) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchPrefs(); }, [fetchPrefs]));

  const toggle = async (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
    try {
      await authFetch(`${NODE_API}/connectionPreferences`, {
        method: 'POST',
        body: JSON.stringify(updated),
      });
    } catch (_) {}
    setSaving(false);
  };

  const toggleMuteAll = async (value) => {
    setMutedAll(value);
    try {
      await authFetch(`${NODE_API}/muteSettings`, {
        method: 'POST',
        body: JSON.stringify({ mutedAll: value }),
      });
    } catch (_) {
      setMutedAll(!value);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      {IS_WEB && <View style={{ height: WEB_HEADER_HEIGHT }} />}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={29} color="#2563EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connection Preferences</Text>
        <View style={{ width: 36 }}>
          {saving && <ActivityIndicator size="small" color="#2563EB" />}
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionNote}>
          When enabled, your connections are ranked higher in search results for that category. Results look the same — connections just appear earlier when they're a good match.
        </Text>

        {loading
          ? <ActivityIndicator style={{ marginTop: 32 }} color="#2563EB" />
          : <>
              {TOGGLES.map(({ key, icon, label, desc }) => (
                <View key={key} style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: prefs[key] ? '#EFF6FF' : '#F1F5F9' }]}>
                    <Ionicons name={icon} size={20} color={prefs[key] ? '#2563EB' : '#94A3B8'} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{label}</Text>
                    <Text style={styles.rowDesc}>{desc}</Text>
                  </View>
                  <Switch
                    value={!!prefs[key]}
                    onValueChange={v => toggle(key, v)}
                    trackColor={{ false: '#E2E8F0', true: '#2563EB' }}
                    thumbColor="#fff"
                  />
                </View>
              ))}

              <Text style={[styles.sectionNote, { marginTop: 24 }]}>
                Shared Need Requests
              </Text>

              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: mutedAll ? '#FEF2F2' : '#F1F5F9' }]}>
                  <Ionicons name="notifications-off-outline" size={20} color={mutedAll ? '#EF4444' : '#94A3B8'} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Mute all shared needs</Text>
                  <Text style={styles.rowDesc}>
                    Stop seeing needs that connections have shared with you. You can also mute individual connections in My Connections.
                  </Text>
                </View>
                <Switch
                  value={!!mutedAll}
                  onValueChange={toggleMuteAll}
                  trackColor={{ false: '#E2E8F0', true: '#EF4444' }}
                  thumbColor="#fff"
                />
              </View>
            </>
        }
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#F8FAFD' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn:     { width: 36, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0F172A' },

  body:        { padding: 20 },
  sectionNote: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 20, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },

  row:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  iconWrap:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowText:     { flex: 1, marginRight: 10 },
  rowLabel:    { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  rowDesc:     { fontSize: 12, color: '#64748B', lineHeight: 17 },
});

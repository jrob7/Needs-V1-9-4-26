// Screens/NewMessageScreen.js
import React, { useState, useContext, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  TouchableOpacity, Image, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { UserContext } from '../server/CurrentUser';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

const resolveImg = (uri) => {
  if (!uri) return null;
  if (uri.startsWith('http') || uri.startsWith('data:')) return uri;
  return `${NODE_API}/uploads/${uri}`;
};

const NewMessageScreen = () => {
  const navigation = useNavigation();
  const { userId } = useContext(UserContext);

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(null);

  const searchUsers = useCallback(async (text) => {
    setQuery(text);
    if (!text.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`${NODE_API}/searchUsers?q=${encodeURIComponent(text)}&excludeId=${userId}`);
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('User search error:', e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleStartConversation = async (recipient) => {
    if (!userId || !recipient._id) return;
    setStarting(recipient._id);
    try {
      const r = await authFetch(`${NODE_API}/startConversation`, {
        method: 'POST',
        body: JSON.stringify({ recipientId: recipient._id }),
      });
      const data = await r.json();
      if (!r.ok) {
        Alert.alert('Error', data?.error || 'Could not start conversation.');
        return;
      }
      if (data.conversationId) {
        navigation.navigate('Conversation', {
          conversationId: data.conversationId,
          recipientId: recipient._id,
          recipientName: [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || 'Unknown',
          recipientPic: recipient.profilePicture || null,
        });
      }
    } catch (e) {
      console.error('Start conversation error:', e);
      Alert.alert('Error', 'Could not open conversation. Please try again.');
    } finally {
      setStarting(null);
    }
  };

  const renderUser = ({ item }) => {
    const name = [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Unknown';
    const pic  = resolveImg(item.profilePicture || item.profileImageUrl);
    const isStarting = starting === item._id;

    return (
      <TouchableOpacity
        style={styles.userRow}
        onPress={() => handleStartConversation(item)}
        activeOpacity={0.75}
        disabled={!!starting}
      >
        <View style={styles.userAvatar}>
          {pic
            ? <Image source={{ uri: pic }} style={styles.userAvatarImg} />
            : <View style={[styles.userAvatarImg, styles.userAvatarFallback]}>
                <Text style={styles.userAvatarInitial}>{(name[0] || '?').toUpperCase()}</Text>
              </View>
          }
        </View>
        <View style={styles.userMeta}>
          <Text style={styles.userName}>{name}</Text>
          {item.memberSince && (
            <Text style={styles.userSub}>Member since {item.memberSince}</Text>
          )}
        </View>
        {isStarting
          ? <ActivityIndicator size="small" color="#2563EB" />
          : <Ionicons name="chevron-forward" size={IS_WEB ? 22 : 18} color="#CBD5E1" />
        }
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={IS_WEB ? styles.webContainer : { flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Message</Text>
          <View style={{ width: IS_WEB ? 80 : 60 }} />
        </View>

        {/* Search input */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={IS_WEB ? 20 : 16} color="#94A3B8" style={{ marginRight: IS_WEB ? 12 : 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name..."
              placeholderTextColor="#94A3B8"
              value={query}
              onChangeText={searchUsers}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                <Ionicons name="close-circle" size={IS_WEB ? 22 : 18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : query.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="person-add-outline" size={IS_WEB ? 72 : 56} color="#CBD5E1" />
            <Text style={styles.hintTitle}>Find someone to message</Text>
            <Text style={styles.hintSub}>Search by first name, last name, or email</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={IS_WEB ? 72 : 56} color="#CBD5E1" />
            <Text style={styles.hintTitle}>No users found</Text>
            <Text style={styles.hintSub}>Try a different name or spelling</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item._id}
            renderItem={renderUser}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  webContainer: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    flex: 1,
    paddingTop: WEB_HEADER_HEIGHT,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_WEB ? 24 : 16,
    paddingVertical: IS_WEB ? 18 : 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  cancelBtn:   { width: IS_WEB ? 80 : 60 },
  cancelTxt:   { fontSize: IS_WEB ? 19 : 16, color: '#2563EB', fontWeight: '600' },
  headerTitle: { fontSize: IS_WEB ? 22 : 17, fontWeight: '800', color: '#0F172A' },

  searchWrap: {
    paddingHorizontal: IS_WEB ? 24 : 12,
    paddingVertical: IS_WEB ? 16 : 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F5F9', borderRadius: IS_WEB ? 14 : 12,
    paddingHorizontal: IS_WEB ? 18 : 12,
    paddingVertical: IS_WEB ? 16 : 10,
  },
  searchInput: {
    flex: 1,
    fontSize: IS_WEB ? 19 : 15,
    color: '#0F172A',
  },

  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: IS_WEB ? 24 : 16,
    paddingVertical: IS_WEB ? 18 : 14,
    gap: IS_WEB ? 16 : 12,
  },
  userAvatar:        { position: 'relative' },
  userAvatarImg:     { width: IS_WEB ? 62 : 50, height: IS_WEB ? 62 : 50, borderRadius: IS_WEB ? 31 : 25 },
  userAvatarFallback:{ backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  userAvatarInitial: { fontSize: IS_WEB ? 24 : 20, fontWeight: '900', color: '#2563EB' },
  userMeta:    { flex: 1 },
  userName:    { fontSize: IS_WEB ? 19 : 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  userSub:     { fontSize: IS_WEB ? 14 : 12, color: '#94A3B8' },
  sep:         { height: 1, backgroundColor: '#F1F5F9', marginLeft: IS_WEB ? 102 : 78 },

  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: IS_WEB ? 52 : 40 },
  hintTitle: { fontSize: IS_WEB ? 22 : 18, fontWeight: '700', color: '#334155', marginTop: IS_WEB ? 18 : 14, marginBottom: IS_WEB ? 8 : 6 },
  hintSub:   { fontSize: IS_WEB ? 17 : 14, color: '#94A3B8', textAlign: 'center' },
});

export default NewMessageScreen;

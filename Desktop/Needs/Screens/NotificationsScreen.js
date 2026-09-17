// Screens/NotificationsScreen.js
import React, { useState, useCallback, useContext, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Image, ActivityIndicator, ScrollView, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { UserContext } from '../server/CurrentUser';
import RespondToLeadModal from './RespondToLeadModal';

import { NODE_API, FLASK_API } from '../config';
import { IS_WEB, IS_MOBILE_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

// On mobile web use the same compact sizing as native — desktop web gets the larger values.
const W = IS_WEB && !IS_MOBILE_WEB;
import { authFetch } from '../server/api';

const resolveImg = (uri) => {
  if (!uri) return null;
  return uri.startsWith('http') ? uri : `${NODE_API}/uploads/${uri}`;
};

const NOTIF_ICONS = {
  message:     { name: 'chatbubble',        color: '#2563EB', bg: '#EFF6FF' },
  match:       { name: 'git-network',       color: '#8B5CF6', bg: '#F5F3FF' },
  lead:        { name: 'briefcase',         color: '#2563EB', bg: '#EFF6FF' },
  activity:    { name: 'flash',             color: '#F59E0B', bg: '#FFFBEB' },
  update:      { name: 'megaphone',         color: '#10B981', bg: '#ECFDF5' },
  transaction: { name: 'cash',             color: '#10B981', bg: '#ECFDF5' },
  default:     { name: 'notifications',    color: '#64748B', bg: '#F1F5F9' },
};

const timeLabel = (d) => {
  if (!d) return '';
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const NotifRow = ({ item, onPress }) => {
  const cfg = NOTIF_ICONS[item.type] || NOTIF_ICONS.default;
  const isMessage = item.type === 'message';

  // For message notifications, show sender's profile picture
  const [senderPic, setSenderPic] = React.useState(null);
  const [senderInitial, setSenderInitial] = React.useState('?');
  const [senderName, setSenderName] = React.useState('');

  React.useEffect(() => {
    if (isMessage && item.fromUserId) {
      fetch(`${NODE_API}/getUserDetails?userId=${item.fromUserId}`)
        .then(r => r.json())
        .then(u => {
          const pic = u?.profilePicture || u?.profileImageUrl;
          const name = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || '';
          setSenderPic(pic ? resolveImg(pic) : null);
          setSenderInitial((name[0] || '?').toUpperCase());
          setSenderName(name);
        })
        .catch(() => {});
    }
  }, [item.fromUserId]);

  return (
    <TouchableOpacity
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Show profile circle for messages, icon for everything else */}
      {isMessage ? (
        <View style={styles.avatarWrap}>
          {senderPic
            ? <Image source={{ uri: senderPic }} style={styles.avatarImg} />
            : <View style={[styles.avatarImg, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{senderInitial}</Text>
              </View>
          }
          <Text style={styles.avatarName} numberOfLines={1}>{senderName}</Text>
        </View>
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.name} size={W ? 26 : 20} color={cfg.color} />
        </View>
      )}

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {isMessage ? 'New Message' : (item.title || 'Notification')}
          </Text>
          <Text style={styles.rowTime}>{timeLabel(item.createdAt)}</Text>
        </View>
        <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
};

// A lead — fired when a requester taps "Notify Now" on this business —
// shows the request like a normal notification, plus Respond /
// Request More Information actions.
const LeadNotifRow = ({ item, onRespond, onRequestMoreInfo, requestingInfo }) => {
  const cfg = NOTIF_ICONS.lead;
  const pic = item.fromPic ? resolveImg(item.fromPic) : null;
  const infoRequested = !!item.infoRequested;
  return (
    <View style={[styles.row, !item.read && styles.rowUnread, { alignItems: 'flex-start' }]}>
      {pic
        ? <Image source={{ uri: pic }} style={styles.leadAvatarImg} />
        : item.fromName
          ? <View style={[styles.leadAvatarImg, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{item.fromName[0].toUpperCase()}</Text>
            </View>
          : <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.name} size={W ? 26 : 20} color={cfg.color} />
            </View>
      }
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title || 'New service request'}</Text>
          <Text style={styles.rowTime}>{timeLabel(item.createdAt)}</Text>
        </View>
        <Text style={styles.rowBody}>{item.body}</Text>
        <View style={styles.leadButtonsRow}>
          <TouchableOpacity style={styles.respondBtn} onPress={() => onRespond(item)}>
            <Text style={styles.respondBtnText}>Respond</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.requestInfoBtn, infoRequested && styles.requestInfoBtnDone]}
            onPress={() => onRequestMoreInfo(item)}
            disabled={infoRequested || requestingInfo}
          >
            <Text style={[styles.requestInfoBtnText, infoRequested && styles.requestInfoBtnTextDone]}>
              {requestingInfo ? 'Requesting...' : infoRequested ? 'More Information requested' : 'Request More Information'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </View>
  );
};

const ActivityRow = ({ need, onPress, onArchive }) => (
  <TouchableOpacity style={styles.activityRow} onPress={onPress} activeOpacity={0.75}>
    <View style={{ flex: 1 }}>
      <Text style={styles.activityRowTitle} numberOfLines={1}>{need.searchText || 'Untitled need'}</Text>
      <Text style={styles.activityRowDate}>{timeLabel(need.date)}</Text>
    </View>
    {onArchive && (
      <TouchableOpacity
        onPress={onArchive}
        style={styles.activityArchiveBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="archive-outline" size={W ? 23 : 18} color="#94A3B8" />
      </TouchableOpacity>
    )}
  </TouchableOpacity>
);

const ActivitySection = ({ title, icon, color, needs, onPressNeed, onArchive }) => {
  const [open, setOpen] = useState(true);
  const rot = React.useRef(new Animated.Value(1)).current;

  const toggle = () => {
    Animated.timing(rot, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start();
    setOpen(v => !v);
  };

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={styles.activitySection}>
      <TouchableOpacity style={styles.activitySectionHeader} onPress={toggle} activeOpacity={0.7}>
        <Ionicons name={icon} size={W ? 21 : 16} color={color} />
        <Text style={styles.activitySectionTitle}>{title}</Text>
        <Text style={styles.activitySectionCount}>{needs.length}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-forward" size={W ? 18 : 14} color="#CBD5E1" />
        </Animated.View>
      </TouchableOpacity>
      {open && (
        needs.length === 0 ? (
          <Text style={styles.activityEmptyText}>Nothing here yet</Text>
        ) : (
          needs.map(n => (
            <ActivityRow
              key={n._id}
              need={n}
              onPress={() => onPressNeed(n)}
              onArchive={onArchive ? () => onArchive(n._id) : null}
            />
          ))
        )
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SchedulerCard — shows the OTHER party's photo + name on each appointment.
//   Business viewing their schedule → shows the customer who booked.
//   Customer viewing their schedule → shows the business name + logo.
// ─────────────────────────────────────────────────────────────────────────────
const SchedulerCard = ({ apt, currentUserId }) => {
  const isProvider = apt.serviceUserId === currentUserId;
  const otherUserId = isProvider ? apt.requesterId : apt.serviceUserId;

  const [otherName, setOtherName] = useState(isProvider ? null : apt.businessName);
  const [otherPic,  setOtherPic]  = useState(null);

  useEffect(() => {
    if (!otherUserId) return;
    fetch(`${NODE_API}/getUserDetails?userId=${otherUserId}`)
      .then(r => r.json())
      .then(u => {
        const name = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || (isProvider ? 'Customer' : apt.businessName);
        const rawPic = u?.profilePicture || u?.profileImageUrl || null;
        setOtherName(name);
        setOtherPic(rawPic ? (rawPic.startsWith('http') ? rawPic : `${NODE_API}/uploads/${rawPic}`) : null);
      })
      .catch(() => {});
  }, [otherUserId]);

  const statusColors = {
    confirmed: { bg: '#DCFCE7', text: '#16A34A' },
    completed: { bg: '#EFF6FF', text: '#2563EB' },
    cancelled: { bg: '#FEE2E2', text: '#DC2626' },
    default:   { bg: '#FFF7ED', text: '#EA580C' },
  };
  const sc = statusColors[apt.status] || statusColors.default;
  const initial = (otherName || '?')[0].toUpperCase();

  return (
    <View style={[styles.aptCard, apt.status === 'cancelled' && styles.aptCardCancelled]}>
      {/* Status + date/time row */}
      <View style={styles.aptHeader}>
        <View style={[styles.aptStatusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.aptStatusText, { color: sc.text }]}>
            {(apt.status || 'proposed').charAt(0).toUpperCase() + (apt.status || 'proposed').slice(1)}
          </Text>
        </View>
        <Text style={styles.aptTime}>{apt.date}{apt.time ? ` · ${apt.time}` : ''}</Text>
      </View>

      {/* Other party avatar + name */}
      <View style={styles.aptPartyRow}>
        {otherPic
          ? <Image source={{ uri: otherPic }} style={styles.aptAvatar} />
          : <View style={[styles.aptAvatar, styles.aptAvatarFallback]}>
              <Text style={styles.aptAvatarInitial}>{initial}</Text>
            </View>
        }
        <View style={{ flex: 1 }}>
          <Text style={styles.aptPartyLabel}>{isProvider ? 'Customer' : 'Service Provider'}</Text>
          <Text style={styles.aptBusiness} numberOfLines={1}>{otherName || '…'}</Text>
        </View>
      </View>

      {/* Need text, price, address */}
      {apt.needText && <Text style={styles.aptNeed} numberOfLines={2}>{apt.needText}</Text>}
      {apt.price    && <Text style={styles.aptPrice}>Quote: ${apt.price}</Text>}
      {apt.address  && (
        <View style={styles.aptAddressRow}>
          <Ionicons name="location-outline" size={W ? 17 : 13} color="#64748B" />
          <Text style={styles.aptAddressTxt}>{apt.address}</Text>
        </View>
      )}
    </View>
  );
};

const NotificationsScreen = () => {
  const navigation = useNavigation();
  const { userId } = useContext(UserContext);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('Messages');
  const [myNeeds, setMyNeeds] = useState([]);
  const [myTransactions, setMyTransactions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [respondTarget, setRespondTarget] = useState(null);
  const [requestingInfoIds, setRequestingInfoIds] = useState(new Set());

  const TABS = ['Messages', 'Matches', 'Scheduler', 'Status'];

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await authFetch(`${NODE_API}/getNotifications?limit=50`);
      const data = await r.json();
      if (Array.isArray(data)) setNotifications(data);
    } catch (e) { console.log('Notifications fetch error:', e); }
  }, [userId]);

  const fetchActivity = useCallback(async () => {
    if (!userId) return;
    try {
      const [needsRes, txRes] = await Promise.all([
        authFetch(`${NODE_API}/myNeedRequests`),
        authFetch(`${NODE_API}/transactions`),
      ]);
      const needsData = await needsRes.json();
      const txData = await txRes.json();
      setMyNeeds(Array.isArray(needsData) ? needsData : []);
      setMyTransactions(Array.isArray(txData) ? txData : []);
    } catch (e) { console.log('Activity fetch error:', e); }
  }, [userId]);

  const fetchAppointments = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await authFetch(`${NODE_API}/appointments`);
      const data = await r.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch (e) { console.log('Appointments fetch error:', e); }
  }, [userId]);

  const checkScheduledNotifications = async () => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      if (all.length === 0) {
        Alert.alert('No scheduled notifications', 'Nothing is queued. The reminder was either never scheduled or already fired.');
        return;
      }
      const lines = all.map(n => {
        const trigger = n.trigger;
        const fireDate = trigger?.value
          ? new Date(trigger.value).toLocaleString()
          : trigger?.dateComponents
            ? JSON.stringify(trigger.dateComponents)
            : 'unknown trigger';
        return `• ${n.content.title}\n  Fires: ${fireDate}`;
      });
      Alert.alert(`${all.length} scheduled notification(s)`, lines.join('\n\n'));
    } catch (e) {
      Alert.alert('Error', e?.message);
    }
  };

  const [testSent, setTestSent] = useState(false);
  const runNotificationTest = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: s2 } = await Notifications.requestPermissionsAsync();
        if (s2 !== 'granted') {
          Alert.alert('Permission denied', 'Enable notifications in iOS Settings to test.');
          return;
        }
      }
      const triggerDate = new Date(Date.now() + 10 * 1000); // 10 seconds from now
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📅 Appointment Reminder (TEST)',
          body:  'This is a test — the real reminder fires 2 hours before your appointment.',
          data:  { type: 'appointmentReminder', test: true },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      console.log('🧪 Test notification scheduled, id:', id, 'fires at:', triggerDate.toLocaleTimeString());
      setTestSent(true);
      setTimeout(() => setTestSent(false), 15000);
      Alert.alert('Test scheduled', 'A notification will appear in 10 seconds.\n\nIf it shows up, the system is working correctly.');
    } catch (e) {
      console.log('Test notification error:', e);
      Alert.alert('Error', `Could not schedule test: ${e?.message}`);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchNotifications();
    fetchActivity();
    fetchAppointments();
  }, [fetchNotifications, fetchActivity, fetchAppointments]));

  const handleArchive = async (needId) => {
    setMyNeeds(prev => prev.map(n => n._id === needId ? { ...n, archived: true } : n));
    try {
      await authFetch(`${NODE_API}/needRequests/${needId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      });
    } catch (e) { console.log('Archive failed:', e); }
  };

  const handleNeedPress = (need) => {
    navigation.navigate('SingleItemView', { item: need });
  };

  const markAllRead = async () => {
    if (!userId) return;
    try {
      await authFetch(`${NODE_API}/markNotificationsRead`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {}
  };

  const handleNotifPress = (item) => {
    // Mark read
    setNotifications(prev => prev.map(n => n._id === item._id ? { ...n, read: true } : n));
    authFetch(`${NODE_API}/markNotificationsRead`, {
      method: 'POST',
      body: JSON.stringify({ notificationIds: [item._id] }),
    }).catch(() => {});

    // Navigate based on type
    if (item.type === 'message' && item.conversationId) {
      navigation.navigate('Conversation', {
        conversationId: String(item.conversationId),
        recipientId:    String(item.fromUserId),
        recipientName:  item.title !== 'New Message' ? item.title : undefined,
      });
    } else if (item.type === 'match' && item.needId) {
      // Navigate to Fill Needs tab, scroll to the need, and open its matches modal
      console.log('🔔 Match notification tapped — navigating to needId:', item.needId);
      navigation.navigate('Fill Needs', {
        screen: 'NeedInquiryView',
        params: {
          scrollToNeedId: String(item.needId),
          openMatchModal:  String(item.needId), // signals Tab2 to open the modal for this need
        },
      });
    }
  };

  const handleRespond = (item) => setRespondTarget(item);

  // Fully automated — the business just taps the button. We resolve their
  // own display name, ask the AI for the top missing-detail questions for
  // this category/request, and send the resulting interactive card straight
  // into the conversation with the requester. Nothing else for the business
  // to do; the button just flips to "More Information requested."
  const handleRequestMoreInfo = async (item) => {
    if (item.infoRequested || requestingInfoIds.has(item._id)) return;
    if (!item.fromUserId) { Alert.alert('Unavailable', "Can't request more info right now."); return; }

    setRequestingInfoIds(prev => new Set(prev).add(item._id));
    try {
      const [meRes, qRes] = await Promise.all([
        fetch(`${NODE_API}/getUserDetails?userId=${userId}`),
        fetch(`${FLASK_API}/ai/generateInfoRequest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: item.needText || '' }),
        }),
      ]);
      const me = await meRes.json();
      const { questions } = await qRes.json();
      const businessName = me?.displayName || [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'The business';
      const title = `${businessName} needs a few more details.`;

      const resp = await authFetch(`${NODE_API}/sendMessage`, {
        method: 'POST',
        body: JSON.stringify({
          recipientId: item.fromUserId,
          text: title,
          type: 'infoRequest',
          data: { title, questions, allowPhoto: true, allowVideo: true, answered: false },
          regardingTitle: item.needText || null,
        }),
      });
      if (!resp.ok) throw new Error('Server error');

      authFetch(`${NODE_API}/notifications/${item._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ infoRequested: true, read: true }),
      }).catch(() => {});

      setNotifications(prev => prev.map(n => n._id === item._id ? { ...n, infoRequested: true, read: true } : n));
      Alert.alert('✅ Sent', "We've asked the customer for a few more details.");
    } catch (e) {
      Alert.alert('Error', "Couldn't request more information. Please try again.");
    } finally {
      setRequestingInfoIds(prev => { const next = new Set(prev); next.delete(item._id); return next; });
    }
  };

  const filtered = notifications.filter(n => {
    if (activeTab === 'Messages') return n.type === 'message';
    if (activeTab === 'Matches')  return n.type === 'match' || n.type === 'lead';
    return true;
  });

  const unreadCount    = notifications.filter(n => !n.read).length;
  const messagesCount  = notifications.filter(n => n.type === 'message' && !n.read).length;
  const matchesCount   = notifications.filter(n => (n.type === 'match' || n.type === 'lead') && !n.read).length;
  const schedulerCount = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;
  const TAB_META = {
    Messages:  { icon: 'chatbubbles-outline', count: messagesCount },
    Matches:   { icon: 'people-outline',      count: matchesCount },
    Scheduler: { icon: 'calendar-outline',    count: schedulerCount },
    Status:    { icon: 'pulse-outline',       count: null },
  };

  // --- Activity buckets ---
  // completedAt is set when the user submits a completed review from the follow-up modal.
  // Transaction-based completedIds kept for backward compat with older data.
  const completedNeedIds = new Set(
    myTransactions.filter(t => t.status === 'completed' && t.needId).map(t => String(t.needId))
  );
  const activeNeeds    = myNeeds.filter(n => !n.archived && !completedNeedIds.has(String(n._id)));
  const completedNeeds = myNeeds.filter(n =>
    (n.archived && !!n.completedAt) ||
    (!n.archived && completedNeedIds.has(String(n._id)))
  );
  const archivedNeeds  = myNeeds.filter(n => n.archived && !n.completedAt);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={W ? { maxWidth: 960, width: '100%', alignSelf: 'center', flex: 1 } : { flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Overview</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
              <Text style={styles.markAllTxt}>Mark all read</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'Messages' && (
            <TouchableOpacity
              onPress={() => navigation.navigate('NewMessage')}
              style={styles.composeBtn}
            >
              <Ionicons name="create-outline" size={W ? 26 : 22} color="#2563EB" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => {
          const isActive = activeTab === tab;
          const { icon, count } = TAB_META[tab];
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, !W && styles.tabMobile, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <View style={styles.tabInner}>
                {W && (
                  <Ionicons name={icon} size={23} color={isActive ? '#2563EB' : '#64748B'} />
                )}
                <Text style={[styles.tabTxt, isActive && styles.tabTxtActive]}>{tab}</Text>
                {count != null && count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeTxt}>{count}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {!userId ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={W ? 78 : 60} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Sign in to view notifications</Text>
        </View>
      ) : activeTab === 'Scheduler' ? (
        <ScrollView contentContainerStyle={{ padding: W ? 21 : 16, paddingBottom: W ? 39 : 30 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.schedulerHeader}>Upcoming Appointments</Text>
          {(() => {
            const upcoming = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled');
            return upcoming.length === 0 ? (
              <View style={styles.schedEmpty}>
                <Ionicons name="calendar-outline" size={W ? 68 : 52} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No appointments yet</Text>
                <Text style={styles.emptySub}>Accepted quotes will appear here</Text>
              </View>
            ) : upcoming.map(apt => (
              <SchedulerCard key={apt._id} apt={apt} currentUserId={userId} />
            ));
          })()}

          {/* ── Notification debug ── */}
          <TouchableOpacity
            style={[styles.testNotifBtn, testSent && styles.testNotifBtnSent]}
            onPress={runNotificationTest}
            disabled={testSent}
          >
            <Ionicons name={testSent ? 'checkmark-circle' : 'notifications-outline'} size={W ? 21 : 16} color={testSent ? '#16A34A' : '#7C3AED'} />
            <Text style={[styles.testNotifTxt, testSent && { color: '#16A34A' }]}>
              {testSent ? 'Test sent — check in 10 sec' : 'Test Notification (10s)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.testNotifBtn} onPress={checkScheduledNotifications}>
            <Ionicons name="list-outline" size={W ? 21 : 16} color="#7C3AED" />
            <Text style={styles.testNotifTxt}>Show Scheduled Notifications</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : activeTab === 'Status' ? (
        <ScrollView contentContainerStyle={{ paddingTop: W ? 21 : 16, paddingBottom: W ? 26 : 20 }} showsVerticalScrollIndicator={false}>
          <ActivitySection
            title="Active Requests" icon="radio-button-on-outline" color="#2563EB"
            needs={activeNeeds} onPressNeed={handleNeedPress} onArchive={handleArchive}
          />
          <View style={styles.activitySectionDivider} />
          <ActivitySection
            title="Completed" icon="checkmark-done-outline" color="#10B981"
            needs={completedNeeds} onPressNeed={handleNeedPress} onArchive={handleArchive}
          />
          <View style={styles.activitySectionDivider} />
          <ActivitySection
            title="Archived" icon="archive-outline" color="#94A3B8"
            needs={archivedNeeds} onPressNeed={handleNeedPress}
          />
        </ScrollView>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          {activeTab === 'Messages' ? (
            <>
              <Ionicons name="chatbubble-ellipses-outline" size={W ? 78 : 60} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>You can message customers and leads directly — you don't have to wait for them to reach out first.</Text>
              <TouchableOpacity
                style={styles.newMsgBtn}
                onPress={() => navigation.navigate('NewMessage')}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.newMsgTxt}>New Message</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Ionicons name="notifications-outline" size={W ? 78 : 60} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>You'll see updates about your needs, matches, and messages here</Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item._id}
          renderItem={({ item }) => (
            item.type === 'lead'
              ? <LeadNotifRow item={item} onRespond={handleRespond} onRequestMoreInfo={handleRequestMoreInfo} requestingInfo={requestingInfoIds.has(item._id)} />
              : <NotifRow item={item} onPress={() => handleNotifPress(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {respondTarget && (
        <RespondToLeadModal
          notification={respondTarget}
          onClose={() => setRespondTarget(null)}
          onSent={(conversationData) => {
            setNotifications(prev => prev.map(n => n._id === respondTarget._id ? { ...n, read: true } : n));
            setRespondTarget(null);
            navigation.navigate('Conversation', conversationData);
          }}
        />
      )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W ? '#F8F8F8' : '#fff' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: W ? 21 : 16,
    paddingTop: W ? WEB_HEADER_HEIGHT + 18 : 14,
    paddingBottom: W ? 18 : 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: W ? 26 : 20, fontWeight: '900', color: '#2563EB' },
  markAllBtn:  { paddingVertical: 4, paddingHorizontal: W ? 13 : 10 },
  markAllTxt:  { fontSize: W ? 17 : 13, color: '#2563EB', fontWeight: '600' },
  composeBtn:  { padding: 4 },
  newMsgBtn:   {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: W ? 14 : 12, paddingHorizontal: W ? 28 : 22, marginTop: 20,
  },
  newMsgTxt:   { color: '#fff', fontSize: W ? 17 : 15, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    paddingHorizontal: W ? 16 : 0,
  },
  tab: {
    alignItems: 'center',
    paddingHorizontal: W ? 21 : 2,
    paddingTop: W ? 15 : 9,
    paddingBottom: W ? 15 : 9,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabMobile: { flex: 1 },
  tabActive:    { borderBottomColor: '#2563EB' },
  tabInner:     { flexDirection: 'row', alignItems: 'center', gap: W ? 8 : 3 },
  tabTxt:       { fontSize: W ? 18 : 11, color: '#64748B', fontWeight: '600', flexShrink: 1 },
  tabTxtActive: { color: '#2563EB', fontWeight: '700' },
  tabBadge: {
    backgroundColor: '#2563EB', borderRadius: W ? 13 : 9,
    minWidth: W ? 25 : 18, height: W ? 25 : 18,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: W ? 7 : 4,
  },
  tabBadgeTxt: { fontSize: W ? 14 : 10, fontWeight: '800', color: '#fff' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: W ? 21 : 16, paddingVertical: W ? 18 : 14, gap: W ? 16 : 12 },
  rowUnread: { backgroundColor: '#F8FAFF' },
  iconWrap:  { width: W ? 57 : 44, height: W ? 57 : 44, borderRadius: W ? 29 : 22, justifyContent: 'center', alignItems: 'center' },
  leadAvatarImg: { width: W ? 57 : 44, height: W ? 57 : 44, borderRadius: W ? 29 : 22, borderWidth: 2, borderColor: '#2563EB' },
  rowContent:{ flex: 1 },
  rowTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: W ? 5 : 3 },
  rowTitle:  { fontSize: W ? 18 : 14, fontWeight: '700', color: '#0F172A', flex: 1 },
  rowTime:   { fontSize: W ? 14 : 11, color: '#94A3B8', marginLeft: W ? 10 : 8 },
  rowBody:   { fontSize: W ? 17 : 13, color: '#475569', lineHeight: W ? 23 : 18 },
  unreadDot: { width: W ? 10 : 8, height: W ? 10 : 8, borderRadius: W ? 5 : 4, backgroundColor: '#2563EB', marginLeft: W ? 10 : 8 },
  sep:       { height: 1, backgroundColor: '#F1F5F9' },

  // Lead notification — Respond / Request More Information
  leadButtonsRow: { flexDirection: 'row', gap: W ? 13 : 10, marginTop: W ? 16 : 12 },
  respondBtn: {
    flex: 1, height: W ? 49 : 38, borderRadius: W ? 13 : 10, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  respondBtnText: { fontSize: W ? 17 : 13, fontWeight: '800', color: '#fff' },
  requestInfoBtn: {
    flex: 1, height: W ? 49 : 38, borderRadius: W ? 13 : 10, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: W ? 8 : 6,
  },
  requestInfoBtnText: { fontSize: W ? 16 : 12, fontWeight: '700', color: '#475569', textAlign: 'center' },
  requestInfoBtnDone: { backgroundColor: '#F8FAFC' },
  requestInfoBtnTextDone: { color: '#94A3B8' },

  // Profile circle
  avatarWrap:    { alignItems: 'center', width: W ? 94 : 72, marginRight: W ? 16 : 12 },
  avatarImg:     { width: W ? 81 : 62, height: W ? 81 : 62, borderRadius: W ? 41 : 31, borderWidth: 2.5, borderColor: '#2563EB', marginBottom: W ? 5 : 4 },
  avatarFallback:{ backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: W ? 29 : 22, fontWeight: '900', color: '#2563EB' },
  avatarName:    { fontSize: W ? 14 : 11, fontWeight: '700', color: '#0F172A', textAlign: 'center' },

  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: W ? 52 : 40 },
  emptyTitle: { fontSize: W ? 23 : 18, fontWeight: '700', color: '#334155', marginTop: W ? 21 : 16, marginBottom: W ? 8 : 6 },
  emptySub:   { fontSize: W ? 18 : 14, color: '#94A3B8', textAlign: 'center', lineHeight: W ? 26 : 20 },

  // Activity tab — Active Requests / Completed / Archived
  activitySection: {
    backgroundColor: '#fff',
    borderRadius: W ? 18 : 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginHorizontal: W ? 21 : 16,
    overflow: 'hidden',
  },
  activitySectionDivider: { height: W ? 16 : 12 },
  activitySectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: W ? 10 : 8,
    paddingHorizontal: W ? 21 : 16,
    paddingVertical: W ? 16 : 12,
  },
  activitySectionTitle:  { fontSize: W ? 20 : 15, fontWeight: '800', color: '#0F172A', flex: 1 },
  activitySectionCount:  { fontSize: W ? 17 : 13, fontWeight: '700', color: '#94A3B8' },
  activityEmptyText:     { fontSize: W ? 17 : 13, color: '#94A3B8', paddingHorizontal: W ? 21 : 16, paddingBottom: W ? 18 : 14 },
  activityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: W ? 16 : 12,
    paddingHorizontal: W ? 21 : 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  activityRowTitle: { fontSize: W ? 18 : 14, fontWeight: '700', color: '#0F172A', marginBottom: W ? 3 : 2 },
  activityRowDate:  { fontSize: W ? 16 : 12, color: '#94A3B8' },
  activityArchiveBtn: { padding: W ? 8 : 6, marginLeft: W ? 10 : 8 },

  // ── Scheduler tab ─────────────────────────────────────────────────────────
  schedulerHeader: { fontSize: W ? 21 : 16, fontWeight: '800', color: '#0F172A', marginBottom: W ? 18 : 14 },
  schedEmpty: { alignItems: 'center', paddingTop: W ? 78 : 60 },
  testNotifBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: W ? 10 : 8, marginTop: W ? 42 : 32, paddingVertical: W ? 16 : 12, paddingHorizontal: W ? 21 : 16, borderRadius: W ? 16 : 12, borderWidth: 1.5, borderColor: '#DDD6FE', backgroundColor: '#FAFAFF' },
  testNotifBtnSent: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  testNotifTxt:     { fontSize: W ? 17 : 13, fontWeight: '700', color: '#7C3AED' },

  aptCard: {
    backgroundColor: '#fff', borderRadius: W ? 18 : 14, padding: W ? 21 : 16, marginBottom: W ? 16 : 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  aptCardCancelled: { opacity: 0.55 },
  aptHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: W ? 10 : 8 },
  aptStatusBadge:   { borderRadius: W ? 10 : 8, paddingHorizontal: W ? 13 : 10, paddingVertical: W ? 5 : 4 },
  aptStatusText:    { fontSize: W ? 14 : 11, fontWeight: '800', textTransform: 'capitalize' },
  aptTime:          { fontSize: W ? 16 : 12, color: '#64748B', fontWeight: '600' },
  aptBusiness:      { fontSize: W ? 21 : 16, fontWeight: '900', color: '#0F172A', marginBottom: W ? 3 : 2 },
  aptNeed:          { fontSize: W ? 17 : 13, color: '#475569', marginBottom: W ? 8 : 6 },
  aptPrice:         { fontSize: W ? 18 : 14, fontWeight: '700', color: '#0F172A', marginBottom: W ? 5 : 4 },
  aptAddressRow:    { flexDirection: 'row', alignItems: 'center', gap: W ? 5 : 4, marginTop: W ? 3 : 2 },
  aptAddressTxt:    { fontSize: W ? 16 : 12, color: '#64748B' },

  aptPartyRow:      { flexDirection: 'row', alignItems: 'center', gap: W ? 13 : 10, marginBottom: W ? 10 : 8 },
  aptAvatar:        { width: W ? 57 : 44, height: W ? 57 : 44, borderRadius: W ? 29 : 22, borderWidth: 2, borderColor: '#2563EB' },
  aptAvatarFallback:{ backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
  aptAvatarInitial: { fontSize: W ? 23 : 18, fontWeight: '900', color: '#2563EB' },
  aptPartyLabel:    { fontSize: W ? 14 : 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: W ? 3 : 2 },

});

export default NotificationsScreen;
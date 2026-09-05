// App.js
import React, { useEffect, useRef, useState, useContext } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import TabNavigation from './Screens/TabNavigation';
import { UserProvider, UserContext } from './server/CurrentUser';
import { AuthModalProvider } from './Screens/AuthModalContext';
import { requestNotificationPermissions } from './utils/appointmentReminders';
import AppointmentFollowUpModal from './Screens/AppointmentFollowUpModal';
import RestaurantFollowUpModal from './Screens/RestaurantFollowUpModal';

// Push notifications are native-only — not supported on web
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert:  true,
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   false,
    }),
  });
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NODE_API } from './config';

// ── Inner component: lives inside UserProvider so it can read userId ──────────
function NotificationHandler() {
  const { userId } = useContext(UserContext);
  const notifListenerRef  = useRef(null);
  const notifResponseRef  = useRef(null);
  const [followUp, setFollowUp]               = useState(null); // { appointment, role }
  const [restaurantFollowUp, setRestaurantFollowUp] = useState(null);
  const restaurantPollRef = useRef(null);

  // ── Appointment follow-up via local push notification (native only) ──────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    requestNotificationPermissions().catch(() => {});

    const openFollowUp = (data) => {
      if (data?.type === 'appointmentFollowUp' && data.appointmentId) {
        setFollowUp({
          appointment: {
            _id:           data.appointmentId,
            businessName:  data.businessName  || '',
            needText:      data.needText      || '',
            serviceUserId: data.serviceUserId || null,
            requesterId:   data.requesterId   || null,
          },
          role: data.role || 'requester',
        });
      }
    };

    notifListenerRef.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request?.content?.data || {};
      if (data.type === 'appointmentFollowUp') openFollowUp(data);
    });

    notifResponseRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request?.content?.data || {};
      openFollowUp(data);
    });

    return () => {
      notifListenerRef.current?.remove();
      notifResponseRef.current?.remove();
    };
  }, []);

  // ── Restaurant follow-up polling (every 30s while userId is set) ─────────────
  useEffect(() => {
    if (!userId) return;

    const poll = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const res = await fetch(`${NODE_API}/restaurantFollowUps/pending?userId=${userId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data?._id) setRestaurantFollowUp(data);
      } catch { /* silent */ }
    };

    poll(); // immediate first check
    restaurantPollRef.current = setInterval(poll, 30000);
    return () => clearInterval(restaurantPollRef.current);
  }, [userId]);

  return (
    <>
      {!!followUp && (
        <AppointmentFollowUpModal
          visible
          appointment={followUp.appointment}
          role={followUp.role}
          userId={userId}
          onClose={() => setFollowUp(null)}
        />
      )}
      {!!restaurantFollowUp && !followUp && (
        <RestaurantFollowUpModal
          visible
          followUp={restaurantFollowUp}
          userId={userId}
          onClose={() => setRestaurantFollowUp(null)}
        />
      )}
    </>
  );
}

export default function App() {
  useEffect(() => {
    const enableAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
          interruptionModeIOS: 1,
          interruptionModeAndroid: 1,
        });
        console.log('🎧 Audio mode enabled globally');
      } catch (e) {
        console.log('Audio mode error:', e);
      }
    };
    enableAudio();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <UserProvider>
          <AuthModalProvider>
            <NavigationContainer>
              <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <TabNavigation />
              </SafeAreaView>
              {/* NotificationHandler lives inside UserProvider + NavigationContainer
                  so it can read userId and show the follow-up modal over any screen */}
              <NotificationHandler />
            </NavigationContainer>
          </AuthModalProvider>
        </UserProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
// Screens/TabNavigation.js
import React, { useContext, useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Modal, Text, TouchableOpacity, Image } from 'react-native';
import { IS_WEB, WEB_HEADER_HEIGHT } from '../webLayout';

import Tab1Content   from './Tab1Content';
import Tab2Content   from './Tab2Content';
import Tab3Content   from './Tab3Content';

import SingleItemView                from './SingleItemView';
import SearchResults                 from './SearchResults';
import ProfileView                   from './ProfileView';
import CurrentProfileView            from './CurrentProfileView';
import Activity                      from './Activity';
import FillNeedTransaction           from './FillNeedTransaction';
import TransactionComplete           from './TransactionComplete';
import Fundraiser                    from './Fundraiser';
import FundraiserTransactionComplete from './FundraiserTransactionComplete';
import UploadTypeSelector            from './UploadTypeSelector';
import UploadItems                   from './UploadItems';
import UploadRestaurant              from './UploadRestaurant';
import UploadService                 from './UploadService';
import UploadNonprofit               from './UploadNonprofit';
import MatchResults                  from './MatchResults';
import CreateNewUser                 from './CreateNewUser';
import SearchChatbot                 from './SearchChatbot';
import MessagesScreen                from './MessagesScreen';
import NewMessageScreen               from './NewMessageScreen';
import ConversationScreen            from './ConversationScreen';
import NotificationsScreen           from './NotificationsScreen';

import { UserContext }  from '../server/CurrentUser';
import { useAuthModal } from './AuthModalContext';

import { NODE_API } from '../config';
import { authFetch } from '../server/api';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const SCREEN_OPTIONS = { headerShown: false };

const SHARED_SCREENS = [
  { name: 'SingleItemView',                component: SingleItemView },
  { name: 'SearchResults',                 component: SearchResults },
  { name: 'ProfileView',                   component: ProfileView },
  { name: 'CurrentProfileView',            component: CurrentProfileView },
  { name: 'Activity',                      component: Activity },
  { name: 'FillNeedTransaction',           component: FillNeedTransaction },
  { name: 'TransactionComplete',           component: TransactionComplete },
  { name: 'FundraiserDetail',              component: Fundraiser },
  { name: 'FundraiserTransactionComplete', component: FundraiserTransactionComplete },
  { name: 'UploadTypeSelector',            component: UploadTypeSelector },
  { name: 'UploadItems',                   component: UploadItems },
  { name: 'UploadRestaurant',              component: UploadRestaurant },
  { name: 'UploadService',                 component: UploadService },
  { name: 'UploadNonprofit',              component: UploadNonprofit },
  { name: 'MatchResults',                  component: MatchResults },
  { name: 'CreateNewUser',                 component: CreateNewUser },
  { name: 'SearchChatbot',                 component: SearchChatbot },
  { name: 'Conversation',                  component: ConversationScreen },
];

console.log('Ionicons =', Ionicons);

// ── Web-only top header bar ───────────────────────────────────────────────────
// Plain JS objects instead of StyleSheet.create so 'fixed' isn't validated on
// native (this component is never rendered on iOS/Android anyway).
const whs = IS_WEB ? {
  bar: {
    position: 'fixed',
    top: 0, left: 0, right: 0,
    height: WEB_HEADER_HEIGHT,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '5%', paddingRight: '5%',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  logoImg:     { width: 158, height: 53, resizeMode: 'contain' },
  right:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  activityTxt: { fontSize: 22, fontWeight: '600', color: '#374151' },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginLeft: 2 },
  hamburger:   { padding: 8 },
  dropdown: {
    position: 'absolute', top: WEB_HEADER_HEIGHT, right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    minWidth: 260, zIndex: 1001, paddingVertical: 10,
  },
  menuItem:  { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18, paddingHorizontal: 26 },
  menuLabel: { fontSize: 20, fontWeight: '600', color: '#374151' },
} : {};

const WEB_TABS = [
  { name: 'Need',          label: 'Need',       icon: 'chatbubble-ellipses-outline', auth: false },
  { name: 'Fill Needs',    label: 'Fill Needs', icon: 'list-outline',                auth: false },
  { name: 'Notifications', label: 'Activity',   icon: 'swap-horizontal-outline',     auth: true  },
  { name: 'Account',       label: 'Account',    icon: 'person-circle-outline',       auth: true  },
];

function WebHeader({ navigation, unread, userId, onAuthRequired }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the dropdown when the user clicks anywhere else on the page
  useEffect(() => {
    if (!menuOpen || typeof window === 'undefined') return;
    const close = () => setMenuOpen(false);
    // Delay by one tick so the opener click doesn't immediately close it
    const t = setTimeout(() => window.addEventListener('click', close), 0);
    return () => { clearTimeout(t); window.removeEventListener('click', close); };
  }, [menuOpen]);

  const goTo = (tabName, needsAuth) => {
    setMenuOpen(false);
    if (needsAuth && !userId) { onAuthRequired(); return; }
    navigation.navigate(tabName);
  };

  const totalBadge = (unread.messages || 0) + (unread.notifications || 0);

  return (
    <View style={whs.bar}>
      <TouchableOpacity onPress={() => goTo('Need', false)}>
        <Image source={require('../assets/NeedsLogo.png')} style={whs.logoImg} />
      </TouchableOpacity>

      <View style={whs.right}>
        <TouchableOpacity style={whs.activityBtn} onPress={() => goTo('Notifications', true)}>
          <Ionicons name="swap-horizontal" size={28} color="#374151" />
          <Text style={whs.activityTxt}>Activity</Text>
          {totalBadge > 0 && <View style={whs.dot} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen(v => !v)} style={whs.hamburger}>
          <Ionicons name={menuOpen ? 'close' : 'menu'} size={37} color="#111" />
        </TouchableOpacity>
      </View>

      {menuOpen && (
        <View style={whs.dropdown}>
          {WEB_TABS.map(item => (
            <TouchableOpacity key={item.name} style={whs.menuItem} onPress={() => goTo(item.name, item.auth)}>
              <Ionicons name={item.icon} size={23} color="#374151" />
              <Text style={whs.menuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function NeedStack() {
  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="NeedHome" component={Tab1Content} />
      {SHARED_SCREENS.map(({ name, component }) => (
        <Stack.Screen key={name} name={name} component={component} />
      ))}
    </Stack.Navigator>
  );
}

const FILL_NEEDS_CHILD_OPTIONS = {
  headerShown: false,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
};

function FillNeedsStack() {
  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="NeedInquiryView" component={Tab2Content} />
      {SHARED_SCREENS.map(({ name, component }) => (
        <Stack.Screen key={name} name={name} component={component}
          options={FILL_NEEDS_CHILD_OPTIONS}
        />
      ))}
    </Stack.Navigator>
  );
}

function NotificationsStack() {
  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="NotificationsHome" component={NotificationsScreen} />
      <Stack.Screen name="MessagesHome"      component={MessagesScreen} />
      <Stack.Screen name="NewMessage"        component={NewMessageScreen} />
      <Stack.Screen name="Conversation"      component={ConversationScreen} />
      <Stack.Screen name="ProfileView"       component={ProfileView} />
      {SHARED_SCREENS
        .filter(s => !['Conversation', 'ProfileView'].includes(s.name))
        .map(({ name, component }) => (
          <Stack.Screen key={name} name={name} component={component} />
        ))}
    </Stack.Navigator>
  );
}

function AccountStack() {
  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="AccountHome" component={Tab3Content} />
      {SHARED_SCREENS.map(({ name, component }) => (
        <Stack.Screen key={name} name={name} component={component} />
      ))}
    </Stack.Navigator>
  );
}

export default function TabNavigation() {
  const { userId } = useContext(UserContext);
  const insets = useSafeAreaInsets();
  const [authVisible, setAuthVisible] = React.useState(false);
  const [unread, setUnread] = useState({ messages: 0, notifications: 0 });

  // Poll unread counts every 30s
  useEffect(() => {
    if (!userId) { setUnread({ messages: 0, notifications: 0 }); return; }
    const load = () => {
      authFetch(`${NODE_API}/getUnreadCounts`)
        .then(r => r.json())
        .then(d => setUnread({ messages: d.messages || 0, notifications: d.notifications || 0 }))
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [userId]);

  return (
    <>
    <Tab.Navigator
      initialRouteName="Need"
      tabBar={IS_WEB ? (props) => (
        <WebHeader
          {...props}
          unread={unread}
          userId={userId}
          onAuthRequired={() => setAuthVisible(true)}
        />
      ) : undefined}
      sceneContainerStyle={IS_WEB ? { paddingTop: WEB_HEADER_HEIGHT } : undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   '#007bff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor:  '#e0e0e0',
          borderTopWidth:  1,
          height:          49 + insets.bottom,
          paddingBottom:   insets.bottom,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          let badge = 0;

          if (route.name === 'Need') {
            iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          } else if (route.name === 'Fill Needs') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'swap-horizontal' : 'swap-horizontal-outline';
            badge = (unread.messages || 0) + (unread.notifications || 0);
          } else if (route.name === 'Account') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          }

          return (
            <View style={{ position: 'relative', width: size, height: size }}>
              <Ionicons name={iconName} size={size} color={color} />
              {badge > 0 && (
                <View style={{
                  position: 'absolute', top: -3, right: -5,
                  width: 14, height: 14, borderRadius: 7,
                  backgroundColor: '#EF4444',
                  borderWidth: 1.5, borderColor: '#fff',
                }} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Need"       component={NeedStack}       options={{ tabBarLabel: 'Need' }} />
      <Tab.Screen name="Fill Needs" component={FillNeedsStack}  options={{ tabBarLabel: 'Fill Needs' }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{ tabBarLabel: 'Activity' }}
        listeners={{ tabPress: (e) => { if (!userId) { e.preventDefault(); setAuthVisible(true); } } }}
      />
      <Tab.Screen
        name="Account"
        component={AccountStack}
        options={{ tabBarLabel: 'Account' }}
        listeners={{ tabPress: (e) => { if (!userId) { e.preventDefault(); setAuthVisible(true); } } }}
      />
    </Tab.Navigator>

    <Modal
      visible={authVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => setAuthVisible(false)}
    >
      <CreateNewUser
        onLoginSuccess={() => setAuthVisible(false)}
        onCancel={() => setAuthVisible(false)}
      />
    </Modal>
    </>
  );
}
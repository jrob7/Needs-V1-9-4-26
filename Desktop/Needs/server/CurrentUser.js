// server/CurrentUser.js
import React, { createContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AuthStorage from './authStorage';
import { NODE_API } from '../config';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userId, setUserId]           = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [accountType, setAccountType] = useState(null);
  const [businessType, setBusinessType] = useState(null);

  // Global auth modal control
  const [authModalVisible, setAuthModalVisible] = useState(false);

  // Set once by a handoff from the module page chat widget (see below) -
  // Tab1Content consumes and clears this on mount.
  const [pendingPrefillText, setPendingPrefillText] = useState(null);

  // Load persisted session on app start — or, on web, consume a one-time
  // handoff token from the URL if a visitor just logged in from the public
  // module page chat widget and was redirected in here.
  useEffect(() => {
    (async () => {
      try {
        const handoffToken = Platform.OS === 'web'
          ? new URLSearchParams(window.location.search).get('handoff')
          : null;
        console.log('[Needs Handoff] bootstrap: Platform.OS=', Platform.OS, 'handoffToken=', handoffToken);

        if (handoffToken) {
          // Strip it from the address bar immediately so a refresh/share of
          // this URL can't attempt to reuse an already-consumed token.
          window.history.replaceState({}, '', window.location.pathname);
          try {
            console.log('[Needs Handoff] POST', `${NODE_API}/exchangeWebHandoff`);
            const resp = await fetch(`${NODE_API}/exchangeWebHandoff`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: handoffToken }),
            });
            const data = await resp.json();
            console.log('[Needs Handoff] exchangeWebHandoff response: status=', resp.status, 'data=', data);
            if (resp.ok && data.userId) {
              await AuthStorage.setItem('authToken', data.token);
              await AuthStorage.setItem('refreshToken', data.refreshToken);
              setUserId(data.userId);
              setAccountType(data.accountType || 'individual');
              setBusinessType(data.businessType || null);
              if (data.prefillText) {
                console.log('[Needs Handoff] setting pendingPrefillText:', data.prefillText);
                setPendingPrefillText(data.prefillText);
              } else {
                console.log('[Needs Handoff] exchange succeeded but response had no prefillText');
              }
              return;
            }
            console.warn('[Needs Handoff] exchange did not succeed (bad status or missing userId)');
          } catch (err) {
            console.error('[Needs Handoff] exchangeWebHandoff fetch threw:', err);
          }
        }

        const stored = await AuthStorage.getItem('userId');
        if (stored) setUserId(stored);
        const storedType = await AuthStorage.getItem('accountType');
        if (storedType) setAccountType(storedType);
        const storedBizType = await AuthStorage.getItem('businessType');
        if (storedBizType) setBusinessType(storedBizType);
        // authToken is stored separately — authFetch reads it directly from AuthStorage
      } catch {}
    })();
  }, []);

  // Persist userId whenever it changes; wipe everything on logout
  useEffect(() => {
    (async () => {
      try {
        if (userId) {
          await AuthStorage.setItem('userId', userId);
        } else {
          await AuthStorage.multiRemove(['userId', 'authToken', 'refreshToken', 'accountType', 'businessType']);
          setUserProfile(null);
          setAccountType(null);
          setBusinessType(null);
        }
      } catch {}
    })();
  }, [userId]);

  // Persist accountType/businessType whenever they change
  useEffect(() => {
    (async () => {
      try {
        if (accountType) await AuthStorage.setItem('accountType', accountType);
        if (businessType) await AuthStorage.setItem('businessType', businessType);
      } catch {}
    })();
  }, [accountType, businessType]);

  // Helper to patch individual profile fields without a full re-fetch
  const patchUserProfile = (updates) => {
    setUserProfile(prev => prev ? { ...prev, ...updates } : updates);
  };

  return (
    <UserContext.Provider
      value={{
        userId,
        setUserId,
        userProfile,
        setUserProfile,
        patchUserProfile,
        accountType,
        setAccountType,
        businessType,
        setBusinessType,
        pendingPrefillText,
        setPendingPrefillText,
        authModalVisible,
        setAuthModalVisible,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
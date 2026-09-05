// server/CurrentUser.js
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userId, setUserId]           = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [accountType, setAccountType] = useState(null);
  const [businessType, setBusinessType] = useState(null);

  // Global auth modal control
  const [authModalVisible, setAuthModalVisible] = useState(false);

  // Load persisted session on app start
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('userId');
        if (stored) setUserId(stored);
        const storedType = await AsyncStorage.getItem('accountType');
        if (storedType) setAccountType(storedType);
        const storedBizType = await AsyncStorage.getItem('businessType');
        if (storedBizType) setBusinessType(storedBizType);
        // authToken is stored separately — authFetch reads it directly from AsyncStorage
      } catch {}
    })();
  }, []);

  // Persist userId whenever it changes; wipe everything on logout
  useEffect(() => {
    (async () => {
      try {
        if (userId) {
          await AsyncStorage.setItem('userId', userId);
        } else {
          await AsyncStorage.multiRemove(['userId', 'authToken', 'accountType', 'businessType']);
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
        if (accountType) await AsyncStorage.setItem('accountType', accountType);
        if (businessType) await AsyncStorage.setItem('businessType', businessType);
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
        authModalVisible,
        setAuthModalVisible,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
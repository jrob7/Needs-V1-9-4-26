// Screens/AuthModalContext.js
import React, { createContext, useContext, useState, useMemo } from 'react';

const AuthModalCtx = createContext({
  visible: false,
  show: () => {},
  hide: () => {},
});

export function AuthModalProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(
    () => ({
      visible,
      show: () => setVisible(true),
      hide: () => setVisible(false),
    }),
    [visible]
  );
  return <AuthModalCtx.Provider value={value}>{children}</AuthModalCtx.Provider>;
}

export function useAuthModal() {
  return useContext(AuthModalCtx);
}
import { Platform } from 'react-native';

export const IS_WEB            = Platform.OS === 'web';
export const WEB_HEADER_HEIGHT = 56;
export const WEB_MAX_WIDTH     = 720;

// Spread onto an inner View to center and cap content width on web.
// On native this is an empty object — no layout change.
export const webContainer = IS_WEB
  ? { maxWidth: WEB_MAX_WIDTH, width: '100%', alignSelf: 'center', flex: 1 }
  : {};

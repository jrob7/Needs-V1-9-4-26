import { Platform, Dimensions } from 'react-native';

export const IS_WEB            = Platform.OS === 'web';
export const WEB_HEADER_HEIGHT = 56;
export const WEB_MAX_WIDTH     = 720;

// True when running in a mobile browser (phone-width viewport).
// Use this to serve native-sized values on mobile web instead of desktop web values.
const windowWidth = Dimensions.get('window').width;
export const IS_MOBILE_WEB = IS_WEB && windowWidth < 768;

// Spread onto an inner View to center and cap content width on web.
// On native this is an empty object — no layout change.
export const webContainer = IS_WEB
  ? { maxWidth: WEB_MAX_WIDTH, width: '100%', alignSelf: 'center', flex: 1 }
  : {};

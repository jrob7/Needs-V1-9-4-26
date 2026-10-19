const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    name: IS_DEV ? 'Needs Dev' : 'Needs',
    slug: 'needs',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    scheme: IS_DEV ? 'needsapp-dev' : 'needsapp',
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.jrehurst7.needs.dev' : 'com.jrehurst7.needs',
    },
    android: {
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ],
      package: IS_DEV ? 'com.jrehurst7.needs.dev' : 'com.jrehurst7.needs',
    },
    web: {
      bundler: 'metro',
      output: 'single',
    },
    plugins: [
      'expo-font',
      '@react-native-community/datetimepicker',
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#2563EB',
          iosDisplayInForeground: true,
        },
      ],
      'expo-video',
      'expo-audio',
      [
        'expo-speech-recognition',
        {
          microphonePermission: 'Allow $(PRODUCT_NAME) to use the microphone to describe your need by voice.',
          speechRecognitionPermission: 'Allow $(PRODUCT_NAME) to use speech recognition to transcribe your voice description.',
          androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '78e9cc50-5b11-46df-ab2f-324775090cbf',
      },
    },
  },
};

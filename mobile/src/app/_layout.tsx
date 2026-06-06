import React from 'react';
import { ActivityIndicator, View, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, useSegments, Slot, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import LoginScreen from './login';
import { useVolumeTrigger } from '@/hooks/useVolumeTrigger';
import { AlertToastProvider, useAlert } from '@/context/AlertToastContext';
import { registerUnauthorizedCallback, apiService } from '@/services/api';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// Import expo-notifications conditionally to prevent SDK 53 crash on Android Expo Go
let NotificationsModule: any = null;
let isExpoGoAndroid = false;

try {
  const appOwnership = Constants?.appOwnership;
  if (Platform.OS === 'android' && appOwnership === 'expo') {
    isExpoGoAndroid = true;
    console.warn(
      'Push notifications (remote) are not supported on Android Expo Go starting in SDK 53. ' +
      'Please use a Development Build to test remote push notifications. Falling back to mock push token.'
    );
  } else {
    NotificationsModule = require('expo-notifications');
  }
} catch (e) {
  console.warn('Failed to load expo-notifications:', e);
}

const dummySubscription = { remove: () => {} };

const Notifications = NotificationsModule || {
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => ({}),
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  getExpoPushTokenAsync: async () => ({ data: '' }),
  addNotificationReceivedListener: () => dummySubscription,
  addNotificationResponseReceivedListener: () => dummySubscription,
  AndroidImportance: { MAX: 4 },
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice && !isExpoGoAndroid) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('[Push Notification] Failed to get push token: permission not granted');
      return null;
    }
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.warn('[Push Notification] Error fetching Expo Push Token:', e);
    }
  } else {
    console.log('[Push Notification] Simulators/Emulators or Expo Go Android do not support native push; generating a mock token for development testing.');
    token = `ExponentPushToken[mock-${Math.random().toString(36).substring(7)}]`;
  }

  return token;
}

function VolumeTriggerWrapper() {
  useVolumeTrigger();
  return null;
}

function AppContent() {
  const { token, isLoading, themePreference, signOut } = useAuth();
  const { showAlert } = useAlert();
  const segments = useSegments();
  const scheme = useColorScheme();

  React.useEffect(() => {
    registerUnauthorizedCallback(async () => {
      await signOut();
      showAlert(
        'Session Expired',
        'Your session has expired. Please log in again to continue.',
        [{ text: 'OK' }]
      );
    });
  }, [signOut, showAlert]);

  React.useEffect(() => {
    async function setupPush() {
      if (token) {
        try {
          const pushToken = await registerForPushNotificationsAsync();
          if (pushToken) {
            console.log('[Push Notification] Registering token on backend:', pushToken);
            await apiService.registerPushToken(pushToken);
          }
        } catch (err) {
          console.warn('[Push Notification] Setup failed:', err);
        }
      }
    }
    setupPush();
  }, [token]);

  React.useEffect(() => {
    const foregroundSubscription = Notifications.addNotificationReceivedListener((notification: any) => {
      console.log('[Push Notification] Received in foreground:', notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      console.log('[Push Notification] User interacted with notification:', response);
    });

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  const activeTheme = themePreference === 'system'
    ? (scheme === 'unspecified' ? 'light' : scheme)
    : themePreference;

  if (isLoading) {
    const isDark = activeTheme === 'dark';
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // Bulletproof session verification:
  // If not authenticated, render LoginScreen directly (or Slot if they navigated to register)
  if (!token) {
    const isRegisterPage = segments[0] === 'register';
    const content = isRegisterPage ? <Slot /> : <LoginScreen />;
    return (
      <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
        {content}
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <VolumeTriggerWrapper />
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="notifications" />
      </Stack>
    </ThemeProvider>
  );
}

export default function TabLayout() {
  return (
    <AuthProvider>
      <AlertToastProvider>
        <AppContent />
      </AlertToastProvider>
    </AuthProvider>
  );
}


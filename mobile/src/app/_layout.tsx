import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, useSegments, Slot, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import LoginScreen from './login';
import { useVolumeTrigger } from '@/hooks/useVolumeTrigger';
import { AlertToastProvider, useAlert } from '@/context/AlertToastContext';
import { registerUnauthorizedCallback } from '@/services/api';

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


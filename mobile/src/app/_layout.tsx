import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, useSegments, Slot, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import LoginScreen from './login';
import { useVolumeTrigger } from '@/hooks/useVolumeTrigger';

function AppContent() {
  const { token, isLoading, themePreference } = useAuth();
  const segments = useSegments();
  const scheme = useColorScheme();

  // Register hardware volume panic trigger globally
  useVolumeTrigger();

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
      <AppContent />
    </AuthProvider>
  );
}

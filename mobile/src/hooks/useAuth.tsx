import React, { createContext, useContext, useState, useEffect } from 'react';
import { authStorage } from '../services/auth';
import { API_BASE_URL } from '../services/api';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

interface User {
  id: number;
  email: string;
  full_name: string;
  phone_number: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (name: string, email: string, phone: string, pass: string, otpCode?: string) => Promise<void>;
  signInWithOTP: (phone: string, code: string) => Promise<{ is_new_user: boolean; phone_number?: string }>;
  signOut: () => Promise<void>;
  updateUser: (updatedUser: User) => Promise<void>;
  themePreference: 'light' | 'dark' | 'system';
  setThemePreference: (pref: 'light' | 'dark' | 'system') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [themePreference, setThemePreferenceState] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    // Recover user session on launch
    async function loadSession() {
      try {
        const savedToken = await authStorage.getToken();
        const savedUser = await authStorage.getUserData();
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(savedUser);
        }
        const savedTheme = Platform.OS === 'web'
          ? localStorage.getItem('coverme_theme_pref')
          : await SecureStore.getItemAsync('coverme_theme_pref');
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemePreferenceState(savedTheme as any);
        }
      } catch (err) {
        console.warn('Failed to load session details on boot', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  const signIn = async (email: string, pass: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Login failed');
      }

      const data = await response.json();
      setToken(data.access_token);
      setUser(data.user);
      
      await authStorage.saveToken(data.access_token);
      await authStorage.saveUserData(data.user);
      if (data.refresh_token) {
        await authStorage.saveRefreshToken(data.refresh_token);
      }
    } catch (error) {
      console.error('Login action error:', error);
      throw error;
    }
  };

  const signUp = async (name: string, email: string, phone: string, pass: string, otpCode?: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: pass,
          full_name: name,
          phone_number: phone,
          otp_code: otpCode || null,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Registration failed');
      }

      // Automatically sign in the user after registration
      await signIn(email, pass);
    } catch (error) {
      console.error('Registration action error:', error);
      throw error;
    }
  };

  const signInWithOTP = async (phone: string, code: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phone, otp_code: code }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'OTP verification failed');
      }

      const data = await response.json();
      if (data.is_new_user) {
        return { is_new_user: true, phone_number: data.phone_number };
      }

      setToken(data.access_token);
      setUser(data.user);
      
      await authStorage.saveToken(data.access_token);
      await authStorage.saveUserData(data.user);
      if (data.refresh_token) {
        await authStorage.saveRefreshToken(data.refresh_token);
      }
      return { is_new_user: false };
    } catch (error) {
      console.error('OTP login action error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    setUser(null);
    setToken(null);
    await authStorage.clearSession();
  };

  const updateUser = async (updatedUser: User) => {
    setUser(updatedUser);
    await authStorage.saveUserData(updatedUser);
  };

  const setThemePreference = async (pref: 'light' | 'dark' | 'system') => {
    setThemePreferenceState(pref);
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('coverme_theme_pref', pref);
      } else {
        await SecureStore.setItemAsync('coverme_theme_pref', pref);
      }
    } catch (err) {
      console.warn('Failed to save theme preference', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signUp, signInWithOTP, signOut, updateUser, themePreference, setThemePreference }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

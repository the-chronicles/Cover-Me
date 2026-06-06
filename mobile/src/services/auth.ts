import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'coverme_user_token';
const REFRESH_TOKEN_KEY = 'coverme_refresh_token';
const USER_KEY = 'coverme_user_data';

export const authStorage = {
  async saveToken(token: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      }
    } catch (error) {
      console.warn('Error saving authentication token:', error);
    }
  },

  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
      } else {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      console.warn('Error retrieving authentication token:', error);
      return null;
    }
  },

  async deleteToken(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      console.warn('Error deleting authentication token:', error);
    }
  },

  async saveRefreshToken(token: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
      }
    } catch (error) {
      console.warn('Error saving refresh token:', error);
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
      } else {
        return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      }
    } catch (error) {
      console.warn('Error retrieving refresh token:', error);
      return null;
    }
  },

  async deleteRefreshToken(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      } else {
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      }
    } catch (error) {
      console.warn('Error deleting refresh token:', error);
    }
  },

  async saveUserData(userData: any): Promise<void> {
    try {
      const dataStr = JSON.stringify(userData);
      if (Platform.OS === 'web') {
        localStorage.setItem(USER_KEY, dataStr);
      } else {
        await SecureStore.setItemAsync(USER_KEY, dataStr);
      }
    } catch (error) {
      console.warn('Error saving user data:', error);
    }
  },

  async getUserData(): Promise<any | null> {
    try {
      let dataStr: string | null = null;
      if (Platform.OS === 'web') {
        dataStr = localStorage.getItem(USER_KEY);
      } else {
        dataStr = await SecureStore.getItemAsync(USER_KEY);
      }
      return dataStr ? JSON.parse(dataStr) : null;
    } catch (error) {
      console.warn('Error retrieving user data:', error);
      return null;
    }
  },

  async clearSession(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_KEY);
      }
    } catch (error) {
      console.warn('Error clearing session:', error);
    }
  }
};

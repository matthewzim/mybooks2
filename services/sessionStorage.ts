import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Move existing sessions only after a successful Keychain write, so an upgrade
// cannot discard an anonymous user's only credential. Never downgrade on error.
export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return typeof window === 'undefined' ? null : AsyncStorage.getItem(key);
    const secure = await SecureStore.getItemAsync(key);
    if (secure !== null) return secure;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') await AsyncStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  },
};

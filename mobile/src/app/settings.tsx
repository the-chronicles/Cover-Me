import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  Text,
  TextInput,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut, updateUser, themePreference, setThemePreference } = useAuth();

  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [saving, setSaving] = useState(false);

  // Sync state if user changes externally
  useEffect(() => {
    if (user) {
      setName(user.full_name);
      setPhone(user.phone_number);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Validation Error', 'Full Name and Phone Number cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      // Call backend API
      const updatedUser = await apiService.updateProfile({
        full_name: name.trim(),
        phone_number: phone.trim()
      });

      // Update local state (context & storage)
      await updateUser(updatedUser);
      setEditMode(false);
      Alert.alert('Profile Updated', 'Your profile details have been saved successfully.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update profile details.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      if (Platform.OS === 'ios') {
        await WebBrowser.openBrowserAsync(url);
      } else {
        // Open standard browser on android/web or fallback
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          Alert.alert('Error', `Cannot open web link: ${url}`);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to open the in-app browser.');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/login');
          }
        }
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Navigation Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 }
            ]}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView name="chevron.left" tintColor={theme.primary} size={24} />
            ) : (
              <Text style={{ fontSize: 24, color: theme.primary }}>◀</Text>
            )}
          </Pressable>
          <ThemedText style={styles.headerTitle}>Settings</ThemedText>
          <View style={{ width: 40 }} /> {/* Spacer to balance header */}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* User Profile Card */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>Profile Information</ThemedText>
              {!editMode && (
                <Pressable onPress={() => setEditMode(true)} style={styles.editBtn}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>Edit</ThemedText>
                </Pressable>
              )}
            </View>

            {editMode ? (
              <View style={styles.formContainer}>
                <View style={styles.inputGroup}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.inputLabel}>
                    Full Name
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: theme.text,
                        backgroundColor: theme.background,
                        borderColor: theme.backgroundSelected
                      }
                    ]}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter full name"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.inputLabel}>
                    Phone Number
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: theme.text,
                        backgroundColor: theme.background,
                        borderColor: theme.backgroundSelected
                      }
                    ]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter phone number"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="phone-pad"
                  />
                </View>

                {saving ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 10 }} />
                ) : (
                  <View style={styles.editActions}>
                    <Pressable
                      onPress={() => {
                        setEditMode(false);
                        setName(user?.full_name || '');
                        setPhone(user?.phone_number || '');
                      }}
                      style={[styles.actionBtn, { borderColor: theme.textSecondary, borderWidth: 1 }]}
                    >
                      <ThemedText style={{ color: theme.text }}>Cancel</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveProfile}
                      style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                    >
                      <ThemedText style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Save</ThemedText>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">Name</ThemedText>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {user?.full_name || 'Not set'}
                  </ThemedText>
                </View>

                <View style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">Email</ThemedText>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {user?.email || 'Not set'}
                  </ThemedText>
                </View>

                <View style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">Phone</ThemedText>
                  <ThemedText style={[styles.detailValue, { color: theme.text }]}>
                    {user?.phone_number || 'Not set'}
                  </ThemedText>
                </View>
              </View>
            )}
          </ThemedView>

          {/* App Appearance Card */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText style={styles.cardTitle}>App Appearance</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardSubtitle}>
              Choose how CoverMe looks on your device.
            </ThemedText>

            <View style={styles.themeSelectorRow}>
              {(['light', 'dark', 'system'] as const).map((pref) => {
                const isActive = themePreference === pref;
                return (
                  <Pressable
                    key={pref}
                    onPress={() => setThemePreference(pref)}
                    style={[
                      styles.themeOptionBtn,
                      {
                        backgroundColor: isActive ? theme.primary : theme.background,
                        borderColor: theme.backgroundSelected
                      }
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.themeOptionText,
                        { color: isActive ? '#F8FAFC' : theme.text, fontWeight: isActive ? 'bold' : 'normal' }
                      ]}
                    >
                      {pref.charAt(0).toUpperCase() + pref.slice(1)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>

          {/* Support & Legal Card */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText style={styles.cardTitle}>Support & Legal</ThemedText>

            <View style={styles.linkList}>
              <Pressable
                onPress={() => handleOpenLink('https://coverme.ng/privacy')}
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && { opacity: 0.7 }
                ]}
              >
                <ThemedText>Privacy Policy</ThemedText>
                {Platform.OS === 'ios' ? (
                  <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
                ) : (
                  <Text style={{ color: theme.textSecondary }}>▶</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => handleOpenLink('https://coverme.ng/terms')}
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && { opacity: 0.7 }
                ]}
              >
                <ThemedText>Terms of Service</ThemedText>
                {Platform.OS === 'ios' ? (
                  <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
                ) : (
                  <Text style={{ color: theme.textSecondary }}>▶</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => handleOpenLink('https://coverme.ng/support')}
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && { opacity: 0.7 }
                ]}
              >
                <ThemedText>Help & Support</ThemedText>
                {Platform.OS === 'ios' ? (
                  <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
                ) : (
                  <Text style={{ color: theme.textSecondary }}>▶</Text>
                )}
              </Pressable>
            </View>
          </ThemedView>

          {/* Sign Out Card */}
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.accent, borderWidth: 1 }]}>
            <ThemedText style={styles.cardTitle}>Session Security</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.cardSubtitle}>
              Sign out of this device to clear your active session credentials.
            </ThemedText>

            <Pressable
              onPress={handleSignOut}
              style={({ pressed }) => [
                styles.signOutButton,
                { backgroundColor: theme.accent },
                pressed && { opacity: 0.9 }
              ]}
            >
              <ThemedText style={styles.signOutText}>Sign Out of CoverMe</ThemedText>
            </Pressable>
          </ThemedView>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    marginTop: Platform.OS === 'ios' ? Spacing.one : Spacing.two,
  },
  backButton: {
    padding: Spacing.two,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.one,
  },
  editBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  formContainer: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  inputGroup: {
    gap: Spacing.half,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 80,
  },
  detailsContainer: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailValue: {
    fontWeight: '600',
    fontSize: 15,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  themeOptionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  themeOptionText: {
    fontSize: 14,
  },
  linkList: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(100, 116, 139, 0.2)',
  },
  signOutButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  signOutText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

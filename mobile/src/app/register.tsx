import React, { useState } from 'react';
import { StyleSheet, View, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';

export default function RegisterScreen() {
  const theme = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    if (!fullName || !email || !phone || !password) {
      Alert.alert('Incomplete Form', 'Please fill in all details.');
      return;
    }

    // Basic email check
    if (!email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    // Basic Nigerian phone check
    const cleanPhone = phone.trim();
    if (!/^\+?234\d{10}$|^0[789][01]\d{8}$/.test(cleanPhone)) {
      Alert.alert('Invalid Phone Number', 'Please input a valid phone number (e.g. +2348033011234).');
      return;
    }

    setLoading(true);
    try {
      await signUp(fullName.trim(), email.trim().toLowerCase(), cleanPhone, password);
      Alert.alert('Registration Successful', 'Welcome to CoverMe!');
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Check connection details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.branding}>
              <ThemedText style={styles.brandTitle}>CoverMe</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.brandSlogan}>never walk alone.</ThemedText>
            </View>

            <ThemedView type="backgroundElement" style={styles.formCard}>
              <ThemedText style={[styles.formHeader, { color: theme.text }]}>Create Account</ThemedText>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Full Name</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="e.g. Joshua Adesina"
                  placeholderTextColor={theme.textSecondary}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Email Address</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="joshua@email.com"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Phone Number</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="e.g. +2348033011234"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Password</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              <Pressable style={styles.registerButton} onPress={handleRegister} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#F8FAFC" />
                ) : (
                  <ThemedText style={styles.registerButtonText}>Register</ThemedText>
                )}
              </Pressable>
            </ThemedView>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
                Already have an account?{' '}
              </ThemedText>
              <Link href="/login" asChild>
                <Pressable>
                  <ThemedText type="small" style={styles.loginLink}>
                    Sign In
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.four,
  },
  branding: {
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  brandTitle: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  brandSlogan: {
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: Spacing.half,
  },
  formCard: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  formHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  registerButton: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  registerButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
  footerText: {
  },
  loginLink: {
    color: '#2563EB',
    fontWeight: 'bold',
  },
});

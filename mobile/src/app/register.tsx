import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';

import { useAlert } from '@/context/AlertToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { API_BASE_URL } from '../services/api';
export default function RegisterScreen() {
  const theme = useTheme();
  const isDark = theme.background === '#0F172A';
  const logoSource = isDark
    ? require('@/assets/images/CoverMe Logo slimW.png')
    : require('@/assets/images/CoverMe Logo Dark.png');


  const params = useLocalSearchParams<{ phone?: string }>();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP Modal states
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const { signUp } = useAuth();
  const router = useRouter();
  const { showToast } = useAlert();

  useEffect(() => {
    if (params.phone) {
      setPhone(params.phone);
    }
  }, [params.phone]);

  const handleRegister = async () => {
    if (!fullName || !email || !phone || !password) {
      showToast('Please fill in all details.', 'error');
      return;
    }

    // Basic email check
    if (!email.includes('@')) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    // Basic Nigerian phone check
    const cleanPhone = phone.trim();
    if (!/^\+?234\d{10}$|^0[789][01]\d{8}$/.test(cleanPhone)) {
      showToast('Please input a valid Nigerian phone number (e.g. +2348033011234).', 'error');
      return;
    }

    // If pre-verified from passwordless login, skip sending another OTP
    if (params.phone) {
      setLoading(true);
      try {
        await signUp(fullName.trim(), email.trim().toLowerCase(), cleanPhone, password);
        showToast('Registration Successful! Welcome to CoverMe!', 'success');
        router.replace('/');
      } catch (error: any) {
        showToast(error.message || 'Check connection details and try again.', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Standard registration flow: request OTP first
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: cleanPhone }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to send OTP code');
      }

      showToast('Verification code sent to ' + cleanPhone, 'success');
      setIsOtpModalVisible(true);
    } catch (error: any) {
      showToast(error.message || 'Failed to send verification code. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndRegister = async () => {
    if (!otpCode || otpCode.trim().length !== 6) {
      showToast('Please enter the 6-digit OTP code.', 'error');
      return;
    }

    setOtpLoading(true);
    try {
      const cleanPhone = phone.trim();
      await signUp(fullName.trim(), email.trim().toLowerCase(), cleanPhone, password, otpCode.trim());
      setIsOtpModalVisible(false);
      showToast('Registration Successful! Welcome to CoverMe!', 'success');
      router.replace('/');
    } catch (error: any) {
      showToast(error.message || 'Verification failed. Please check the code.', 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      const cleanPhone = phone.trim();
      const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: cleanPhone }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to resend OTP code');
      }

      showToast('Verification code resent.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to send code. Try again.', 'error');
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
              <Image source={logoSource} style={styles.brandLogo} resizeMode="contain" />
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
                  editable={!params.phone}
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

      {isOtpModalVisible && (
        <View style={styles.modalOverlay}>
          <ThemedView type="backgroundElement" style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Verify Mobile Number</ThemedText>
            <ThemedText style={styles.modalSubtitle}>
              We sent a 6-digit OTP code to {phone}. never walk alone.
            </ThemedText>

            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              placeholder="Enter code"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsOtpModalVisible(false)}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.verifyButton]}
                onPress={handleVerifyOtpAndRegister}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator color="#F8FAFC" />
                ) : (
                  <ThemedText style={styles.verifyButtonText}>Verify & Complete</ThemedText>
                )}
              </Pressable>
            </View>

            <Pressable style={styles.resendContainer} onPress={handleResendOtp}>
              <ThemedText style={styles.resendText}>Resend Code</ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      )}
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
  brandLogo: {
    width: 200,
    height: 200,
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
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    zIndex: 1000,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  modalInput: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: Spacing.two,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E2E8F0',
  },
  cancelButtonText: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  verifyButton: {
    backgroundColor: '#2563EB',
  },
  verifyButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  resendContainer: {
    marginTop: Spacing.one,
  },
  resendText: {
    color: '#2563EB',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

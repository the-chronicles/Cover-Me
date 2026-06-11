import React, { useState } from 'react';
import { StyleSheet, View, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { useAlert } from '@/context/AlertToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
export default function LoginScreen() {
  const theme = useTheme();
  const isDark = theme.background === '#0F172A';
  const logoSource = isDark
    ? require('@/assets/images/CoverMe Logo slimW.png')
    : require('@/assets/images/CoverMe Logo Dark.png');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();
  const router = useRouter();
  const { showToast } = useAlert();

  const handleLogin = async () => {
    if (!email || !password) {
      showToast('Please enter your email and password.', 'error');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (error: any) {
      showToast(error.message || 'Incorrect email or password.', 'error');
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
              <Image source={logoSource} style={styles.brandLogo} resizeMode="contain" />
            </View>

            <ThemedView type="backgroundElement" style={styles.formCard}>
              <ThemedText style={[styles.formHeader, { color: theme.text }]}>Sign In</ThemedText>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Email Address</ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="name@email.com"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
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

              <Pressable style={styles.loginButton} onPress={handleLogin} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#F8FAFC" />
                ) : (
                  <ThemedText style={styles.loginButtonText}>Sign In</ThemedText>
                )}
              </Pressable>
            </ThemedView>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
                New to CoverMe?{' '}
              </ThemedText>
              <Link href="/register" asChild>
                <Pressable>
                  <ThemedText type="small" style={styles.registerLink}>
                    Create account
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
  loginButton: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  loginButtonText: {
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
  registerLink: {
    color: '#2563EB',
    fontWeight: 'bold',
  },
});


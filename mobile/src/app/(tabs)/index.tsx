import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator, ScrollView, Platform, Text } from 'react-native';
import { useAlert } from '@/context/AlertToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService, SOSResponse, API_BASE_URL } from '@/services/api';
import { SMSFallbackService } from '@/services/SMSFallbackService';
import { useSpeechActivation } from '@/hooks/useSpeechActivation';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { showAlert, showToast } = useAlert();
  const [loading, setLoading] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [contacts, setContacts] = useState<string[]>([]);
  const [activeSOSInfo, setActiveSOSInfo] = useState<SOSResponse | null>(null);

  // Hook for GPS Tracking (inactive tracking mode initially)
  const { location, batteryLevel, networkLatency, isPowerSavingMode, riskWarning, fetchCurrentLocation } = useLocationTracking(false);

  // Hook for hands-free activation
  const { isListening, startListening, stopListening } = useSpeechActivation({
    onWakeWordDetected: () => handleSOSTrigger('voice'),
  });

  // Fetch contacts on mount so we can use them for offline SMS fallback
  useEffect(() => {
    async function loadContacts() {
      try {
        const raw = await apiService.getContacts();
        // Limit to the 3 most recently added contacts
        const recent = raw.slice(-3);
        setContacts(recent.map((c: any) => c.phone_number));
      } catch (err) {
        setContacts([]);
      }
    }
    loadContacts();
  }, []);

  // Auto network status checker polling GET / every 10 seconds
  useEffect(() => {
    let active = true;
    async function checkConnection() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${API_BASE_URL}/`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (active) {
          setNetworkOnline(res.ok || res.status < 500);
        }
      } catch (err) {
        if (active) {
          setNetworkOnline(false);
        }
      }
    }

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleSOSTrigger = async (source: string = 'button') => {
    setLoading(true);
    setSosActive(true);

    let lat = location.latitude;
    let lng = location.longitude;

    try {
      const fresh = await fetchCurrentLocation();
      if (fresh) {
        lat = fresh.latitude;
        lng = fresh.longitude;
      }
    } catch (err) {
      console.warn("Could not retrieve current position for SOS, using cached coordinates.", err);
    }

    try {
      if (!networkOnline) {
        showAlert(
          'Device is Offline',
          'Choose an offline emergency fallback route to broadcast your location:',
          [
            {
              text: 'SMS Carrier Fallback',
              onPress: async () => {
                const sent = await SMSFallbackService.sendOfflineSMS({
                  contacts,
                  latitude: lat,
                  longitude: lng,
                  triggerSource: source,
                });
                if (sent) showToast('SMS Composer Loaded.', 'success');
              }
            },
            {
              text: 'WhatsApp Fallback',
              onPress: async () => {
                const sent = await SMSFallbackService.sendOfflineWhatsApp({
                  contacts,
                  latitude: lat,
                  longitude: lng,
                  triggerSource: source,
                });
                if (sent) showToast('WhatsApp Composer Loaded.', 'success');
              }
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setSosActive(false)
            }
          ]
        );
        setLoading(false);
        return;
      }

      // Online API trigger
      const data = await apiService.triggerSOS(lat, lng, source);
      setActiveSOSInfo(data);
      showAlert(
        'SOS Alerts Broadcasted',
        `Signals successfully routed!\n\nDelivered to contacts via SMS\n Broadcasted via WhatsApp\nActive Tracking Mode`
      );
    } catch (err) {
      // API call failed, automatically fallback to offline chooser
      showAlert(
        'Server Connection Failed',
        'Could not reach the safety server. Choose an offline fallback route:',
        [
          {
            text: 'SMS Carrier Fallback',
            onPress: async () => {
              const sent = await SMSFallbackService.sendOfflineSMS({
                contacts,
                latitude: lat,
                longitude: lng,
                triggerSource: `${source} (API Failure Fallback)`,
              });
              if (sent) showToast('SMS Composer Loaded.', 'success');
            }
          },
          {
            text: 'WhatsApp Fallback',
            onPress: async () => {
              const sent = await SMSFallbackService.sendOfflineWhatsApp({
                contacts,
                latitude: lat,
                longitude: lng,
                triggerSource: `${source} (API Failure Fallback)`,
              });
              if (sent) showToast('WhatsApp Composer Loaded.', 'success');
            }
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setSosActive(false)
          }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSOS = () => {
    setSosActive(false);
    setActiveSOSInfo(null);
    showToast('SOS Resolved: Location sharing ended.', 'info');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header Branding */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <ThemedText style={styles.greetingText}>
                {user ? `Hi, ${user.full_name.split(' ')[0]}` : 'Hi, User'}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.brandSlogan}>never walk alone.</ThemedText>
            </View>
            <Pressable
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [
                styles.settingsBtn,
                pressed && { opacity: 0.7 }
              ]}
            >
              <Ionicons name="settings" size={24} color={theme.primary} />
            </Pressable>
          </View>

          {riskWarning && (
            <ThemedView type="backgroundElement" style={styles.warningBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="warning" size={16} color="#EF4444" />
                <ThemedText style={styles.warningTitle}>SECURITY RISK WARNING</ThemedText>
              </View>
              <ThemedText style={[styles.warningName, { color: theme.text }]}>{riskWarning.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.warningAdvice}>{riskWarning.advice}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.warningDistance}>Distance: {riskWarning.distance_km}km away</ThemedText>
            </ThemedView>
          )}

          <ThemedView type="backgroundElement" style={styles.statusCard}>
            <View style={styles.statusRow}>
              <ThemedText type="small">Network Mode:</ThemedText>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: networkOnline ? '#10B981' : '#F59E0B' },
                  ]}
                >
                  <ThemedText style={styles.badgeText}>
                    {networkOnline ? 'Online' : 'Offline'}
                  </ThemedText>
                </View>
              </View>
            </View>

            {batteryLevel !== null && (
              <View style={styles.statusRow}>
                <ThemedText type="small">Device Battery:</ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ThemedText themeColor="textSecondary" style={styles.coordinatesText}>
                    {(batteryLevel * 100).toFixed(0)}%
                  </ThemedText>
                  {isPowerSavingMode && batteryLevel <= 0.20 && (
                    <>
                      <Ionicons name="battery-dead" size={14} color="#EF4444" />
                      <ThemedText style={{ color: '#EF4444', fontSize: 12, fontWeight: 'bold' }}>
                        Power Saving Active
                      </ThemedText>
                    </>
                  )}
                </View>
              </View>
            )}

            {isPowerSavingMode && (
              <View style={[styles.statusRow, { marginTop: 4 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="warning" size={14} color="#F59E0B" />
                  <ThemedText type="small" style={{ color: '#F59E0B', fontWeight: 'bold' }}>
                    Power Saving Mode Activated:
                  </ThemedText>
                </View>
                <ThemedText style={{ color: '#F59E0B', fontSize: 12, fontWeight: 'bold' }}>
                  GPS updates scaled to 60s
                </ThemedText>
              </View>
            )}
          </ThemedView>

          {/* Large SOS Pulse Activation Button */}
          <View style={styles.sosContainer}>
            {sosActive ? (
              <View style={styles.activeAlertBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="alert-circle" size={20} color="#EF4444" />
                  <ThemedText style={[styles.activeAlertTitle, { marginBottom: 0 }]}>SOS BROADCAST ACTIVE</ThemedText>
                </View>
                <ThemedText style={styles.activeAlertSubtitle}>
                  Location update stream is broadcasting to your trusted circle.
                </ThemedText>
                {loading && <ActivityIndicator size="large" color="#EF4444" style={styles.loader} />}
                <Pressable style={styles.resolveButton} onPress={handleResolveSOS}>
                  <ThemedText style={styles.resolveButtonText}>Resolve Emergency</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.sosButton,
                  pressed && styles.sosButtonPressed,
                ]}
                onPress={() => handleSOSTrigger('button')}
              >
                <View style={styles.sosInnerButton}>
                  <ThemedText style={styles.sosButtonText}>SOS</ThemedText>
                  <ThemedText style={styles.sosSubtext}>Tap to Trigger</ThemedText>
                </View>
              </Pressable>
            )}
          </View>

          {/* Voice Trigger and Action Cards */}
          <ThemedView type="backgroundElement" style={styles.actionCard}>
            <ThemedText style={styles.sectionTitle}>Hands-free Voice Trigger</ThemedText>
            <View style={styles.voiceRow}>
              <View style={styles.voiceTextContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isListening && <Ionicons name="mic" size={14} color="#EF4444" />}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.voiceStatusText}>
                    {isListening ? 'Listening for wake phrase "Help Me"' : 'Voice activation off'}
                  </ThemedText>
                </View>
              </View>
              <Pressable
                style={[
                  styles.voiceToggle,
                  { backgroundColor: isListening ? '#EF4444' : '#2563EB' },
                ]}
                onPress={isListening ? stopListening : startListening}
              >
                <ThemedText style={styles.voiceToggleText}>
                  {isListening ? 'Stop Listening' : 'Start Listening'}
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          {/* Info panel for user safety circles */}
          <ThemedView type="backgroundElement" style={styles.actionCard}>
            <ThemedText style={styles.sectionTitle}>Current Trusted Contacts</ThemedText>
            {contacts.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">No safety contacts setup. Go to Circle tab to add.</ThemedText>
            ) : (
              contacts.map((contact, index) => (
                <View key={index} style={styles.contactRow}>
                  <ThemedText type="small">Contact {index + 1}:</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.contactNumber}>{contact}</ThemedText>
                </View>
              ))
            )}
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
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? Spacing.one : Spacing.three,
    paddingTop: Platform.OS === 'ios' ? Spacing.two : 0,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  greetingText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563EB', // Vivid Blue
  },
  brandSlogan: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  settingsBtn: {
    padding: Spacing.two,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.two,
    gap: 4,
  },
  warningTitle: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  warningName: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  warningAdvice: {
  },
  warningDistance: {
    fontStyle: 'italic',
  },
  statusCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: 'bold',
  },
  coordinatesText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  sosContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.four,
    height: 180,
  },
  sosButton: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#EF4444', // Vivid Red
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  sosButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  sosInnerButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButtonText: {
    color: '#F8FAFC',
    fontSize: 25,
    fontWeight: 'bold',
  },
  sosSubtext: {
    color: 'rgba(248, 250, 252, 0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  activeAlertBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: Spacing.three,
    padding: Spacing.four,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    alignItems: 'center',
  },
  activeAlertTitle: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: Spacing.two,
  },
  activeAlertSubtitle: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 13,
    marginBottom: Spacing.three,
  },
  loader: {
    marginVertical: Spacing.two,
  },
  resolveButton: {
    backgroundColor: '#0F172A', // Dark Blue
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    width: '100%',
    alignItems: 'center',
  },
  resolveButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  actionCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  voiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceTextContainer: {
    flex: 1,
    marginRight: Spacing.two,
  },
  voiceStatusText: {
  },
  voiceToggle: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  voiceToggleText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: 'bold',
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contactNumber: {
    fontFamily: 'monospace',
  },
});

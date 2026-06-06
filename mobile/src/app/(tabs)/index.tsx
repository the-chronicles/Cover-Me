import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator, ScrollView, Platform, Text, Modal, TextInput } from 'react-native';
import { useAlert } from '@/context/AlertToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService, SOSResponse, SOSActiveInfo, API_BASE_URL } from '@/services/api';
import { SMSFallbackService } from '@/services/SMSFallbackService';
import { useSpeechActivation } from '@/hooks/useSpeechActivation';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

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
  const [unreadCount, setUnreadCount] = useState(0);

  // Watched Journeys state for active dashboard tracking
  const [watchedJourneys, setWatchedJourneys] = useState<any[]>([]);
  const [trackerModalVisible, setTrackerModalVisible] = useState(false);
  const [trackingJourney, setTrackingJourney] = useState<any | null>(null);

  // Emergency Contacts state
  interface EmergencyContact {
    id: number;
    name: string;
    phone_number: string;
    relation: string;
  }
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelation, setContactRelation] = useState('Spouse');
  const [contactActionLoading, setContactActionLoading] = useState(false);

  const maxSeenIdRef = React.useRef<number | null>(null);
  const relationsOptions = ['Spouse', 'Father', 'Mother', 'Sibling', 'Child', 'Friend', 'Colleague', 'Other'];

  // Hook for GPS Tracking (inactive tracking mode initially)
  const { location, batteryLevel, networkLatency, isPowerSavingMode, riskWarning, fetchCurrentLocation } = useLocationTracking(false);

  // Hook for hands-free activation
  const { isListening, startListening, stopListening } = useSpeechActivation({
    onWakeWordDetected: () => handleSOSTrigger('voice'),
  });

  const loadEmergencyContacts = async () => {
    try {
      const data = await apiService.getContacts();
      setEmergencyContacts(data.slice(0, 3));
      setContacts(data.slice(0, 3).map((c: any) => c.phone_number));
    } catch (err) {
      console.warn("Failed to load emergency contacts", err);
    }
  };

  const loadActiveWatchedJourneys = async () => {
    try {
      const data = await apiService.getActiveWatchedJourneys();
      setWatchedJourneys(data);
    } catch (err) {
      console.warn("Failed to load active watched journeys on dashboard", err);
    }
  };

  useEffect(() => {
    loadEmergencyContacts();
    loadActiveWatchedJourneys();
    // Restore active SOS session from backend on startup
    apiService.getActiveSOS().then((activeSOS) => {
      if (activeSOS && activeSOS.status === 'active') {
        console.log('[SOS] Restoring active SOS session:', activeSOS.id);
        setSosActive(true);
        // Build a minimal SOSResponse-compatible object for display
        setActiveSOSInfo({
          status: activeSOS.status,
          sos_id: activeSOS.id,
          source: activeSOS.trigger_source,
          recipient_contacts_count: 0,
          sms_simulated: false,
          whatsapp_simulated: false,
          fallback_payload: { message: '', contacts: [] },
        });
      }
    }).catch((err) => console.warn('[SOS] Could not restore SOS state:', err));
    const interval = setInterval(() => {
      loadActiveWatchedJourneys();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!trackerModalVisible || !trackingJourney) return;

    const interval = setInterval(async () => {
      try {
        const data = await apiService.getActiveWatchedJourneys();
        const fresh = data.find(aj => aj.journey_id === trackingJourney.journey_id);
        if (fresh) {
          setTrackingJourney(fresh);
        }
      } catch (err) {
        console.warn("Could not sync tracking location", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [trackerModalVisible, trackingJourney]);

  const handleOpenAddContact = () => {
    setEditingContactId(null);
    setContactName('');
    setContactPhone('');
    setContactRelation('Spouse');
    setContactModalVisible(true);
  };

  const handleOpenEditContact = (contact: EmergencyContact) => {
    setEditingContactId(contact.id);
    setContactName(contact.name);
    setContactPhone(contact.phone_number);
    setContactRelation(contact.relation || 'Spouse');
    setContactModalVisible(true);
  };

  const handleSaveContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      showToast('Please fill out name and phone number.', 'error');
      return;
    }

    setContactActionLoading(true);
    try {
      const payload = {
        name: contactName.trim(),
        phone_number: contactPhone.trim(),
        relation: contactRelation
      };

      if (editingContactId) {
        await apiService.updateContact(editingContactId, payload);
        showToast('Emergency contact updated successfully.', 'success');
      } else {
        await apiService.addContact(payload);
        showToast('Emergency contact added successfully.', 'success');
      }
      setContactModalVisible(false);
      await loadEmergencyContacts();
    } catch (err: any) {
      showToast(err.message || 'Failed to save contact.', 'error');
    } finally {
      setContactActionLoading(false);
    }
  };

  const handleDeleteContact = async (id: number, name: string) => {
    showAlert(
      'Delete Contact',
      `Are you sure you want to delete emergency contact "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteContact(id);
              showToast('Emergency contact deleted.', 'success');
              await loadEmergencyContacts();
            } catch (err: any) {
              showToast(err.message || 'Failed to delete contact.', 'error');
            }
          }
        }
      ]
    );
  };

  const fetchUnreadCount = async () => {
    try {
      const data = await apiService.getNotifications();
      const unread = data.filter((n: any) => !n.read).length;
      setUnreadCount(unread);

      // Warning push-like observer
      if (data.length > 0) {
        const highestId = Math.max(...data.map((n: any) => n.id));
        if (maxSeenIdRef.current === null) {
          maxSeenIdRef.current = highestId;
        } else if (highestId > maxSeenIdRef.current) {
          const newNotifs = data.filter((n: any) => n.id > maxSeenIdRef.current!);
          maxSeenIdRef.current = highestId;
          newNotifs.forEach((n: any) => {
            if (!n.read) {
              if (n.type === 'sos_alert') {
                showToast(`⚠️ EMERGENCY SOS: ${n.message}`, 'error');
              } else if (n.type === 'circle_invite') {
                showToast(`📩 Circle Invite: ${n.message}`, 'success');
              } else {
                showToast(`🔔 ${n.title}: ${n.message}`, 'info');
              }
            }
          });
        }
      }
    } catch (err) {
      console.warn("Could not fetch notifications count", err);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
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

  const handleResolveSOS = async () => {
    setSosActive(false);
    setActiveSOSInfo(null);
    showToast('SOS Resolved: Location sharing ended.', 'info');
    // Mark as resolved on the backend so the session doesn't persist after next app launch
    try {
      await apiService.resolveSOS();
      console.log('[SOS] Marked as resolved on backend.');
    } catch (err) {
      console.warn('[SOS] Could not notify backend of SOS resolution:', err);
    }
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
              <ThemedText themeColor="textSecondary" style={styles.brandSlogan}>Never Walk Alone.</ThemedText>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => router.push('/notifications')}
                style={({ pressed }) => [
                  styles.settingsBtn,
                  pressed && { opacity: 0.7 }
                ]}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons name="notifications" size={24} color={theme.primary} />
                  {unreadCount > 0 && (
                    <View style={styles.badgeContainer}>
                      <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
              </Pressable>

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
          </View>

          {/* Active Safety Journeys in Progress */}
          {watchedJourneys.length > 0 && (
            <View style={styles.watchedJourneysSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="eye-outline" size={18} color={theme.primary} />
                <ThemedText style={{ fontSize: 15, fontWeight: 'bold' }}>
                  Safety Journeys in Progress ({watchedJourneys.length})
                </ThemedText>
              </View>
              {watchedJourneys.map((wj) => (
                <ThemedView key={wj.journey_id} type="backgroundElement" style={styles.watchedJourneyCard}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <ThemedText style={{ fontWeight: 'bold', fontSize: 14 }}>
                      {wj.traveler_name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Route: {wj.start_location} ➔ {wj.destination}
                    </ThemedText>
                    {wj.license_plate && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Vehicle Plate: {wj.license_plate}
                      </ThemedText>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      setTrackingJourney(wj);
                      setTrackerModalVisible(true);
                    }}
                    style={styles.dashboardTrackBtn}
                  >
                    <Ionicons name="map" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <ThemedText type="smallBold" style={{ color: '#FFFFFF', fontSize: 12 }}>Track</ThemedText>
                  </Pressable>
                </ThemedView>
              ))}
            </View>
          )}

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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <ThemedText style={styles.sectionTitle}>Emergency Contacts ({emergencyContacts.length}/3)</ThemedText>
              {emergencyContacts.length < 3 && (
                <Pressable
                  onPress={handleOpenAddContact}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons name="add-circle" size={18} color={theme.primary} />
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>Add</ThemedText>
                </Pressable>
              )}
            </View>

            {emergencyContacts.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No emergency contacts configured yet. Please add up to 3 contacts who will receive your SOS alerts.
              </ThemedText>
            ) : (
              <View style={{ gap: Spacing.two }}>
                {emergencyContacts.map((contact) => (
                  <View key={contact.id} style={[styles.contactRow, { backgroundColor: theme.background, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.backgroundSelected }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ThemedText style={{ fontWeight: 'bold', fontSize: 13 }}>{contact.name}</ThemedText>
                        <View style={{ backgroundColor: theme.backgroundSelected, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10, fontWeight: 'bold' }}>{contact.relation}</ThemedText>
                        </View>
                      </View>
                      <ThemedText themeColor="textSecondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{contact.phone_number}</ThemedText>
                    </View>
                    
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Pressable onPress={() => handleOpenEditContact(contact)} style={{ padding: 4 }}>
                        <Ionicons name="create-outline" size={18} color={theme.primary} />
                      </Pressable>
                      <Pressable onPress={() => handleDeleteContact(contact.id, contact.name)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>

      {/* Add / Edit Contact Modal */}
      <Modal visible={contactModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: Spacing.two }}>
              <ThemedText style={{ fontSize: 16, fontWeight: 'bold' }}>
                {editingContactId ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
              </ThemedText>
              <Pressable onPress={() => setContactModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            <View style={{ width: '100%', gap: 6, marginBottom: Spacing.two }}>
              <ThemedText type="small">Full Name</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.backgroundSelected }]}
                placeholder="e.g. John Doe"
                placeholderTextColor={theme.textSecondary}
                value={contactName}
                onChangeText={setContactName}
              />
            </View>

            <View style={{ width: '100%', gap: 6, marginBottom: Spacing.two }}>
              <ThemedText type="small">Phone Number</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.backgroundSelected }]}
                placeholder="e.g. +2348033011234"
                placeholderTextColor={theme.textSecondary}
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={{ width: '100%', gap: 6, marginBottom: Spacing.four }}>
              <ThemedText type="small">Relationship</ThemedText>
              <View style={styles.badgeRow}>
                {relationsOptions.map((r) => {
                  const isSelected = contactRelation === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setContactRelation(r)}
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.background,
                          borderColor: theme.backgroundSelected,
                          paddingVertical: 6,
                          paddingHorizontal: 12
                        }
                      ]}
                    >
                      <ThemedText style={{ color: isSelected ? '#F8FAFC' : theme.text, fontSize: 12 }}>
                        {r}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              style={[styles.resolveButton, { width: '100%' }]}
              onPress={handleSaveContact}
              disabled={contactActionLoading}
            >
              {contactActionLoading ? (
                <ActivityIndicator color="#F8FAFC" />
              ) : (
                <ThemedText style={{ color: '#F8FAFC', fontWeight: 'bold' }}>Save Contact</ThemedText>
              )}
            </Pressable>
          </ThemedView>
        </View>
      </Modal>

      {/* Traveler live tracker map modal */}
      <Modal visible={trackerModalVisible} animationType="slide" transparent={false}>
        <ThemedView style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)' }}>
              <View>
                <ThemedText style={{ fontSize: 18, fontWeight: 'bold' }}>Live Location Tracking</ThemedText>
                <ThemedText themeColor="textSecondary" style={{ fontSize: 12 }}>Tracking traveler: {trackingJourney?.traveler_name}</ThemedText>
              </View>
              <Pressable onPress={() => { setTrackerModalVisible(false); setTrackingJourney(null); }} style={{ padding: 6 }}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            
            <View style={{ padding: 16, gap: 4 }}>
              <ThemedText style={{ fontSize: 14 }}>
                <ThemedText style={{ fontWeight: 'bold' }}>Route: </ThemedText>
                {trackingJourney?.start_location} ➔ {trackingJourney?.destination}
              </ThemedText>
              {trackingJourney?.license_plate && (
                <ThemedText style={{ fontSize: 13 }} themeColor="textSecondary">
                  Vehicle Plate: {trackingJourney.license_plate}
                </ThemedText>
              )}
            </View>

            {Platform.OS !== 'web' && trackingJourney?.last_lat && trackingJourney?.last_lng ? (
              <MapView
                style={{ flex: 1 }}
                initialRegion={{
                  latitude: trackingJourney.last_lat,
                  longitude: trackingJourney.last_lng,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
                region={{
                  latitude: trackingJourney.last_lat,
                  longitude: trackingJourney.last_lng,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
              >
                <Marker
                  coordinate={{ latitude: trackingJourney.last_lat, longitude: trackingJourney.last_lng }}
                  title={trackingJourney.traveler_name}
                  description={`Last sync: ${trackingJourney.location_updated_at ? new Date(trackingJourney.location_updated_at).toLocaleTimeString() : 'now'}`}
                  pinColor="#EF4444"
                />
              </MapView>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: theme.backgroundSelected, margin: 16, borderRadius: 12, padding: 20 }}>
                <Ionicons name="map" size={40} color={theme.textSecondary} style={{ marginBottom: 12 }} />
                <ThemedText style={{ fontWeight: 'bold', textAlign: 'center' }}>Live Location Map</ThemedText>
                {trackingJourney?.last_lat && trackingJourney?.last_lng ? (
                  <ThemedText style={{ textAlign: 'center', marginTop: 6, fontSize: 13 }} themeColor="textSecondary">
                    Traveler is at Lat: {trackingJourney.last_lat.toFixed(5)}, Lng: {trackingJourney.last_lng.toFixed(5)}
                  </ThemedText>
                ) : (
                  <ThemedText style={{ textAlign: 'center', marginTop: 6, fontSize: 13 }} themeColor="textSecondary">
                    No coordinates received yet from traveler. Waiting for GPS update...
                  </ThemedText>
                )}
                <ThemedText type="small" style={{ textAlign: 'center', marginTop: 16 }} themeColor="textSecondary">
                  Note: Interactive MapView is optimized for physical iOS and Android devices.
                </ThemedText>
              </View>
            )}
          </SafeAreaView>
        </ThemedView>
      </Modal>
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
    fontSize: 12,
    // fontStyle: 'italic',
  },
  settingsBtn: {
    padding: Spacing.two,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeContainer: {
    position: 'absolute',
    right: -4,
    top: -4,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    padding: Spacing.five,
    borderRadius: Spacing.three,
    alignItems: 'center',
    width: '85%',
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  badge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  watchedJourneysSection: {
    marginVertical: Spacing.two,
    gap: Spacing.two,
  },
  watchedJourneyCard: {
    padding: Spacing.three,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dashboardTrackBtn: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
});

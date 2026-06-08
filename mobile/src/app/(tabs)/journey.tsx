import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, Pressable, ScrollView, Image, Modal, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '@/context/AlertToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService, Journey } from '@/services/api';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';

export default function JourneyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert, showToast } = useAlert();
  const [startLoc, setStartLoc] = useState('');
  const [destination, setDestination] = useState('');
  const [duration, setDuration] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [platePhoto, setPlatePhoto] = useState<string | null>(null);

  // Watcher selection states
  const [circles, setCircles] = useState<any[]>([]);
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);
  const [watcherMode, setWatcherMode] = useState<'circle' | 'member'>('circle');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  // State for active journey
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [isScanningPlate, setIsScanningPlate] = useState(false);

  const runPlateOcr = async (photoUri: string) => {
    setIsScanningPlate(true);
    setLicensePlate('Scanning plate...');
    try {
      console.log('[Plate OCR] Sending image for immediate detection...');
      const response = await apiService.detectLicensePlate(photoUri);
      console.log('[Plate OCR] Detection result:', response);
      if (response && response.license_plate && response.license_plate !== 'UNKNOWN-PLATE') {
        setLicensePlate(response.license_plate);
        showToast('License plate scanned successfully.', 'info');
      } else {
        setLicensePlate('');
        showToast('Could not read plate number. Please enter manually.', 'warning');
      }
    } catch (err) {
      console.warn('[Plate OCR] Immediate scanning failed:', err);
      setLicensePlate('');
      showToast('Could not read plate number. Please enter manually.', 'warning');
    } finally {
      setIsScanningPlate(false);
    }
  };

  // Hook for GPS Location Tracking (toggled on when journey is active)
  const { location, isPowerSavingMode, riskWarning } = useLocationTracking(activeJourney !== null);

  // State for tracking route coordinate points
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);

  // Accumulate coordinate breadcrumbs during active tracking
  useEffect(() => {
    if (activeJourney && location) {
      setRouteCoordinates((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.latitude === location.latitude && last.longitude === location.longitude) {
          return prev;
        }
        return [...prev, { latitude: location.latitude, longitude: location.longitude }];
      });
    } else if (!activeJourney) {
      setRouteCoordinates([]);
    }
  }, [location, activeJourney]);

  // Load safety circles on mount + restore any active journey from backend
  useEffect(() => {
    async function loadCircles() {
      try {
        const data = await apiService.getMyCircles();
        setCircles(data);
        if (data.length > 0) {
          setSelectedCircleId(data[0].id);
        }
      } catch (err) {
        console.warn("Could not load circles", err);
      }
    }
    loadCircles();

    // Restore active journey session from backend on startup
    apiService.getMyActiveJourney().then((activeJ) => {
      if (activeJ && activeJ.is_active) {
        console.log('[Journey] Restoring active journey session:', activeJ.id);
        setActiveJourney(activeJ);
        setStartLoc(activeJ.start_location);
        setDestination(activeJ.destination);
        setDuration(String(activeJ.duration_minutes));
        if (activeJ.license_plate) setLicensePlate(activeJ.license_plate);
      }
    }).catch((err) => console.warn('[Journey] Could not restore journey state:', err));
  }, []);

  const handleStartJourney = async () => {
    if (isScanningPlate) {
      showToast('Please wait for the plate scan to finish.', 'error');
      return;
    }

    if (!startLoc || !destination || !duration) {
      showToast('Please provide start location, destination, and duration.', 'error');
      return;
    }

    if (circles.length === 0) {
      showToast('Please create or join a circle to select a watcher.', 'error');
      return;
    }

    const activeCircle = circles.find(c => c.id === selectedCircleId);
    if (!activeCircle) {
      showToast('Please select a circle.', 'error');
      return;
    }

    if (watcherMode === 'member' && !selectedMemberId) {
      showToast('Please select a circle member as your watcher.', 'error');
      return;
    }

    try {
      const minutes = parseInt(duration);
      if (isNaN(minutes)) {
        showToast('Duration must be a number representing minutes.', 'error');
        return;
      }

      // Resolve watcher details
      const payload: any = {
        start_location: startLoc,
        destination,
        duration_minutes: minutes,
        license_plate: licensePlate || undefined,
        watcher_type: watcherMode,
        watcher_id: watcherMode === 'circle' ? selectedCircleId : selectedMemberId
      };

      const journey = await apiService.startJourney(payload);

      setActiveJourney(journey);

      if (platePhoto) {
        setIsUploading(true);
        try {
          console.log('[Plate Upload] Initiating photo upload for journey:', journey.id, 'URI:', platePhoto);
          const photoResponse = await apiService.uploadVehiclePhoto(journey.id, platePhoto, licensePlate);
          console.log('[Plate Upload] Upload successful. Detected plate:', photoResponse.ocr_license_plate_detected);
          setLicensePlate(photoResponse.ocr_license_plate_detected);
          setActiveJourney(prev => prev ? { ...prev, license_plate: photoResponse.ocr_license_plate_detected } : null);
        } catch (photoErr) {
          console.error('[Plate Upload] Photo upload failed with error:', photoErr);
          console.warn("Plate photo upload offline fallback active.");
        } finally {
          setIsUploading(false);
        }
      }

      // Compile watcher description text
      let watcherDesc = '';
      if (watcherMode === 'circle') {
        watcherDesc = `circle "${activeCircle.name}"`;
      } else {
        const mem = activeCircle.members.find((m: any) => m.user_id === selectedMemberId);
        watcherDesc = mem ? mem.full_name : 'selected watcher';
      }

      showAlert(
        'Follow Me Journey Started',
        `Continuous location updates are now sharing with ${watcherDesc} for your trip from ${startLoc} to ${destination}.`
      );
    } catch (err) {
      showToast('Could not sync with the API server. Please check your network.', 'error');
    }
  };

  const handleEndJourney = async () => {
    setActiveJourney(null);
    setStartLoc('');
    setDestination('');
    setDuration('');
    setLicensePlate('');
    setPlatePhoto(null);
    showToast('Journey Ended: Location sharing ceased.', 'info');
    // Mark the journey as ended on the backend so it doesn't resurface on restart
    try {
      await apiService.endJourney();
      console.log('[Journey] Marked as ended on backend.');
    } catch (err) {
      console.warn('[Journey] Could not notify backend of journey end:', err);
    }
  };

  const handleCaptureLicensePlate = async () => {
    // Request device camera and library permissions
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraPermission.status !== 'granted' && libraryPermission.status !== 'granted') {
      showAlert(
        'Permission Denied',
        'CoverMe needs access to your camera or gallery to verify vehicle license plates.'
      );
      return;
    }

    showAlert(
      'Verify License Plate',
      'Take a photo of the vehicle plate or choose an existing photo from your library:',
      [
        {
          text: 'Use Camera',
          onPress: async () => {
            if (cameraPermission.status !== 'granted') {
              const req = await ImagePicker.requestCameraPermissionsAsync();
              if (req.status !== 'granted') return;
            }
            try {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                const pickedUri = result.assets[0].uri;
                setPlatePhoto(pickedUri);
                runPlateOcr(pickedUri);
              }
            } catch (err) {
              console.warn('Camera launch failed', err);
            }
          }
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            if (libraryPermission.status !== 'granted') {
              const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (req.status !== 'granted') return;
            }
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                const pickedUri = result.assets[0].uri;
                setPlatePhoto(pickedUri);
                runPlateOcr(pickedUri);
              }
            } catch (err) {
              console.warn('Image library launch failed', err);
            }
          }
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Follow Me</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>Continuous safety tracking for your route</ThemedText>
          </View>

          {activeJourney ? (
            // Active Journey Card Dashboard
            <ThemedView type="backgroundElement" style={styles.activeCard}>
              <View style={styles.activeHeader}>
                <View style={styles.pulseDot} />
                <ThemedText style={styles.activeTitle}>ACTIVE TRACKING SESSION</ThemedText>
              </View>

              <View style={styles.journeyInfoRow}>
                <ThemedText type="small" themeColor="textSecondary">From:</ThemedText>
                <ThemedText style={[styles.journeyInfoText, { color: theme.text }]}>{activeJourney.start_location}</ThemedText>
              </View>

              <View style={styles.journeyInfoRow}>
                <ThemedText type="small" themeColor="textSecondary">To:</ThemedText>
                <ThemedText style={[styles.journeyInfoText, { color: theme.text }]}>{activeJourney.destination}</ThemedText>
              </View>

              <View style={styles.journeyInfoRow}>
                <ThemedText type="small" themeColor="textSecondary">Watcher:</ThemedText>
                <ThemedText style={[styles.journeyInfoText, { color: theme.text }]}>{activeJourney.emergency_contact_phone}</ThemedText>
              </View>

              <View style={styles.journeyInfoRow}>
                <ThemedText type="small" themeColor="textSecondary">Estimated duration:</ThemedText>
                <ThemedText style={[styles.journeyInfoText, { color: theme.text }]}>{activeJourney.duration_minutes} minutes</ThemedText>
              </View>

              <View style={styles.journeyInfoRow}>
                <ThemedText type="small" themeColor="textSecondary">Current Coordinates:</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.coordinatesText}>
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </ThemedText>
              </View>

              {isPowerSavingMode && (
                <View style={styles.journeyInfoRow}>
                  <ThemedText type="small" style={{ color: '#F59E0B' }}>Tracking Profile:</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="battery-dead" size={14} color="#F59E0B" />
                    <ThemedText style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: 12 }}>
                      Power Saving Mode Active (60s updates)
                    </ThemedText>
                  </View>
                </View>
              )}

              {riskWarning && (
                <View style={styles.journeyWarningBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="warning" size={16} color="#EF4444" />
                    <ThemedText style={[styles.journeyWarningTitle, { marginBottom: 0 }]}>SECURITY RISK ZONE</ThemedText>
                  </View>
                  <ThemedText style={[styles.journeyWarningName, { color: theme.text }]}>{riskWarning.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.journeyWarningAdvice}>{riskWarning.advice}</ThemedText>
                </View>
              )}

              {/* Live Map Render (optimized for native, fallback placeholder for web browser dev) */}
              {Platform.OS !== 'web' ? (
                <MapView
                  style={styles.map}
                  initialRegion={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015,
                  }}
                  region={{
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015,
                  }}
                >
                  <Marker
                    coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                    title={`${user?.full_name || 'You'} (Traveler)`}
                    description="Continuous safety stream active"
                    pinColor="#2563EB"
                  />
                  {routeCoordinates.length > 1 && (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor="#2563EB"
                      strokeWidth={4}
                    />
                  )}
                </MapView>
              ) : (
                <View style={styles.webMapPlaceholder}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="map" size={20} color={theme.textSecondary} />
                    <ThemedText style={styles.placeholderText}>Live Location Tracking Map</ThemedText>
                  </View>
                  <ThemedText type="small" style={styles.placeholderSubtext}>
                    Map rendering is optimized for native iOS/Android devices. Tracing {routeCoordinates.length} path breadcrumbs.
                  </ThemedText>
                </View>
              )}

              {activeJourney.license_plate && (
                <View style={styles.journeyInfoRow}>
                  <ThemedText type="small" themeColor="textSecondary">License Plate:</ThemedText>
                  <View style={[styles.plateBadge, { backgroundColor: theme.backgroundSelected, borderColor: theme.backgroundSelected }]}>
                    <ThemedText style={[styles.plateText, { color: theme.text }]}>{activeJourney.license_plate}</ThemedText>
                  </View>
                </View>
              )}

              <Pressable style={styles.endButton} onPress={handleEndJourney}>
                <ThemedText style={styles.endButtonText}>Complete & End Journey</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            // Form to Setup a Journey
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Take-off point</ThemedText>
                <TextInput
                  style={{ ...styles.input, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }}
                  placeholder="e.g. Yaba, Lagos"
                  placeholderTextColor={theme.textSecondary}
                  value={startLoc}
                  onChangeText={setStartLoc}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Destination</ThemedText>
                <TextInput
                  style={{ ...styles.input, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }}
                  placeholder="e.g. Ogbomoso North, Oyo"
                  placeholderTextColor={theme.textSecondary}
                  value={destination}
                  onChangeText={setDestination}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Estimated Journey Time (minutes)</ThemedText>
                <TextInput
                  style={{ ...styles.input, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }}
                  placeholder="e.g. 60"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  value={duration}
                  onChangeText={setDuration}
                />
              </View>

              {/* WATCHER SELECTION LAYER */}
              <View style={styles.inputGroup}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Designated Emergency Watchers</ThemedText>
                {circles.length === 0 ? (
                  <ThemedView type="backgroundElement" style={styles.noCirclesCard}>
                    <Ionicons name="warning-outline" size={24} color="#F59E0B" />
                    <ThemedText style={{ fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                      You need to join or create a circle first to select journey watchers.
                    </ThemedText>
                    <Pressable
                      onPress={() => router.push('/contacts')}
                      style={{ backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginTop: 8 }}
                    >
                      <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Go to Circles Screen</ThemedText>
                    </Pressable>
                  </ThemedView>
                ) : (
                  <View style={{ gap: 10 }}>
                    {/* Circle selector row */}
                    <ThemedText type="smallBold">1. Select Circle</ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {circles.map((c) => {
                        const isSelected = selectedCircleId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => {
                              setSelectedCircleId(c.id);
                              // Reset member selection when changing circle
                              const circleMem = c.members.filter((m: any) => m.user_id !== user?.id);
                              if (circleMem.length > 0) {
                                setSelectedMemberId(circleMem[0].user_id);
                              } else {
                                setSelectedMemberId(null);
                              }
                            }}
                            style={[
                              styles.circleSelectorBtn,
                              {
                                backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                                borderColor: theme.backgroundSelected
                              }
                            ]}
                          >
                            <ThemedText style={{ color: isSelected ? '#FFFFFF' : theme.text, fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>
                              {c.name}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {/* Mode selector: Whole Circle vs Member */}
                    <ThemedText type="smallBold">2. Watcher Target</ThemedText>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable
                        onPress={() => setWatcherMode('circle')}
                        style={[
                          styles.modeBtn,
                          {
                            flex: 1,
                            backgroundColor: watcherMode === 'circle' ? theme.primary : theme.backgroundElement,
                            borderColor: theme.backgroundSelected
                          }
                        ]}
                      >
                        <Ionicons name="people-outline" size={16} color={watcherMode === 'circle' ? '#FFFFFF' : theme.text} />
                        <ThemedText style={{ color: watcherMode === 'circle' ? '#FFFFFF' : theme.text, fontSize: 12 }}>Whole Circle</ThemedText>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setWatcherMode('member');
                          // Initialize member selection
                          const selectedC = circles.find(c => c.id === selectedCircleId);
                          const members = selectedC ? selectedC.members.filter((m: any) => m.user_id !== user?.id) : [];
                          if (members.length > 0) {
                            setSelectedMemberId(members[0].user_id);
                          }
                        }}
                        style={[
                          styles.modeBtn,
                          {
                            flex: 1,
                            backgroundColor: watcherMode === 'member' ? theme.primary : theme.backgroundElement,
                            borderColor: theme.backgroundSelected
                          }
                        ]}
                      >
                        <Ionicons name="person-outline" size={16} color={watcherMode === 'member' ? '#FFFFFF' : theme.text} />
                        <ThemedText style={{ color: watcherMode === 'member' ? '#FFFFFF' : theme.text, fontSize: 12 }}>Single Member</ThemedText>
                      </Pressable>
                    </View>

                    {/* Member selector list if Single Member mode */}
                    {watcherMode === 'member' && (
                      <View style={{ gap: 6 }}>
                        <ThemedText type="smallBold">3. Select Watching Member</ThemedText>
                        {(() => {
                          const activeC = circles.find(c => c.id === selectedCircleId);
                          const members = activeC ? activeC.members.filter((m: any) => m.user_id !== user?.id) : [];

                          if (members.length === 0) {
                            return (
                              <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic', paddingVertical: 4 }}>
                                No other members in this circle. Select "Whole Circle" or invite people to join.
                              </ThemedText>
                            );
                          }

                          return (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                              {members.map((m: any) => {
                                const isSelected = selectedMemberId === m.user_id;
                                return (
                                  <Pressable
                                    key={m.user_id}
                                    onPress={() => setSelectedMemberId(m.user_id)}
                                    style={[
                                      styles.circleSelectorBtn,
                                      {
                                        backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                                        borderColor: theme.backgroundSelected
                                      }
                                    ]}
                                  >
                                    <ThemedText style={{ color: isSelected ? '#FFFFFF' : theme.text, fontSize: 12, fontWeight: isSelected ? 'bold' : 'normal' }}>
                                      {m.full_name} ({m.role})
                                    </ThemedText>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          );
                        })()}
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Vehicle Verification Plate Scanner Card */}
              <ThemedView type="backgroundElement" style={styles.plateCard}>
                <ThemedText style={[styles.plateCardTitle, { color: theme.text }]}>Vehicle Verification (Optional)</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.plateCardDesc}>
                  Enter license plate details manually, capture a photo of the vehicle plate to run local OCR, or skip it entirely.
                </ThemedText>

                <View style={{ width: '100%', gap: 6, marginVertical: Spacing.one }}>
                  <ThemedText type="small">License Plate Number</ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        height: 40,
                        backgroundColor: theme.background,
                        color: theme.text,
                        borderColor: theme.backgroundSelected,
                        opacity: isScanningPlate ? 0.6 : 1
                      }
                    ]}
                    placeholder={isScanningPlate ? "Scanning photo..." : "e.g. LAG-123AA (Optional)"}
                    placeholderTextColor={theme.textSecondary}
                    value={licensePlate}
                    onChangeText={setLicensePlate}
                    editable={!isScanningPlate}
                  />
                </View>

                {platePhoto ? (
                  <View style={styles.scannedRow}>
                    <View style={styles.scannedDetails}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {isScanningPlate ? "Scanning photo..." : "Scanned photo loaded"}
                      </ThemedText>
                    </View>
                    <Pressable onPress={() => { setPlatePhoto(null); setLicensePlate(''); }} disabled={isScanningPlate}>
                      <ThemedText style={[styles.clearText, { opacity: isScanningPlate ? 0.5 : 1 }]}>Clear Photo</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={[styles.scanButton, { backgroundColor: theme.backgroundSelected }]} onPress={handleCaptureLicensePlate}>
                    <ThemedText style={[styles.scanButtonText, { color: theme.text }]}>📷 Capture Plate Photo instead</ThemedText>
                  </Pressable>
                )}
              </ThemedView>

              {/* Start Button */}
              <Pressable style={styles.startButton} onPress={handleStartJourney}>
                <ThemedText style={styles.startButtonText}>Initiate Follow Me Session</ThemedText>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Simulated camera capture modal */}
      <Modal visible={cameraModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ActivityIndicator size="large" color="#2563EB" />
            <ThemedText style={styles.modalText}>Opening Camera...</ThemedText>
            <ThemedText type="small" style={styles.modalSubtext}>
              Running Local OCR scanner to locate license plate...
            </ThemedText>
          </ThemedView>
        </View>
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
  },
  header: {
    marginVertical: Spacing.three,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  formContainer: {
    gap: Spacing.three,
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
  plateCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  plateCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  plateCardDesc: {
    fontSize: 12,
  },
  scanButton: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  scanButtonText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  scannedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  scannedDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  plateBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  plateText: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  clearText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  startButton: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  startButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
  activeCard: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1.5,
    borderColor: '#2563EB',
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  activeTitle: {
    fontWeight: 'bold',
    color: '#2563EB',
    fontSize: 14,
  },
  journeyInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.5)',
    paddingBottom: Spacing.two,
  },
  journeyInfoText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  coordinatesText: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 12,
  },
  endButton: {
    backgroundColor: '#EF4444',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  endButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
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
    width: '80%',
    gap: Spacing.three,
  },
  modalText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: Spacing.two,
  },
  modalSubtext: {
    textAlign: 'center',
  },
  map: {
    height: 200,
    width: '100%',
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
  },
  webMapPlaceholder: {
    height: 200,
    width: '100%',
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing.three,
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  placeholderSubtext: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  journeyWarningBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.one,
    gap: 2,
  },
  journeyWarningTitle: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 12,
  },
  journeyWarningName: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  journeyWarningAdvice: {
    fontSize: 11,
  },
  noCirclesCard: {
    padding: Spacing.four,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  circleSelectorBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  modeBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});

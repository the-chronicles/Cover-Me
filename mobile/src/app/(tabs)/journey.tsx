import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, Pressable, ScrollView, Alert, Image, Modal, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService, Journey } from '@/services/api';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTheme } from '@/hooks/use-theme';

export default function JourneyScreen() {
  const theme = useTheme();
  const [startLoc, setStartLoc] = useState('');
  const [destination, setDestination] = useState('');
  const [contact, setContact] = useState('');
  const [duration, setDuration] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [platePhoto, setPlatePhoto] = useState<string | null>(null);

  // State for active journey
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);

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

  const handleStartJourney = async () => {
    if (!startLoc || !destination || !contact || !duration) {
      Alert.alert('Incomplete Form', 'Please provide start location, destination, emergency contact, and duration.');
      return;
    }

    try {
      const minutes = parseInt(duration);
      if (isNaN(minutes)) {
        Alert.alert('Invalid Duration', 'Duration must be a number representing minutes.');
        return;
      }

      const journey = await apiService.startJourney({
        start_location: startLoc,
        destination,
        emergency_contact_phone: contact,
        duration_minutes: minutes,
        license_plate: licensePlate || undefined
      });

      setActiveJourney(journey);

      if (platePhoto) {
        setIsUploading(true);
        try {
          const photoResponse = await apiService.uploadVehiclePhoto(journey.id, platePhoto, licensePlate);
          setLicensePlate(photoResponse.ocr_license_plate_detected);
          // Update local active journey representation with parsed plate
          setActiveJourney(prev => prev ? { ...prev, license_plate: photoResponse.ocr_license_plate_detected } : null);
        } catch (photoErr) {
          console.warn("Plate photo upload offline fallback active.");
        } finally {
          setIsUploading(false);
        }
      }

      Alert.alert(
        'Follow Me Journey Started',
        `Continuous location updates are now sharing with ${contact} for your trip from ${startLoc} to ${destination}.`
      );
    } catch (err) {
      Alert.alert('Error Starting Journey', 'Could not sync with the API server. Please check your network.');
    }
  };

  const handleEndJourney = () => {
    setActiveJourney(null);
    setStartLoc('');
    setDestination('');
    setContact('');
    setDuration('');
    setLicensePlate('');
    setPlatePhoto(null);
    Alert.alert('Journey Ended', 'Location updates for this trip have ceased.');
  };

  const handleCaptureLicensePlate = async () => {
    // Request device camera and library permissions
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraPermission.status !== 'granted' && libraryPermission.status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'CoverMe needs access to your camera or gallery to verify vehicle license plates.'
      );
      return;
    }

    Alert.alert(
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
                setLicensePlate('Verify on start...');
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
                setLicensePlate('Verify on start...');
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
            <ThemedText style={styles.title}>Follow Me Journey</ThemedText>
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
                  <ThemedText style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: 12 }}>🔋 ECO Mode Active (60s updates)</ThemedText>
                </View>
              )}

              {riskWarning && (
                <View style={styles.journeyWarningBox}>
                  <ThemedText style={styles.journeyWarningTitle}>🚨 SECURITY RISK ZONE</ThemedText>
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
                    title="Current Location"
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
                  <ThemedText style={styles.placeholderText}>🗺️ Live Location Tracking Map</ThemedText>
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
                <ThemedText type="small" themeColor="textSecondary" style={styles.label}>Designated Emergency Watcher Phone</ThemedText>
                <TextInput
                  style={{ ...styles.input, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }}
                  placeholder="e.g. +2348033011234"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  value={contact}
                  onChangeText={setContact}
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

              {/* Vehicle Verification Plate Scanner Card */}
              <ThemedView type="backgroundElement" style={styles.plateCard}>
                <ThemedText style={[styles.plateCardTitle, { color: theme.text }]}>Vehicle Verification</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.plateCardDesc}>
                  Capture license plate photo. CoverMe uses local OCR to scan plate details to save with your route safety packet.
                </ThemedText>

                {platePhoto ? (
                  <View style={styles.scannedRow}>
                    <View style={styles.scannedDetails}>
                      <ThemedText type="small" themeColor="textSecondary">Scanned plate:</ThemedText>
                      <View style={[styles.plateBadge, { backgroundColor: theme.backgroundSelected, borderColor: theme.backgroundSelected }]}>
                        <ThemedText style={[styles.plateText, { color: theme.text }]}>{licensePlate || 'Processing...'}</ThemedText>
                      </View>
                    </View>
                    <Pressable onPress={() => setPlatePhoto(null)}>
                      <ThemedText style={styles.clearText}>Clear</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={[styles.scanButton, { backgroundColor: theme.backgroundSelected }]} onPress={handleCaptureLicensePlate}>
                    <ThemedText style={[styles.scanButtonText, { color: theme.text }]}>📷 Capture License Plate</ThemedText>
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
});

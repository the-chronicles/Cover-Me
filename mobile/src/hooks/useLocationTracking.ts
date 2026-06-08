import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { Platform } from 'react-native';
import { API_BASE_URL, apiService, apiFetch } from '../services/api';
import { authStorage } from '../services/auth';

export interface GPSLocation {
  latitude: number;
  longitude: number;
}

export interface RiskWarning {
  in_hotspot: boolean;
  name: string;
  advice: string;
  distance_km: number;
}

export function useLocationTracking(isTrackingActive: boolean = false) {
  const [location, setLocation] = useState<GPSLocation>({ latitude: 6.5244, longitude: 3.3792 }); // default Lagos
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  
  // Optimization metrics states
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [networkLatency, setNetworkLatency] = useState<number>(0);
  const [riskWarning, setRiskWarning] = useState<RiskWarning | null>(null);

  const trackingSubscription = useRef<Location.LocationSubscription | null>(null);
  const simInterval = useRef<any>(null);

  // Power saving is active if battery is <= 20% or latency >= 1500ms
  const isPowerSavingMode = (batteryLevel !== null && batteryLevel <= 0.20) || networkLatency >= 1500;

  // 1. Monitor battery levels and status
  useEffect(() => {
    async function loadBattery() {
      try {
        const initialLevel = await Battery.getBatteryLevelAsync();
        setBatteryLevel(initialLevel);
      } catch (err) {
        console.warn('Could not read initial battery status:', err);
      }
    }
    loadBattery();

    let subscription: Battery.Subscription | null = null;
    try {
      subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        setBatteryLevel(batteryLevel);
      });
    } catch (err) {
      console.warn('Failed to register battery level listener:', err);
    }

    return () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch (err) {
          // Suppress AppContextLost Swift error during hot reload
        }
      }
    };
  }, []);

  // 2. Requests standard foreground device permission
  const requestLocationPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      if (status !== 'granted') {
        setErrorMsg('Location permission was denied');
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error requesting location permissions:', err);
      return false;
    }
  };

  // 3. Fetch current coordinates once (for dashboard)
  const fetchCurrentLocation = async (): Promise<GPSLocation | null> => {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) return null;

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      setLocation(coords);
      return coords;
    } catch (err) {
      console.warn('Could not retrieve current position, defaulting coordinates.', err);
      return null;
    }
  };

  // 4. Sync location coordinates to the FastAPI server and measure latency
  const syncLocationWithBackend = async (lat: number, lng: number) => {
    const startTime = Date.now();
    try {
      const token = await authStorage.getToken();
      if (!token) return; // Only sync location if user is authenticated

      const response = await apiFetch(`${API_BASE_URL}/location/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ lat, lng }),
      });
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      setNetworkLatency(latency);

      // Parse JSON to retrieve risk warnings from geofencing
      const data = await response.json();
      if (data.risk_warning) {
        setRiskWarning(data.risk_warning);
      } else {
        setRiskWarning(null);
      }

      console.log(`[GPS Sync] Coordinates synced: ${lat.toFixed(5)}, ${lng.toFixed(5)} (${latency}ms)`);
    } catch (err) {
      const endTime = Date.now();
      setNetworkLatency(endTime - startTime);
      setRiskWarning(null);
      console.warn('[GPS Sync] Backend connection failed (sync logged offline).');
    }
  };

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  // 5. Background/Foreground Location tracking subscription trigger
  useEffect(() => {
    let active = true;

    async function startLiveTracking() {
      const hasPermission = await requestLocationPermissions();
      
      // Developer simulation path (Yaba -> Ikeja) for emulators / web
      if (!hasPermission || Platform.OS === 'web') {
        const simSpeed = isPowerSavingMode ? 30000 : 8000; // 30s in power saving vs 8s normal
        console.log(`[GPS Tracking] Using Simulated Nigeria Route updates (Power Saving Mode: ${isPowerSavingMode ? 'YES (30s interval)' : 'NO (8s interval)'})...`);
        
        let step = 0;
        const simulatedCoords = [
          { latitude: 6.5189, longitude: 3.3695 }, // Yaba
          { latitude: 6.5355, longitude: 3.3678 }, // Maryland
          { latitude: 6.5562, longitude: 3.3721 }, // Anthony
          { latitude: 6.5784, longitude: 3.3644 }, // Ojota
          { latitude: 6.5908, longitude: 3.3512 }, // Alausa
          { latitude: 6.5966, longitude: 3.3362 }, // Ikeja (Hotspot alert!)
        ];

        simInterval.current = setInterval(() => {
          if (!active) return;
          const nextLoc = simulatedCoords[step % simulatedCoords.length];
          setLocation(nextLoc);
          syncLocationWithBackend(nextLoc.latitude, nextLoc.longitude);
          step++;
        }, simSpeed);
        return;
      }

      // Device GPS tracking
      try {
        const trackingInterval = isPowerSavingMode ? 60000 : 10000; // 60 seconds power saving vs 10 seconds normal
        const trackingDistance = isPowerSavingMode ? 50 : 10;      // 50 meters power saving vs 10 meters normal
        
        console.log(`[GPS Tracking] Profile: ${isPowerSavingMode ? 'POWER SAVING' : 'NORMAL'}. Interval: ${trackingInterval}ms, Distance: ${trackingDistance}m`);

        trackingSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: trackingInterval,
            distanceInterval: trackingDistance,
          },
          (newLocation) => {
            if (!active) return;
            const newCoords = {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
            };
            setLocation(newCoords);
            syncLocationWithBackend(newCoords.latitude, newCoords.longitude);
          }
        );
      } catch (err) {
        console.warn('Failed to watch location positions:', err);
      }
    }

    if (isTrackingActive) {
      startLiveTracking();
    } else {
      // Clean up subscription
      if (trackingSubscription.current) {
        try {
          trackingSubscription.current.remove();
        } catch (err) {
          // Suppress AppContextLost Swift error during hot reload
        }
        trackingSubscription.current = null;
      }
      if (simInterval.current) {
        clearInterval(simInterval.current);
        simInterval.current = null;
      }
    }

    return () => {
      active = false;
      if (trackingSubscription.current) {
        try {
          trackingSubscription.current.remove();
        } catch (err) {
          // Suppress AppContextLost Swift error during hot reload
        }
      }
      if (simInterval.current) {
        clearInterval(simInterval.current);
      }
    };
  }, [isTrackingActive, isPowerSavingMode]);

  return {
    location,
    permissionStatus,
    errorMsg,
    fetchCurrentLocation,
    batteryLevel,
    networkLatency,
    isPowerSavingMode,
    riskWarning,
  };
}

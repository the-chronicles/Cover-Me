import { useEffect, useRef } from 'react';
import { NativeModules } from 'react-native';
import { useAlert } from '@/context/AlertToastContext';
import * as Location from 'expo-location';
import { apiService } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

export function useVolumeTrigger() {
  const { token } = useAuth();
  const { showAlert } = useAlert();
  const pressTimestamps = useRef<number[]>([]);
  const isTriggering = useRef(false);
  const lastVolume = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;

    let subscription: any = null;

    async function setupVolumeListener() {
      if (!NativeModules.VolumeManager) {
        console.warn("VolumeManager native module is not available in this environment (e.g. Expo Go). Hardware volume trigger is disabled.");
        return;
      }
      try {
        const { VolumeManager } = require('react-native-volume-manager');

        // Set volume to a middle value initially so there is room to trigger in both directions
        await VolumeManager.setVolume(0.5);
        lastVolume.current = 0.5;

        subscription = VolumeManager.addVolumeListener(async (result: any) => {
          const now = Date.now();
          const currentVol = result.volume;

          // If volume didn't actually change or it's our own programmatic reset, ignore
          if (lastVolume.current !== null && Math.abs(currentVol - lastVolume.current) < 0.01) {
            return;
          }

          lastVolume.current = currentVol;

          // Reset volume to 0.5 if it gets close to limits (0.0 or 1.0) so further presses always trigger changes
          if (currentVol > 0.85 || currentVol < 0.15) {
            await VolumeManager.setVolume(0.5);
            lastVolume.current = 0.5;
          }

          // Record timestamp of this press
          pressTimestamps.current.push(now);

          // Keep only timestamps from the last 2.5 seconds
          pressTimestamps.current = pressTimestamps.current.filter(t => now - t <= 2500);

          // If we detect 3 presses in 2.5 seconds, trigger emergency
          if (pressTimestamps.current.length >= 3 && !isTriggering.current) {
            isTriggering.current = true;
            pressTimestamps.current = []; // Reset buffer immediately to prevent double triggers

            showAlert(
              "Volume Panic Triggered",
              "Emergency SOS hardware trigger sequence detected! Sending coordinates to safety watch circle...",
              [{ text: "OK" }]
            );

            // Fetch coordinates
            let lat: number | null = null;
            let lng: number | null = null;

            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === 'granted') {
                const current = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Highest,
                });
                lat = current.coords.latitude;
                lng = current.coords.longitude;
              }
            } catch (err) {
              console.warn("Could not retrieve location for volume trigger", err);
            }

            try {
              // Send SOS alert to API
              await apiService.triggerSOS(lat, lng, 'volume_button');
              showAlert(
                "SOS Sent Successfully",
                "Broadcasted alerts to emergency contacts via Termii SMS and WhatsApp Cloud APIs."
              );
            } catch (err) {
              showAlert(
                "SOS Trigger Error",
                "Failed to route emergency signal via server. Please use manual SMS fallback if offline."
              );
            } finally {
              // 5 second cooldown before trigger can activate again
              setTimeout(() => {
                isTriggering.current = false;
              }, 5000);
            }
          }
        });
      } catch (err) {
        console.warn("VolumeManager is not supported in this runtime or failed to initialize", err);
      }
    }

    setupVolumeListener();

    return () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch (err) {
          console.warn("Failed to remove volume listener", err);
        }
      }
    };
  }, [token]);
}

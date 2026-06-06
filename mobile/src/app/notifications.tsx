import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  FlatList,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { useAlert } from '@/context/AlertToastContext';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface AppNotification {
  id: number;
  user_id: number;
  type: string; // circle_join, sos_alert, journey_start, circle_invite
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { showToast } = useAlert();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [trackerModalVisible, setTrackerModalVisible] = useState(false);
  const [trackingJourney, setTrackingJourney] = useState<any | null>(null);
  const [trackingLoadingId, setTrackingLoadingId] = useState<number | null>(null);

  const fetchNotifications = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiService.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.warn('Could not fetch notifications.', err);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
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

  const handleTrackLive = async (message: string, notifId: number) => {
    setTrackingLoadingId(notifId);
    try {
      const data = await apiService.getActiveWatchedJourneys();
      // Find matching watched journey by checking if traveler_name is in the notification message
      const matched = data.find(j => message.includes(j.traveler_name));
      if (matched) {
        setTrackingJourney(matched);
        setTrackerModalVisible(true);
      } else {
        showToast("This safety journey session is no longer active.", "info");
      }
      // Mark read
      await handleMarkAsRead(notifId);
    } catch (err) {
      showToast("Could not retrieve tracking details.", "error");
    } finally {
      setTrackingLoadingId(null);
    }
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await apiService.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.warn('Could not mark notification as read.', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiService.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      showToast('All notifications marked as read.', 'success');
    } catch (err) {
      showToast('Failed to mark all as read.', 'error');
    }
  };

  const handleJoinFromInvite = async (inviteCode: string, notifId: number) => {
    setActionLoadingId(notifId);
    try {
      // Auto join the circle using role 'Observer' or prompt? We join as 'Member'
      await apiService.joinCircle({
        invite_code: inviteCode,
        role: 'Member'
      });
      // Mark notification as read
      await handleMarkAsRead(notifId);
      showToast(`Successfully joined circle with code ${inviteCode}!`, 'success');
      // Go to circle tab
      router.push('/contacts');
    } catch (err: any) {
      showToast(err.message || 'Could not join circle.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications(true);
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'sos_alert':
        return { name: 'alert-circle', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
      case 'circle_join':
        return { name: 'people', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
      case 'circle_invite':
        return { name: 'mail-open', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
      case 'journey_start':
        return { name: 'navigate', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' };
      default:
        return { name: 'notifications', color: theme.primary, bg: theme.backgroundSelected };
    }
  };

  const extractInviteCode = (message: string): string | null => {
    // Matches patterns like ABC-DEF or code: ABC-DEF
    const match = message.match(/[A-Z]{3}-[A-Z]{3}/i);
    return match ? match[0].toUpperCase() : null;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={theme.primary} />
            </Pressable>
            <ThemedText style={styles.title}>Notifications</ThemedText>
          </View>

          {notifications.some((n) => !n.read) && (
            <Pressable onPress={handleMarkAllAsRead} style={styles.readAllBtn}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>Mark all read</ThemedText>
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : notifications.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <Ionicons name="notifications-off" size={80} color={theme.textSecondary} style={{ opacity: 0.6 }} />
            <ThemedText style={styles.emptyTitle}>All caught up!</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptySubtitle}>
              You have no new notifications. Pull down to check for updates.
            </ThemedText>
          </ScrollView>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => String(item.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const iconInfo = getIconForType(item.type);
              const inviteCode = item.type === 'circle_invite' ? extractInviteCode(item.message) : null;
              
              return (
                <Pressable
                  onPress={() => !item.read && handleMarkAsRead(item.id)}
                  style={[
                    styles.notificationItem,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: item.read ? 'transparent' : 'rgba(37, 99, 235, 0.4)',
                      borderWidth: 1.5,
                      opacity: item.read ? 0.75 : 1
                    }
                  ]}
                >
                  <View style={styles.itemRow}>
                    <View style={[styles.iconContainer, { backgroundColor: iconInfo.bg }]}>
                      <Ionicons name={iconInfo.name as any} size={22} color={iconInfo.color} />
                    </View>

                    <View style={styles.detailsCol}>
                      <View style={styles.titleRow}>
                        <ThemedText style={[styles.itemTitle, { color: theme.text, fontWeight: item.read ? '600' : 'bold' }]}>
                          {item.title}
                        </ThemedText>
                        {!item.read && <View style={styles.unreadDot} />}
                      </View>

                      <ThemedText themeColor="textSecondary" style={styles.itemMessage}>
                        {item.message}
                      </ThemedText>

                      <ThemedText type="small" themeColor="textSecondary" style={styles.itemTime}>
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </ThemedText>

                      {inviteCode && !item.read && (
                        <View style={styles.inviteActions}>
                          <Pressable
                            onPress={() => handleJoinFromInvite(inviteCode, item.id)}
                            style={styles.joinBtn}
                            disabled={actionLoadingId !== null}
                          >
                            {actionLoadingId === item.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Accept & Join</ThemedText>
                              </>
                            )}
                          </Pressable>
                        </View>
                      )}

                      {item.type === 'journey_start' && (
                        <View style={styles.inviteActions}>
                          <Pressable
                            onPress={() => handleTrackLive(item.message, item.id)}
                            style={[styles.joinBtn, { backgroundColor: '#8B5CF6' }]}
                            disabled={trackingLoadingId !== null}
                          >
                            {trackingLoadingId === item.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Ionicons name="map-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Track Live</ThemedText>
                              </>
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: Spacing.three,
  },
  backBtn: {
    padding: 6,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  readAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.six,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: Spacing.two,
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  notificationItem: {
    padding: Spacing.three,
    borderRadius: 16,
  },
  itemRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsCol: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: 15,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  itemMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 11,
    marginTop: 2,
  },
  inviteActions: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  joinBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
});

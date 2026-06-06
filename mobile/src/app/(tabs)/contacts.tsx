import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Share,
  ScrollView,
  Platform,
  RefreshControl,
  Modal
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAlert } from '@/context/AlertToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';

type ViewState = 'list' | 'create' | 'join' | 'invite';

interface CircleMember {
  user_id: number;
  full_name: string;
  phone_number: string;
  role: string;
  joined_at: string;
}

interface Circle {
  id: number;
  name: string;
  category: string;
  invite_code: string;
  created_at: string;
  members: CircleMember[];
}

export default function ContactsScreen() {
  const theme = useTheme();
  const { showAlert, showToast } = useAlert();
  
  const [viewState, setViewState] = useState<ViewState>('list');
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Create Form State
  const [circleName, setCircleName] = useState('');
  const [category, setCategory] = useState('Family');
  const [customCategory, setCustomCategory] = useState('');
  const [role, setRole] = useState('Member');
  const [customRole, setCustomRole] = useState('');

  // Join Form State
  const [inviteCode, setInviteCode] = useState('');
  const [joinRole, setJoinRole] = useState('Member');
  const [customJoinRole, setCustomJoinRole] = useState('');

  // Generated code for invite screen
  const [activeInviteCode, setActiveInviteCode] = useState('');
  const [activeCircleName, setActiveCircleName] = useState('');

  // Active Circle selection (if multiple circles exist)
  const [selectedCircleIndex, setSelectedCircleIndex] = useState(0);

  // Swipe refresh & polling
  const [refreshing, setRefreshing] = useState(false);
  const [activeJourneys, setActiveJourneys] = useState<any[]>([]);

  // Direct invite modal states
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteEmailOrPhone, setInviteEmailOrPhone] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Live journey tracking modal states
  const [trackerModalVisible, setTrackerModalVisible] = useState(false);
  const [trackingJourney, setTrackingJourney] = useState<any | null>(null);

  const categories = ['Family', 'Friends', 'Work', 'School', 'Travel', 'Other'];
  
  const getRolesForCategory = (cat: string) => {
    switch (cat) {
      case 'Family':
        return ['Spouse', 'Father', 'Mother', 'Sibling', 'Child', 'Grandparent', 'Other'];
      case 'Work':
        return ['Colleague', 'Boss', 'Driver', 'Security Guard', 'Assistant', 'Other'];
      case 'Friends':
        return ['Best Friend', 'Friend', 'Neighbor', 'Teammate', 'Other'];
      case 'School':
        return ['Classmate', 'Study Partner', 'Teacher', 'Other'];
      case 'Travel':
        return ['Companion', 'Tour Guide', 'Host', 'Other'];
      default:
        return ['Member', 'Leader', 'Guard', 'Observer', 'Other'];
    }
  };

  const fetchActiveJourneys = async () => {
    try {
      const data = await apiService.getActiveWatchedJourneys();
      setActiveJourneys(data);
    } catch (err) {
      console.warn("Could not fetch active watched journeys", err);
    }
  };

  const fetchCircles = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiService.getMyCircles();
      setCircles(data);
      if (data.length > 0 && selectedCircleIndex >= data.length) {
        setSelectedCircleIndex(0);
      }
      await fetchActiveJourneys();
    } catch (err) {
      console.warn('Could not load circles from server.', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCircles();
    // Poll every 10 seconds to auto-update
    const interval = setInterval(() => {
      fetchCircles(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sync coords of traveler every 5 seconds if tracking modal is open
  useEffect(() => {
    if (!trackerModalVisible || !trackingJourney) return;
    
    const interval = setInterval(async () => {
      try {
        const data = await apiService.getActiveWatchedJourneys();
        const fresh = data.find(aj => aj.journey_id === trackingJourney.journey_id);
        if (fresh) {
          setTrackingJourney(fresh);
        } else {
          setTrackerModalVisible(false);
          setTrackingJourney(null);
          showToast('Traveler has completed or ended their journey.', 'info');
        }
      } catch (err) {
        console.warn('Tracker auto-sync failed', err);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [trackerModalVisible, trackingJourney]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCircles(true);
    setRefreshing(false);
  };

  const handleDirectInvite = async () => {
    if (!inviteEmailOrPhone.trim()) {
      showToast('Please enter an email or phone number.', 'error');
      return;
    }
    const activeCircle = circles[selectedCircleIndex];
    if (!activeCircle) return;

    setInviteLoading(true);
    try {
      await apiService.inviteToCircle(activeCircle.id, inviteEmailOrPhone.trim(), inviteRole);
      showToast(`Invitation sent directly to ${inviteEmailOrPhone.trim()}`, 'success');
      setInviteModalVisible(false);
      setInviteEmailOrPhone('');
    } catch (err: any) {
      showToast(err.message || 'Invitation failed.', 'error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateCircle = async () => {
    if (!circleName.trim()) {
      showToast('Please provide a circle name.', 'error');
      return;
    }

    const finalCategory = category === 'Other' ? customCategory.trim() : category;
    if (category === 'Other' && !customCategory.trim()) {
      showToast('Please specify your custom category.', 'error');
      return;
    }

    const finalRole = role === 'Other' ? customRole.trim() : role;
    if (role === 'Other' && !customRole.trim()) {
      showToast('Please specify your custom role.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const result = await apiService.createCircle({
        name: circleName.trim(),
        category: finalCategory,
        role: finalRole,
      });

      // Reset form
      setCircleName('');
      setCategory('Family');
      setCustomCategory('');
      setRole('Member');
      setCustomRole('');

      // Refresh list in background
      await fetchCircles(true);
      
      // Go to invite code screen
      setActiveInviteCode(result.invite_code);
      setActiveCircleName(result.name);
      setViewState('invite');
      showToast('Circle created successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not create circle.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinCircle = async () => {
    if (!inviteCode.trim()) {
      showToast('Please enter an invite code.', 'error');
      return;
    }

    const cleanCode = inviteCode.trim().toUpperCase();
    if (!/^[A-Z]{3}-[A-Z]{3}$/.test(cleanCode)) {
      showToast('Invite code format should be ABC-DEF.', 'error');
      return;
    }

    const finalRole = joinRole === 'Other' ? customJoinRole.trim() : joinRole;
    if (joinRole === 'Other' && !customJoinRole.trim()) {
      showToast('Please specify your custom role.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const result = await apiService.joinCircle({
        invite_code: cleanCode,
        role: finalRole,
      });

      // Reset form
      setInviteCode('');
      setJoinRole('Member');
      setCustomJoinRole('');

      // Refresh list
      await fetchCircles(true);
      
      // Jump to list view and select this new circle
      setViewState('list');
      showToast(`Joined circle "${result.name}" successfully!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not join circle.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveCircle = (circleId: number, name: string) => {
    showAlert(
      'Leave Circle',
      `Are you sure you want to leave circle "${name}"? You will need a new invite code to join back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await apiService.leaveCircle(circleId);
              showToast(`You left circle "${name}".`, 'success');
              setSelectedCircleIndex(0);
              await fetchCircles(false);
            } catch (err: any) {
              showToast(err.message || 'Failed to leave circle.', 'error');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleShareInvite = async (code: string, circleNameStr: string) => {
    try {
      const shareMessage = `Join my Circle "${circleNameStr}" in CoverMe! Invite code: ${code}. Tap the link to join. https://i.coverme.site/join/${code}`;
      await Share.share({
        message: shareMessage,
      });
    } catch (err) {
      showToast('Could not open share dialog.', 'error');
    }
  };

  // Render Functions
  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </ThemedView>
    );
  }

  const activeCircle = circles[selectedCircleIndex];

  // View: Create Circle Form
  if (viewState === 'create') {
    const roles = getRolesForCategory(category);
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollForm} showsVerticalScrollIndicator={false}>
            <View style={styles.formHeader}>
              <Pressable onPress={() => setViewState('list')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={theme.primary} />
              </Pressable>
              <ThemedText style={styles.title}>Create a Circle</ThemedText>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Circle Name</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                placeholder="e.g. Adesina Family, Ikeja Logistics"
                placeholderTextColor={theme.textSecondary}
                value={circleName}
                onChangeText={setCircleName}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Category</ThemedText>
              <View style={styles.badgeRow}>
                {categories.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => {
                        setCategory(cat);
                        // Reset role selections when changing category
                        const newRoles = getRolesForCategory(cat);
                        setRole(newRoles[0] || 'Member');
                      }}
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                          borderColor: theme.backgroundSelected
                        }
                      ]}
                    >
                      <ThemedText style={{ color: isSelected ? '#F8FAFC' : theme.text, fontSize: 13, fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {cat}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {category === 'Other' && (
                <TextInput
                  style={[styles.input, { marginTop: Spacing.two, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="Type custom category..."
                  placeholderTextColor={theme.textSecondary}
                  value={customCategory}
                  onChangeText={setCustomCategory}
                />
              )}
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Your Role in this Circle</ThemedText>
              <View style={styles.badgeRow}>
                {roles.map((r) => {
                  const isSelected = role === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setRole(r)}
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                          borderColor: theme.backgroundSelected
                        }
                      ]}
                    >
                      <ThemedText style={{ color: isSelected ? '#F8FAFC' : theme.text, fontSize: 13, fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {r}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {role === 'Other' && (
                <TextInput
                  style={[styles.input, { marginTop: Spacing.two, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="Type custom role..."
                  placeholderTextColor={theme.textSecondary}
                  value={customRole}
                  onChangeText={setCustomRole}
                />
              )}
            </View>

            <Pressable style={styles.submitBtn} onPress={handleCreateCircle} disabled={actionLoading}>
              {actionLoading ? (
                <ActivityIndicator color="#F8FAFC" />
              ) : (
                <ThemedText style={styles.submitBtnText}>Generate Invite Code & Create</ThemedText>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // View: Join Circle Form
  if (viewState === 'join') {
    const roles = getRolesForCategory('Other'); // Use general roles for joining
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollForm} showsVerticalScrollIndicator={false}>
            <View style={styles.formHeader}>
              <Pressable onPress={() => setViewState('list')} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={theme.primary} />
              </Pressable>
              <ThemedText style={styles.title}>Join a Circle</ThemedText>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Invite Code</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected, textTransform: 'uppercase' }]}
                placeholder="e.g. ZJE-ITS"
                placeholderTextColor={theme.textSecondary}
                value={inviteCode}
                onChangeText={(text) => {
                  // Format code automatically with dash
                  let formatted = text.replace(/[^A-Za-z]/g, '').toUpperCase();
                  if (formatted.length > 3) {
                    formatted = formatted.slice(0, 3) + '-' + formatted.slice(3, 6);
                  }
                  setInviteCode(formatted.slice(0, 7));
                }}
                maxLength={7}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Your Role in this Circle</ThemedText>
              <View style={styles.badgeRow}>
                {roles.map((r) => {
                  const isSelected = joinRole === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setJoinRole(r)}
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                          borderColor: theme.backgroundSelected
                        }
                      ]}
                    >
                      <ThemedText style={{ color: isSelected ? '#F8FAFC' : theme.text, fontSize: 13, fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {r}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {joinRole === 'Other' && (
                <TextInput
                  style={[styles.input, { marginTop: Spacing.two, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                  placeholder="Type custom role..."
                  placeholderTextColor={theme.textSecondary}
                  value={customJoinRole}
                  onChangeText={setCustomJoinRole}
                />
              )}
            </View>

            <Pressable style={styles.submitBtn} onPress={handleJoinCircle} disabled={actionLoading}>
              {actionLoading ? (
                <ActivityIndicator color="#F8FAFC" />
              ) : (
                <ThemedText style={styles.submitBtnText}>Join Circle</ThemedText>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // View: Invite Dialog Screen
  if (viewState === 'invite') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.inviteContainer}>
            <View style={styles.checkIcon}>
              <Ionicons name="checkmark-circle" size={80} color="#10B981" />
            </View>
            <ThemedText style={styles.inviteHeader}>Circle Created!</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.inviteSub}>
              Share the invite code below with people you want to add to your circle.
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.codeCard}>
              <ThemedText style={styles.codeText}>{activeInviteCode}</ThemedText>
            </ThemedView>

            <Pressable
              style={styles.shareBtn}
              onPress={() => handleShareInvite(activeInviteCode, activeCircleName)}
            >
              <Ionicons name="share-social" size={20} color="#F8FAFC" style={{ marginRight: 8 }} />
              <ThemedText style={styles.shareBtnText}>Invite Members</ThemedText>
            </Pressable>

            <Pressable style={styles.doneBtn} onPress={() => setViewState('list')}>
              <ThemedText style={[styles.doneBtnText, { color: theme.primary }]}>Go to My Circle</ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // View: Empty State (No circles joined/created yet)
  if (circles.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIllustration}>
              <Ionicons name="people-outline" size={90} color={theme.textSecondary} />
            </View>
            <ThemedText style={styles.emptyTitle}>Group Circles</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptyDescription}>
              Join or create a safety circle to coordinate location checks, follow journeys, and trigger alerts for loved ones or team members.
            </ThemedText>

            <View style={styles.emptyActions}>
              <Pressable style={styles.createOptionBtn} onPress={() => setViewState('create')}>
                <Ionicons name="add-circle" size={24} color="#F8FAFC" style={{ marginRight: 8 }} />
                <ThemedText style={styles.createOptionText}>Create a Circle</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.joinOptionBtn, { borderColor: theme.primary, borderWidth: 1.5 }]}
                onPress={() => setViewState('join')}
              >
                <Ionicons name="enter-outline" size={24} color={theme.primary} style={{ marginRight: 8 }} />
                <ThemedText style={[styles.joinOptionText, { color: theme.primary }]}>Join a Circle</ThemedText>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // View: Active Circle List State
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Circle Selector Header */}
        <View style={styles.circleHeader}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleTabs}>
            {circles.map((c, idx) => {
              const isSelected = selectedCircleIndex === idx;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCircleIndex(idx)}
                  style={[
                    styles.circleTabBtn,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
                      borderColor: theme.backgroundSelected
                    }
                  ]}
                >
                  <ThemedText style={{ color: isSelected ? '#F8FAFC' : theme.text, fontWeight: isSelected ? 'bold' : 'normal', fontSize: 13 }}>
                    {c.name}
                  </ThemedText>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setViewState('create')}
              style={[
                styles.circleTabBtn,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                }
              ]}
            >
              <Ionicons name="add" size={18} color={theme.text} />
            </Pressable>
          </ScrollView>
        </View>

        {/* Active Circle Info Card */}
        <ThemedView type="backgroundElement" style={styles.activeCircleCard}>
          <View style={styles.circleInfoRow}>
            <View>
              <ThemedText style={[styles.circleCardTitle, { color: theme.text }]}>
                {activeCircle?.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
                Share this code to add guards to your circle
              </ThemedText>
            </View>
            <Pressable
              style={styles.circleShareIconBtn}
              onPress={() => handleShareInvite(activeCircle?.invite_code, activeCircle?.name)}
            >
              <Ionicons name="share-social" size={20} color={theme.primary} />
            </Pressable>
          </View>

          <View style={[styles.inviteCodeDisplayRow, { backgroundColor: theme.background }]}>
            <ThemedText style={styles.displayCodeLabel}>Invite Code:</ThemedText>
            <ThemedText style={[styles.displayCodeText, { color: theme.primary }]}>{activeCircle?.invite_code}</ThemedText>
          </View>
        </ThemedView>

        {/* Members List */}
        <View style={styles.membersSection}>
          <View style={styles.membersSectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
              Circle Members ({activeCircle?.members?.length || 0})
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                onPress={() => {
                  setViewState('join');
                }}
                style={styles.addMemberHeaderBtn}
              >
                <Ionicons name="enter-outline" size={15} color={theme.primary} style={{ marginRight: 3 }} />
                <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 12 }}>Join Code</ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setInviteRole(getRolesForCategory(activeCircle?.category || 'Family')[0] || 'Member');
                  setInviteModalVisible(true);
                }}
                style={styles.addMemberHeaderBtn}
              >
                <Ionicons name="person-add-outline" size={15} color={theme.primary} style={{ marginRight: 3 }} />
                <ThemedText type="smallBold" style={{ color: theme.primary, fontSize: 12 }}>Invite User</ThemedText>
              </Pressable>
            </View>
          </View>

          <FlatList
            data={activeCircle?.members || []}
            keyExtractor={(item) => String(item.user_id)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const activeJ = activeJourneys.find(aj => aj.traveler_id === item.user_id);
              
              return (
                <ThemedView type="backgroundElement" style={styles.memberItem}>
                  <View style={styles.memberAvatarCol}>
                    <View style={[styles.avatarBadge, { backgroundColor: theme.backgroundSelected }]}>
                      <ThemedText style={[styles.avatarText, { color: theme.text }]}>
                        {item.full_name.slice(0, 2).toUpperCase()}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.memberDetailsCol}>
                    <ThemedText style={[styles.memberName, { color: theme.text }]}>{item.full_name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.memberPhone}>
                      {item.phone_number}
                    </ThemedText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      <View style={[styles.roleBadge, { backgroundColor: theme.backgroundSelected, marginTop: 0 }]}>
                        <ThemedText themeColor="textSecondary" style={styles.roleText}>{item.role}</ThemedText>
                      </View>
                      
                      {activeJ && (
                        <View style={[styles.roleBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)', marginTop: 0 }]}>
                          <ThemedText style={{ fontSize: 10, fontWeight: 'bold', color: '#10B981' }}>On Journey</ThemedText>
                        </View>
                      )}
                    </View>
                  </View>

                  {activeJ && (
                    <View style={{ justifyContent: 'center' }}>
                      <Pressable
                        onPress={() => {
                          setTrackingJourney(activeJ);
                          setTrackerModalVisible(true);
                        }}
                        style={{ backgroundColor: theme.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Ionicons name="map" size={14} color="#FFFFFF" />
                        <ThemedText type="smallBold" style={{ color: '#FFFFFF', fontSize: 11 }}>Track</ThemedText>
                      </Pressable>
                    </View>
                  )}
                </ThemedView>
              );
            }}
          />
        </View>

        {/* Leave Circle Action Bar */}
        <View style={styles.circleFooterActions}>
          <Pressable
            onPress={() => handleLeaveCircle(activeCircle?.id, activeCircle?.name)}
            style={[styles.footerBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#EF4444', borderWidth: 1, flex: 1 }]}
          >
            <Ionicons name="exit-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
            <ThemedText style={{ color: '#EF4444', fontSize: 13, fontWeight: 'bold' }}>Leave Circle</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Direct Invite Modal */}
      <Modal visible={inviteModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: Spacing.two }}>
              <ThemedText style={{ fontSize: 16, fontWeight: 'bold' }}>Direct Circle Invite</ThemedText>
              <Pressable onPress={() => { setInviteModalVisible(false); setInviteEmailOrPhone(''); }} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.three, textAlign: 'center' }}>
              Send an in-app invitation directly to another CoverMe user using their email or phone number.
            </ThemedText>

            <View style={{ width: '100%', gap: Spacing.two, marginBottom: Spacing.three }}>
              <ThemedText style={styles.label}>Recipient Phone or Email</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
                placeholder="e.g. user@example.com or +23480..."
                placeholderTextColor={theme.textSecondary}
                value={inviteEmailOrPhone}
                onChangeText={setInviteEmailOrPhone}
                autoCapitalize="none"
              />
            </View>

            <View style={{ width: '100%', gap: Spacing.two, marginBottom: Spacing.four }}>
              <ThemedText style={styles.label}>Recipient Role</ThemedText>
              <View style={styles.badgeRow}>
                {getRolesForCategory(activeCircle?.category || 'Family').map((r) => {
                  const isSelected = inviteRole === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setInviteRole(r)}
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.backgroundElement,
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
              style={[styles.submitBtn, { width: '100%', marginTop: 0 }]}
              onPress={handleDirectInvite}
              disabled={inviteLoading}
            >
              {inviteLoading ? (
                <ActivityIndicator color="#F8FAFC" />
              ) : (
                <ThemedText style={styles.submitBtnText}>Send Invitation</ThemedText>
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
    gap: Spacing.three,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollForm: {
    paddingVertical: Spacing.three,
    gap: Spacing.four,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
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
  formGroup: {
    gap: Spacing.one,
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  badge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  submitBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 14,
  },
  inviteContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  checkIcon: {
    marginBottom: Spacing.two,
  },
  inviteHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  inviteSub: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
    lineHeight: 20,
    marginBottom: Spacing.two,
  },
  codeCard: {
    paddingVertical: 16,
    paddingHorizontal: Spacing.six,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
    marginBottom: Spacing.three,
  },
  codeText: {
    fontSize: 32,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  shareBtn: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    width: '100%',
  },
  shareBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
  doneBtn: {
    paddingVertical: Spacing.two,
    marginTop: Spacing.one,
  },
  doneBtnText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  emptyIllustration: {
    marginBottom: Spacing.two,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.three,
  },
  emptyActions: {
    width: '100%',
    gap: Spacing.two,
  },
  createOptionBtn: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createOptionText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 14,
  },
  joinOptionBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinOptionText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  circleHeader: {
    marginTop: Spacing.three,
  },
  circleTabs: {
    paddingVertical: Spacing.one,
    gap: Spacing.two,
  },
  circleTabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  singleCircleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  categoryBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  activeCircleCard: {
    padding: Spacing.three,
    borderRadius: 16,
    gap: Spacing.two,
  },
  circleInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circleCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  circleShareIconBtn: {
    padding: Spacing.one,
  },
  inviteCodeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    marginTop: Spacing.one,
  },
  displayCodeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  displayCodeText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  membersSection: {
    flex: 1,
  },
  membersSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  addMemberHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  memberItem: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    gap: Spacing.three,
  },
  memberAvatarCol: {
    justifyContent: 'center',
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  memberDetailsCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  memberName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  memberPhone: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  roleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
  },
  circleFooterActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.two,
  },
  footerBtn: {
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
});

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, Pressable, ScrollView, Alert, Linking, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService, CommandLine } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

// Realistic offline fallback catalog for Lagos and Oyo states (Southwest Nigeria)
const OFFLINE_CATALOG: CommandLine[] = [
  { id: 101, state: 'Lagos', lga: 'Ikeja', facility_name: 'Ikeja Divisional Police HQ', facility_type: 'police', phone_number: '+2348033011234' },
  { id: 102, state: 'Lagos', lga: 'Lagos Island', facility_name: 'Lion Building Divisional Police Station', facility_type: 'police', phone_number: '+2348034567890' },
  { id: 103, state: 'Lagos', lga: 'Ikeja', facility_name: 'Lagos State Emergency Service (LASEMA)', facility_type: 'hospital', phone_number: '+2348067891234' },
  { id: 104, state: 'Lagos', lga: 'Surulere', facility_name: 'Surulere Fire Station Division', facility_type: 'fire', phone_number: '+2348123456789' },
  { id: 105, state: 'Oyo', lga: 'Ibadan North', facility_name: 'Sango Police Station Division', facility_type: 'police', phone_number: '+2348031122334' },
  { id: 106, state: 'Oyo', lga: 'Ibadan North', facility_name: 'UCH Ibadan Emergency Ward', facility_type: 'hospital', phone_number: '+2348055556666' },
  { id: 107, state: 'Oyo', lga: 'Ogbomoso North', facility_name: 'Ogbomoso Owode Divisional Police HQ', facility_type: 'police', phone_number: '+2348032223344' },
  { id: 108, state: 'Oyo', lga: 'Ogbomoso South', facility_name: 'LAUTECH Teaching Hospital Emergency', facility_type: 'hospital', phone_number: '+2348077778888' },
];

export default function CommandLinesScreen() {
  const theme = useTheme();
  const [stateFilter, setStateFilter] = useState<'All' | 'Lagos' | 'Oyo' | 'Ogun' | 'Ondo' | 'Osun'>('All');
  const [lgaSearch, setLgaSearch] = useState('');
  const [facilities, setFacilities] = useState<CommandLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);

  const fetchFacilities = async () => {
    setLoading(true);
    setOfflineMode(false);
    try {
      const selectedState = stateFilter === 'All' ? undefined : stateFilter;
      const data = await apiService.getCommandLines(selectedState, lgaSearch || undefined);
      setFacilities(data);
    } catch (err) {
      // Offline fallback
      setOfflineMode(true);
      let localFiltered = OFFLINE_CATALOG;
      if (stateFilter !== 'All') {
        localFiltered = localFiltered.filter(f => f.state.toLowerCase() === stateFilter.toLowerCase());
      }
      if (lgaSearch) {
        localFiltered = localFiltered.filter(f => f.lga.toLowerCase().includes(lgaSearch.toLowerCase()));
      }
      setFacilities(localFiltered);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFacilities();
  }, [stateFilter, lgaSearch]);

  const handleCall = (phoneNumber: string, name: string) => {
    Alert.alert(
      'Place Direct Call',
      `Dial emergency hotline for ${name} (${phoneNumber})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dial Number', onPress: () => Linking.openURL(`tel:${phoneNumber}`) }
      ]
    );
  };

  const getIconForType = (type: string) => {
    switch (type.toLowerCase()) {
      case 'police': return '👮';
      case 'hospital': return '🏥';
      case 'fire': return '🚒';
      default: return '📞';
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Direct Command Lines</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>Direct divisional contacts for rapid emergency response</ThemedText>
        </View>

        {/* Filters */}
        <View style={styles.filterSection}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.filterTitle}>Filter by Southwest State</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateScroll}>
            {(['All', 'Lagos', 'Oyo', 'Ogun', 'Ondo', 'Osun'] as const).map((state) => (
              <Pressable
                key={state}
                style={[
                  styles.stateBtn,
                  stateFilter === state ? styles.stateBtnActive : { backgroundColor: theme.backgroundElement }
                ]}
                onPress={() => setStateFilter(state)}
              >
                <ThemedText style={[
                  styles.stateBtnText,
                  stateFilter === state ? styles.stateBtnTextActive : { color: theme.textSecondary }
                ]}>
                  {state}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
            placeholder="Search by LGA or City (e.g. Ogbomoso, Ikeja)"
            placeholderTextColor={theme.textSecondary}
            value={lgaSearch}
            onChangeText={setLgaSearch}
          />
        </View>

        {/* Offline indicator */}
        {offlineMode && (
          <View style={styles.offlineBanner}>
            <ThemedText style={styles.offlineBannerText}>⚠️ Offline Catalog Loaded</ThemedText>
          </View>
        )}

        {/* Facilities list */}
        <View style={styles.listSection}>
          {loading ? (
            <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: Spacing.four }} />
          ) : facilities.length === 0 ? (
            <ThemedText style={styles.emptyText}>No emergency resources found matching query.</ThemedText>
          ) : (
            <FlatList
              data={facilities}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <View style={styles.cardHeader}>
                    <ThemedText style={styles.facilityIcon}>{getIconForType(item.facility_type)}</ThemedText>
                    <View style={styles.facilityTitleCol}>
                      <ThemedText style={[styles.facilityName, { color: theme.text }]}>{item.facility_name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.facilityMeta}>
                        State: {item.state} | LGA: {item.lga}
                      </ThemedText>
                    </View>
                  </View>
                  <Pressable style={[styles.callBtn, { backgroundColor: theme.backgroundSelected }]} onPress={() => handleCall(item.phone_number, item.facility_name)}>
                    <ThemedText style={[styles.callBtnText, { color: theme.text }]}>📞 Call Division: {item.phone_number}</ThemedText>
                  </Pressable>
                </ThemedView>
              )}
            />
          )}
        </View>
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
    gap: Spacing.three,
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
  filterSection: {
    gap: Spacing.two,
  },
  filterTitle: {
    fontWeight: '600',
  },
  stateScroll: {
    gap: Spacing.two,
    paddingBottom: 4,
  },
  stateBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 16,
  },
  stateBtnActive: {
    backgroundColor: '#2563EB',
  },
  stateBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stateBtnTextActive: {
    color: '#F8FAFC',
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    marginTop: Spacing.one,
  },
  offlineBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#D97706',
    fontWeight: 'bold',
    fontSize: 12,
  },
  listSection: {
    flex: 1,
  },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  facilityIcon: {
    fontSize: 24,
  },
  facilityTitleCol: {
    flex: 1,
  },
  facilityName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  facilityMeta: {
    marginTop: 2,
  },
  callBtn: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: 4,
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});

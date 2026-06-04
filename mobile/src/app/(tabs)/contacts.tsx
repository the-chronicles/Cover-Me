import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, Pressable, Alert, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { apiService } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface Contact {
  id: string;
  name: string;
  phone_number: string;
  relation: string;
}

export default function ContactsScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const data = await apiService.getContacts();
      // Ensure the IDs are converted to string for FlatList
      const mapped = data.map((c: any) => ({
        id: String(c.id),
        name: c.name,
        phone_number: c.phone_number,
        relation: c.relation || 'Friend',
      }));
      setContacts(mapped);
    } catch (err) {
      console.warn('Could not load contacts from server. Using local cache fallback.', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleAddContact = async () => {
    if (!name || !phone) {
      Alert.alert('Incomplete Form', 'Please provide a name and phone number.');
      return;
    }

    const cleanPhone = phone.trim();
    if (!/^\+?234\d{10}$|^0[789][01]\d{8}$/.test(cleanPhone)) {
      Alert.alert('Invalid Phone Number', 'Please input a valid Nigerian phone number.');
      return;
    }

    setSubmitLoading(true);
    try {
      const saved = await apiService.addContact({
        name: name.trim(),
        phone_number: cleanPhone,
        relation: relation.trim() || undefined,
      });

      const newContact: Contact = {
        id: String(saved.id),
        name: saved.name,
        phone_number: saved.phone_number,
        relation: saved.relation || 'Friend',
      };

      setContacts([...contacts, newContact]);
      setName('');
      setPhone('');
      setRelation('');
      Alert.alert('Contact Added', `${name} has been added to your Trusted Circle safety list.`);
    } catch (err) {
      Alert.alert('Error Saving', 'Could not sync contact with backend. Check connection details and try again.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRemoveContact = (id: string, name: string) => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${name} from your safety circle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            // Delete locally
            setContacts(contacts.filter((c) => c.id !== id));
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Trusted Circle</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>These contacts are alerted instantly during an SOS trigger</ThemedText>
        </View>

        {/* Add Contact Card Form */}
        <ThemedView type="backgroundElement" style={styles.formCard}>
          <ThemedText style={[styles.formTitle, { color: theme.text }]}>Add New Guard</ThemedText>
          
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={[styles.input, { flex: 1, backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
              placeholder="Relation (e.g. Sibling)"
              placeholderTextColor={theme.textSecondary}
              value={relation}
              onChangeText={setRelation}
            />
          </View>

          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.backgroundSelected }]}
            placeholder="Phone Number (e.g. +2348033011234)"
            placeholderTextColor={theme.textSecondary}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <Pressable style={styles.saveButton} onPress={handleAddContact} disabled={submitLoading}>
            {submitLoading ? (
              <ActivityIndicator color="#F8FAFC" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Add to Trusted Circle</ThemedText>
            )}
          </Pressable>
        </ThemedView>

        {/* Contacts Catalog List */}
        <View style={styles.listSection}>
          <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>Active Guards ({contacts.length})</ThemedText>
          
          {loading ? (
            <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: Spacing.four }} />
          ) : contacts.length === 0 ? (
            <ThemedText style={styles.emptyText}>No emergency contacts added yet.</ThemedText>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <ThemedView type="backgroundElement" style={styles.contactItem}>
                  <View>
                    <ThemedText style={[styles.contactName, { color: theme.text }]}>{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.contactPhone}>{item.phone_number}</ThemedText>
                    <View style={[styles.relationBadge, { backgroundColor: theme.backgroundSelected }]}>
                      <ThemedText themeColor="textSecondary" style={styles.relationText}>{item.relation}</ThemedText>
                    </View>
                  </View>
                  <Pressable onPress={() => handleRemoveContact(item.id, item.name)} style={styles.removeBtn}>
                    <ThemedText style={styles.removeBtnText}>Remove</ThemedText>
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
  formCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: '#2563EB',
    height: 40,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  saveButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 13,
  },
  listSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: Spacing.two,
  },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  contactName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  contactPhone: {
    fontFamily: 'monospace',
    marginTop: 2,
  },
  relationBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  relationText: {
    fontSize: 10,
    fontWeight: '600',
  },
  removeBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  removeBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
});

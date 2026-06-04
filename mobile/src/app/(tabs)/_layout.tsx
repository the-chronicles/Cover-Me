import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      // labeled="labeled"
      labelStyle={{
        selected: { color: colors.primary },
        default: { color: colors.textSecondary },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="house.fill"
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="journey">
        <NativeTabs.Trigger.Label>Follow Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="location.fill"
          md="near_me"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="contacts">
        <NativeTabs.Trigger.Label>Circle</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="person.2.fill"
          md="people"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="command-lines">
        <NativeTabs.Trigger.Label>Emergency</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="phone.fill"
          md="phone"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

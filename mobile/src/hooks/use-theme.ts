import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from './useAuth';

export function useTheme() {
  const systemScheme = useColorScheme();
  let themePref = 'system';

  try {
    const auth = useAuth();
    if (auth && auth.themePreference) {
      themePref = auth.themePreference;
    }
  } catch (e) {
    // AuthProvider might not be initialized yet in outer context
  }

  const theme = themePref === 'system'
    ? (systemScheme === 'unspecified' ? 'light' : systemScheme)
    : themePref;

  return Colors[theme as 'light' | 'dark'];
}

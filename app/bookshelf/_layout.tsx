import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { getFontFamily } from '@/constants/theme';

export default function BookshelfLayout() {
  const { colors } = useTheme();

  // Match the tab screens' header styling so pushing into a bookshelf
  // doesn't flash a default (unthemed) navigation bar.
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: getFontFamily('semibold'),
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    />
  );
}

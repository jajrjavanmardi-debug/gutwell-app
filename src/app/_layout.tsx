import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';
import { AuthProvider } from '../../contexts/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Head>
        <title>NutriFlow</title>
        <meta
          name="description"
          content="NutriFlow offers educational meal estimates, food history, and pattern-aware gut wellness tracking."
        />
      </Head>
      <View style={styles.rootBackground}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/page" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="photo-analysis" options={{ headerShown: false }} />
          <Stack.Screen name="food-history" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="relief" options={{ headerShown: false }} />
        </Stack>
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  rootBackground: {
    flex: 1,
    backgroundColor: '#F4F5F0',
  },
});

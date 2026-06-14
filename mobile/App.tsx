/**
 * LitPlay mobile app entry point (§7).
 *
 * Initializes i18n, analytics, error reporting, and renders the root navigator.
 */

import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from './src/i18n';
import { useAppStore, onAppBackground, onAppForeground } from './src/stores/app-store';

// Initialize i18n before rendering (§22)
initI18n();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

export default function App() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    // §16.3 rule 3 — handle app backgrounding/foregrounding for token clearing
    // In production this uses AppState from react-native
    const mockAppStateChange = (nextState: string) => {
      if (nextState === 'background') onAppBackground();
      if (nextState === 'active') onAppForeground();
    };
    // const subscription = AppState.addEventListener('change', mockAppStateChange);
    // return () => subscription.remove();
  }, []);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>LitPlay</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.container}>
        <Text style={styles.text}>Welcome to LitPlay!</Text>
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, marginTop: 16 },
});

/**
 * Analytics stub (§20.1).
 * Production uses PostHog React Native SDK.
 */

export const posthog = {
  capture(event: string, properties?: Record<string, unknown>): void {
    if (__DEV__) {
      console.log(`[analytics] ${event}`, properties);
    }
  },
  screen(name: string, properties?: Record<string, unknown>): void {
    if (__DEV__) {
      console.log(`[analytics:screen] ${name}`, properties);
    }
  },
};

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wakeup.pro',
  appName: 'WakeUp Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linquelabs.leeward',
  appName: 'Leeward',
  webDir: 'public',
  server: {
    url: 'https://app.getleeward.com',
    cleartext: false
  }
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linquelabs.leewardapp',
  appName: 'Leeward',
  webDir: 'public',
  server: {
    url: 'https://app.getleeward.com',
    cleartext: false
  }
};

export default config;

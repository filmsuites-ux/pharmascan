export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
  };
  android?: {
    allowMixedContent?: boolean;
    captureInput?: boolean;
    webContentsDebuggingEnabled?: boolean;
  };
  plugins?: {
    [key: string]: any;
  };
}

const config: CapacitorConfig = {
  appId: 'com.pharmascan.app',
  appName: 'PharmaScan',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    App: {},
    Share: {},
    Filesystem: {},
    Camera: {},
  },
};

export default config;

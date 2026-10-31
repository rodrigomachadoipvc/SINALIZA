// Metro serves .svg files as assets (see metro.config.js): importing one gives an asset reference.
declare module '*.svg' {
  const asset: number;
  export default asset;
}

/** Stylesheets imported for their side effect (Leaflet on the web build). */
declare module '*.css';

// Expo types every env variable as `any`; name the ones the app reads (see .env.example).
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
  }
}

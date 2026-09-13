declare const __APP_BUILD_ID__: string;
export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'development';

declare const __APP_VERSION__: string;
export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development';

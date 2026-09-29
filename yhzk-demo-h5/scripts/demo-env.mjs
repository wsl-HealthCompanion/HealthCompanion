export function createDemoViteEnv(sourceEnv) {
  const env = Object.fromEntries(
    Object.entries(sourceEnv).filter(([key, value]) => !/^VITE_/i.test(key) && value !== undefined),
  );

  return {
    ...env,
    VITE_API_BASE: '/api/v1',
    VITE_AVATAR_PROVIDER: 'livetalking',
    VITE_XMOV_SHOW_DEV_CONTROLS: 'false',
  };
}

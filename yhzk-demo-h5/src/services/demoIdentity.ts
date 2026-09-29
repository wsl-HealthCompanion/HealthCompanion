export interface DemoIdentityStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const STORAGE_KEY = 'yhzk_demo_identity_v1';
const DEMO_TOKEN_PATTERN = /^demo_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memoryToken: string | null = null;

function createToken(createId: () => string): string {
  return `demo_${createId()}`;
}

function getMemoryToken(createId: () => string): string {
  if (!memoryToken) memoryToken = createToken(createId);
  return memoryToken;
}

export function getDemoToken(
  storage: DemoIdentityStorage | null | undefined,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  if (!storage) return getMemoryToken(createId);

  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved && DEMO_TOKEN_PATTERN.test(saved)) return saved;

    const token = createToken(createId);
    storage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    return getMemoryToken(createId);
  }
}

export function getRequestToken(
  mode: string,
  storage: DemoIdentityStorage | null | undefined,
  authToken: string | null,
): string | null {
  if (mode === 'demo') return getDemoToken(storage);
  return authToken?.trim() || null;
}

export function getStorageUserId(mode: string, demoId: string, authenticatedUserId: string): string {
  return mode === 'demo' ? demoId : authenticatedUserId;
}

export function resolveEntryScreen(
  mode: string,
  loggedIn: boolean,
  onboardingDone: boolean,
): 'login' | 'onboarding' | 'app' {
  if (mode === 'demo') return 'app';
  if (!loggedIn) return 'login';
  if (!onboardingDone) return 'onboarding';
  return 'app';
}

export function canConnectDigitalHuman(mode: string, loggedIn: boolean, onboardingDone: boolean): boolean {
  return mode !== 'demo' && loggedIn && onboardingDone;
}

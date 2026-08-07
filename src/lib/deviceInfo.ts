/**
 * Identificação anônima do dispositivo (apenas monitoramento de versão).
 * Nenhum dado pessoal é usado: o ID é um UUID aleatório salvo localmente.
 */

const DEVICE_ID_KEY = 'app-device-id';

const randomId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

export const getDeviceId = (): string => {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = randomId();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // Storage indisponível: usa ID efêmero para não quebrar o heartbeat.
    return randomId();
  }
};

export const isStandalonePWA = (): boolean => {
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    return (window.navigator as any).standalone === true;
  } catch {
    return false;
  }
};

/** ios | android | desktop, com sufixo "-pwa" quando instalado. */
export const getPlatform = (): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let base = 'desktop';
  if (/iPhone|iPad|iPod/i.test(ua)) base = 'ios';
  else if (/Android/i.test(ua)) base = 'android';
  return isStandalonePWA() ? `${base}-pwa` : base;
};

export const getUserAgent = (): string =>
  typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : '';

/** Rótulo curto do dispositivo para exibição na tela administrativa. */
export const shortDeviceId = (deviceId: string): string =>
  deviceId ? deviceId.slice(0, 8) : '—';

export const platformLabel = (platform?: string | null): string => {
  if (!platform) return 'Desconhecida';
  const pwa = platform.endsWith('-pwa');
  const base = platform.replace('-pwa', '');
  const labels: Record<string, string> = {
    ios: 'iPhone/iPad',
    android: 'Android',
    desktop: 'Computador',
  };
  return `${labels[base] || base}${pwa ? ' (App instalado)' : ''}`;
};

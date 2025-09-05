/**
 * Version configuration for the application
 * Handles version display and management
 */

// Version info injected at build time
export interface VersionInfo {
  version: string;
  buildTime: string;
  buildHash?: string;
}

// Get version info from build-time injected globals
export const getVersionInfo = (): VersionInfo => {
  // Sistema automático baseado em timestamp
  const now = new Date();
  const buildTime = now.toISOString();
  
  // Versão automática baseada na data (YYYY.MM.DD.HHMM)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  const autoVersion = `${year}.${month}.${day}.${hour}${minute}`;
  const buildHash = `auto-${now.getTime().toString(36)}`;
  
  return {
    version: autoVersion,
    buildTime,
    buildHash,
  };
};

// Format version for display
export const formatVersion = (versionInfo: VersionInfo): string => {
  const { version, buildTime } = versionInfo;
  const buildDateTime = new Date(buildTime).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `v${version} (${buildDateTime})`;
};

// Format detailed version for debug
export const formatDetailedVersion = (versionInfo: VersionInfo): string => {
  const { version, buildTime, buildHash } = versionInfo;
  const buildDateTime = new Date(buildTime).toLocaleString('pt-BR');
  const hashDisplay = buildHash ? ` - ${buildHash.substring(0, 8)}` : '';
  return `Versão ${version} - Build: ${buildDateTime}${hashDisplay}`;
};

// Check if version has changed (for cache invalidation)
export const hasVersionChanged = (): boolean => {
  try {
    const currentVersion = getVersionInfo();
    const storedVersion = localStorage.getItem('app-version');
    
    if (!storedVersion) {
      localStorage.setItem('app-version', currentVersion.version);
      return false;
    }
    
    const hasChanged = storedVersion !== currentVersion.version;
    if (hasChanged) {
      console.log(`🔄 Version changed from ${storedVersion} to ${currentVersion.version}`);
      localStorage.setItem('app-version', currentVersion.version);
    }
    
    return hasChanged;
  } catch (error) {
    console.warn('Error checking version change:', error);
    return false;
  }
};

// Store current version after login
export const storeCurrentVersion = (): void => {
  const currentVersion = getVersionInfo();
  localStorage.setItem('app-version', currentVersion.version);
  localStorage.setItem('app-last-login', new Date().toISOString());
};
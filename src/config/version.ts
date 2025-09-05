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
  try {
    // Try to get from build-time injected globals first
    if (typeof __APP_VERSION__ !== 'undefined') {
      return {
        version: __APP_VERSION__,
        buildTime: __BUILD_TIME__,
        buildHash: __BUILD_HASH__,
      };
    }
    
    // Fallback to environment variables (development mode)
    return {
      version: import.meta.env.VITE_APP_VERSION || '1.0.1',
      buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString(),
      buildHash: import.meta.env.VITE_BUILD_HASH || `dev-${Date.now().toString(36)}`,
    };
  } catch {
    // Final fallback for development mode
    return {
      version: '1.0.1',
      buildTime: new Date().toISOString(),
      buildHash: `dev-${Date.now().toString(36)}`,
    };
  }
};

// Format version for display
export const formatVersion = (versionInfo: VersionInfo): string => {
  const { version, buildTime } = versionInfo;
  const buildDate = new Date(buildTime).toLocaleDateString('pt-BR');
  return `v${version} (${buildDate})`;
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
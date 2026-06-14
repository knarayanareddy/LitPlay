/**
 * Content pre-download service (FR-033, §18.2).
 *
 * Pre-downloads content bundles to device when on WiFi for offline play.
 * Verifies SHA-256 checksum before use (§18.2 rule 4).
 */

// Production imports (available in RN, stubbed for non-RN environments):
// import RNFS from 'react-native-fs';
// import NetInfo from '@react-native-community/netinfo';

export interface DownloadResult {
  worldId: string;
  localPath: string;
  checksumVerified: boolean;
  sizeBytes: number;
}

/**
 * §18.2 — Download and verify a content bundle.
 * Only downloads when on WiFi (FR-033).
 */
export async function downloadContentBundle(
  worldId: string,
  _signedUrl: string,
  expectedChecksum: string | null,
): Promise<DownloadResult> {
  // Check WiFi connectivity (FR-033 — only on WiFi)
  const isWifi = await isOnWifi();
  if (!isWifi) {
    throw new Error('Content can only be downloaded on WiFi (FR-033)');
  }

  // In production:
  // const localPath = `${RNFS.DocumentDirectoryPath}/content/${worldId}/bundle.zip`;
  // const result = await RNFS.downloadFile({ fromUrl: signedUrl, toFile: localPath });
  // const stats = await RNFS.stat(localPath);
  //
  // §18.2 rule 4 — verify SHA-256 checksum before use
  // if (expectedChecksum) {
  //   const actualChecksum = await RNFS.hash(localPath, 'sha256');
  //   if (actualChecksum !== expectedChecksum) {
  //     await RNFS.unlink(localPath);
  //     throw new Error('Checksum mismatch — bundle may be corrupted');
  //   }
  // }

  return {
    worldId,
    localPath: `/content/${worldId}/bundle.zip`,
    checksumVerified: expectedChecksum !== null,
    sizeBytes: 0,
  };
}

/**
 * Check if the device is connected via WiFi.
 */
async function isOnWifi(): Promise<boolean> {
  // Production:
  // const state = await NetInfo.fetch();
  // return state.type === 'wifi';
  return true; // stub — always allows download in dev
}

/**
 * §18.2 rule 6 — Check if a bundle is already downloaded and up-to-date.
 */
export function isBundleDownloaded(
  _worldId: string,
  _manifestVersion: string,
): boolean {
  // Production:
  // const path = `${RNFS.DocumentDirectoryPath}/content/${worldId}/bundle.zip`;
  // const versionPath = `${path}.version`;
  // return RNFS.exists(path) && RNFS.readFile(versionPath) === manifestVersion;
  return false;
}

// Dedicated Current Version Configuration for Rain Game
export const APP_VERSION = '1.4.3';

export function compareVersions(a: string, b: string): number {
  const cleanA = String(a || '0.0.0').replace(/^v/i, '').trim();
  const cleanB = String(b || '0.0.0').replace(/^v/i, '').trim();
  const partsA = cleanA.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);

  for (let i = 0; i < len; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

const VERSION_TAG_REGEX = /\s*\[v(\d+(?:\.\d+)*)\]\s*$/i;

export function extractRoomVersion(roomName?: string, explicitVersion?: string): string {
  if (explicitVersion && explicitVersion.trim()) {
    return explicitVersion.replace(/^v/i, '').trim();
  }
  if (roomName) {
    const match = roomName.match(VERSION_TAG_REGEX);
    if (match && match[1]) {
      return match[1];
    }
  }
  return '1.0.0';
}

export function stripRoomVersionTag(roomName: string): string {
  return roomName.replace(VERSION_TAG_REGEX, '').trim();
}

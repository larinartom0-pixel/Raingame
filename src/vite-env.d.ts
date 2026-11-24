/// <reference types="vite/client" />

declare module 'virtual:music-manifest' {
  export interface DiscoveredTrackManifestItem {
    id: string;
    category: 'menu' | 'game' | 'battle';
    filename: string;
    relativeUrl: string;
    title: string;
    artist: string;
    sizeBytes?: number;
    sidecarCoverUrl?: string;
  }

  const manifest: DiscoveredTrackManifestItem[];
  export default manifest;
}

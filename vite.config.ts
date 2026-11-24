import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.opus', '.webm']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const MUSIC_CATEGORY_FOLDERS = [
  {folder: 'Main_menu', category: 'menu' as const},
  {folder: 'In_game', category: 'game' as const},
  {folder: 'In_battle', category: 'battle' as const},
];

interface DiscoveredTrackNode {
  id: string;
  category: 'menu' | 'game' | 'battle';
  filename: string;
  relativeUrl: string;
  title: string;
  artist: string;
  sizeBytes: number;
  sidecarCoverUrl?: string;
  absPath: string;
  inPublic: boolean;
  sidecarAbsPath?: string;
  sidecarRelativePath?: string;
  sidecarInPublic?: boolean;
}

function prettifyAudioNameNode(filename: string): {title: string; artist: string} {
  const clean = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const split = clean.split(/\s+[-–—]\s+/);
  if (split.length >= 2 && split[0].trim() && split.slice(1).join(' - ').trim()) {
    return {artist: split[0].trim(), title: split.slice(1).join(' - ').trim()};
  }
  return {title: clean || filename, artist: ''};
}

function decodeNodeTextFrame(frameData: Buffer): string {
  if (!frameData || frameData.length === 0) return '';
  const enc = frameData[0];
  const rest = frameData.subarray(1);
  try {
    if (enc === 0) {
      const hasHigh = rest.some((b) => b >= 0x80);
      return new TextDecoder(hasHigh ? 'windows-1251' : 'latin1')
        .decode(rest)
        .replace(/\0/g, '')
        .trim();
    }
    if (enc === 1) {
      if (rest.length >= 2 && rest[0] === 0xfe && rest[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(rest.subarray(2)).replace(/\0/g, '').trim();
      }
      if (rest.length >= 2 && rest[0] === 0xff && rest[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(rest.subarray(2)).replace(/\0/g, '').trim();
      }
      return new TextDecoder('utf-16le').decode(rest).replace(/\0/g, '').trim();
    }
    if (enc === 2) {
      return new TextDecoder('utf-16be').decode(rest).replace(/\0/g, '').trim();
    }
    if (enc === 3) {
      return new TextDecoder('utf-8').decode(rest).replace(/\0/g, '').trim();
    }
  } catch {
    // Fallback below
  }
  try {
    return new TextDecoder('utf-8').decode(rest).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

function readNodeTrackTags(absPath: string, filename: string): {title: string; artist: string} {
  const fromName = prettifyAudioNameNode(filename);
  let title = '';
  let artist = '';

  let fd: number | null = null;
  try {
    const stat = fs.statSync(absPath);
    if (stat.size < 16) return fromName;
    fd = fs.openSync(absPath, 'r');

    const header = Buffer.alloc(10);
    fs.readSync(fd, header, 0, 10, 0);

    if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
      const majorVer = header[3];
      const flags = header[5];
      const tagSize =
        ((header[6] & 0x7f) << 21) |
        ((header[7] & 0x7f) << 14) |
        ((header[8] & 0x7f) << 7) |
        (header[9] & 0x7f);
      const readLen = Math.min(stat.size, 10 + tagSize);
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, 0);

      let pos = 10;
      if ((flags & 0x40) !== 0 && pos + 4 <= readLen) {
        if (majorVer === 4) {
          pos +=
            ((buf[pos] & 0x7f) << 21) |
            ((buf[pos + 1] & 0x7f) << 14) |
            ((buf[pos + 2] & 0x7f) << 7) |
            (buf[pos + 3] & 0x7f);
        } else {
          pos += 4 + buf.readUInt32BE(pos);
        }
      }

      if (majorVer === 2) {
        while (pos + 6 <= readLen) {
          const frameId = buf.toString('ascii', pos, pos + 3);
          if (!/^[A-Z0-9]{3}$/.test(frameId)) break;
          const frameSize = (buf[pos + 3] << 16) + (buf[pos + 4] << 8) + buf[pos + 5];
          if (frameSize <= 0 || pos + 6 + frameSize > readLen) break;
          const frameData = buf.subarray(pos + 6, pos + 6 + frameSize);
          if (frameId === 'TT2' && !title) title = decodeNodeTextFrame(frameData);
          else if (frameId === 'TP1' && !artist) artist = decodeNodeTextFrame(frameData);
          pos += 6 + frameSize;
          if (title && artist) break;
        }
      } else if (majorVer === 3 || majorVer === 4) {
        while (pos + 10 <= readLen) {
          const frameId = buf.toString('ascii', pos, pos + 4);
          if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
          let frameSize =
            majorVer === 4
              ? ((buf[pos + 4] & 0x7f) << 21) |
                ((buf[pos + 5] & 0x7f) << 14) |
                ((buf[pos + 6] & 0x7f) << 7) |
                (buf[pos + 7] & 0x7f)
              : buf.readUInt32BE(pos + 4);
          if (majorVer === 4 && pos + 10 + frameSize > readLen) {
            const altSize = buf.readUInt32BE(pos + 4);
            if (altSize > 0 && pos + 10 + altSize <= readLen) frameSize = altSize;
          }
          if (frameSize <= 0 || pos + 10 + frameSize > readLen) break;
          const frameData = buf.subarray(pos + 10, pos + 10 + frameSize);
          if (frameId === 'TIT2' && !title) title = decodeNodeTextFrame(frameData);
          else if (frameId === 'TPE1' && !artist) artist = decodeNodeTextFrame(frameData);
          pos += 10 + frameSize;
          if (title && artist) break;
        }
      }
    }

    if ((!title || !artist) && stat.size >= 128) {
      const tail = Buffer.alloc(128);
      fs.readSync(fd, tail, 0, 128, stat.size - 128);
      if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
        const decodeV1 = (slice: Buffer) => {
          const hasHigh = slice.some((b) => b >= 0x80);
          return new TextDecoder(hasHigh ? 'windows-1251' : 'latin1')
            .decode(slice)
            .replace(/\0/g, '')
            .trim();
        };
        if (!title) title = decodeV1(tail.subarray(3, 33));
        if (!artist) artist = decodeV1(tail.subarray(33, 63));
      }
    }
  } catch {
    // Ignore read errors and fall back to filename
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }

  return {
    title: title || fromName.title,
    artist: artist || fromName.artist || 'Rain Game OST',
  };
}

function discoverMusicTracks(): DiscoveredTrackNode[] {
  const roots = [
    {dir: path.resolve(__dirname, 'public/Music'), inPublic: true},
    {dir: path.resolve(__dirname, 'Music'), inPublic: false},
  ];

  const discovered: DiscoveredTrackNode[] = [];

  for (const {folder, category} of MUSIC_CATEGORY_FOLDERS) {
    const audioMap = new Map<string, {filename: string; absPath: string; inPublic: boolean}>();
    const imageMap = new Map<string, {filename: string; absPath: string; inPublic: boolean}>();

    for (const root of roots) {
      const folderPath = path.join(root.dir, folder);
      if (!fs.existsSync(folderPath)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(folderPath, {withFileTypes: true});
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        const key = entry.name.toLowerCase();
        const absPath = path.join(folderPath, entry.name);
        if (AUDIO_EXTENSIONS.has(ext) && !audioMap.has(key)) {
          audioMap.set(key, {filename: entry.name, absPath, inPublic: root.inPublic});
        } else if (IMAGE_EXTENSIONS.has(ext) && !imageMap.has(key)) {
          imageMap.set(key, {filename: entry.name, absPath, inPublic: root.inPublic});
        }
      }
    }

    const sortedAudio = Array.from(audioMap.values()).sort((a, b) =>
      a.filename.localeCompare(b.filename, undefined, {numeric: true, sensitivity: 'base'})
    );

    const genericCover = Array.from(imageMap.values()).find((img) =>
      /^(cover|folder|album|art)\./i.test(img.filename)
    );

    sortedAudio.forEach((audio, idx) => {
      const baseLower = audio.filename.replace(/\.[^/.]+$/, '').toLowerCase();
      const matchingCover =
        Array.from(imageMap.values()).find(
          (img) => img.filename.replace(/\.[^/.]+$/, '').toLowerCase() === baseLower
        ) || genericCover;

      const tags = readNodeTrackTags(audio.absPath, audio.filename);
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(audio.absPath).size;
      } catch {
        sizeBytes = 0;
      }
      const id = `${category}_${idx + 1}_${audio.filename.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      discovered.push({
        id,
        category,
        filename: audio.filename,
        relativeUrl: `Music/${folder}/${encodeURIComponent(audio.filename)}`,
        title: tags.title,
        artist: tags.artist,
        sizeBytes,
        sidecarCoverUrl: matchingCover
          ? `Music/${folder}/${encodeURIComponent(matchingCover.filename)}`
          : undefined,
        absPath: audio.absPath,
        inPublic: audio.inPublic,
        sidecarAbsPath: matchingCover?.absPath,
        sidecarRelativePath: matchingCover ? `Music/${folder}/${matchingCover.filename}` : undefined,
        sidecarInPublic: matchingCover?.inPublic,
      });
    });
  }

  return discovered;
}

function getMimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.ogg':
    case '.opus':
      return 'audio/ogg';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    case '.m4a':
    case '.aac':
      return 'audio/mp4';
    case '.webm':
      return 'audio/webm';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function toPublicManifest(tracks: DiscoveredTrackNode[]) {
  return tracks.map((t) => ({
    id: t.id,
    category: t.category,
    filename: t.filename,
    relativeUrl: t.relativeUrl,
    title: t.title,
    artist: t.artist,
    sizeBytes: t.sizeBytes,
    ...(t.sidecarCoverUrl ? {sidecarCoverUrl: t.sidecarCoverUrl} : {}),
  }));
}

function musicFolderDiscoveryPlugin(): Plugin {
  const virtualId = 'virtual:music-manifest';
  const resolvedVirtualId = '\0' + virtualId;

  return {
    name: 'music-folder-discovery',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id === resolvedVirtualId) {
        const manifest = toPublicManifest(discoverMusicTracks());
        return `export default ${JSON.stringify(manifest)};`;
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = (req.url || '').split('?')[0];
        if (rawUrl === '/Music/manifest.json' || rawUrl.endsWith('/Music/manifest.json')) {
          const manifest = toPublicManifest(discoverMusicTracks());
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.end(JSON.stringify(manifest));
          return;
        }

        const musicIdx = rawUrl.indexOf('/Music/');
        if (musicIdx >= 0) {
          const subPath = decodeURIComponent(rawUrl.slice(musicIdx + 1)); // "Music/Main_menu/foo.mp3"
          const publicPath = path.resolve(__dirname, 'public', subPath);
          const rootPath = path.resolve(__dirname, subPath);
          const rootDir = path.resolve(__dirname, 'Music');
          if (!fs.existsSync(publicPath) && rootPath.startsWith(rootDir) && fs.existsSync(rootPath)) {
            try {
              const stat = fs.statSync(rootPath);
              if (stat.isFile()) {
                res.setHeader('Content-Type', getMimeForExt(path.extname(rootPath)));
                res.setHeader('Content-Length', stat.size);
                fs.createReadStream(rootPath).pipe(res);
                return;
              }
            } catch {
              // fall through
            }
          }
        }
        next();
      });
    },
    generateBundle() {
      const tracks = discoverMusicTracks();
      this.emitFile({
        type: 'asset',
        fileName: 'Music/manifest.json',
        source: JSON.stringify(toPublicManifest(tracks), null, 2),
      });

      const emittedFiles = new Set<string>();
      for (const track of tracks) {
        const folderObj = MUSIC_CATEGORY_FOLDERS.find((f) => f.category === track.category);
        if (!track.inPublic && folderObj) {
          const relFile = `Music/${folderObj.folder}/${track.filename}`;
          if (!emittedFiles.has(relFile) && fs.existsSync(track.absPath)) {
            emittedFiles.add(relFile);
            this.emitFile({
              type: 'asset',
              fileName: relFile,
              source: fs.readFileSync(track.absPath),
            });
          }
        }
        if (
          track.sidecarAbsPath &&
          track.sidecarRelativePath &&
          !track.sidecarInPublic &&
          !emittedFiles.has(track.sidecarRelativePath) &&
          fs.existsSync(track.sidecarAbsPath)
        ) {
          emittedFiles.add(track.sidecarRelativePath);
          this.emitFile({
            type: 'asset',
            fileName: track.sidecarRelativePath,
            source: fs.readFileSync(track.sidecarAbsPath),
          });
        }
      }
    },
  };
}

function readAppVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'public/version.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version) {
      const cleaned = String(parsed.version).replace(/^v/i, '').trim();
      if (/^\d+(\.\d+)+$/.test(cleaned)) {
        return cleaned;
      }
    }
  } catch {
    // Fallback if version.json is temporarily unreadable
  }
  return '1.4.4';
}

function versionJsonSingleSourcePlugin(isServe: boolean): Plugin {
  return {
    name: 'version-json-single-source',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0].endsWith('/version.json')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
        next();
      });
    },
    transformIndexHtml(html) {
      if (!isServe) return html;
      const ver = readAppVersion();
      return html.replace(
        '<head>',
        `<head><script>window.__DEV_APP_VERSION__=${JSON.stringify(ver)};</script>`
      );
    },
  };
}

export default defineConfig(({command}) => {
  const initialVersion = readAppVersion();
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(initialVersion),
    },
    plugins: [
      react(),
      tailwindcss(),
      versionJsonSingleSourcePlugin(command === 'serve'),
      musicFolderDiscoveryPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

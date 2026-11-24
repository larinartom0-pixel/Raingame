// Zero-dependency browser ID3v1 / ID3v2 (2.2 / 2.3 / 2.4) + filename metadata parser
// Extracts track title, author/artist, and embedded cover art (APIC / PIC) from audio ArrayBuffers.

export interface ParsedAudioMetadata {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
}

const coverUrlCache = new Map<string, string>();

export function prettifyAudioFilename(filename: string): { title: string; artist: string } {
  const cleanName = decodeURIComponent(filename)
    .replace(/\.[^/.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Support standard "Artist - Title" filename convention
  const dashSplit = cleanName.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2 && dashSplit[0].trim() && dashSplit.slice(1).join(' - ').trim()) {
    return {
      artist: dashSplit[0].trim(),
      title: dashSplit.slice(1).join(' - ').trim(),
    };
  }

  return {
    title: cleanName || 'Unknown Track',
    artist: '',
  };
}

function readSyncSafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUInt24BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 16) + (bytes[offset + 1] << 8) + bytes[offset + 2];
}

function decodeTextFrame(frameData: Uint8Array): string {
  if (!frameData || frameData.length === 0) return '';
  const enc = frameData[0];
  const rest = frameData.subarray(1);

  try {
    if (enc === 0) {
      // Latin1 or Windows-1251 for Cyrillic tags saved without Unicode flag
      const hasHighBytes = rest.some((b) => b >= 0x80);
      const codec = hasHighBytes ? 'windows-1251' : 'latin1';
      return new TextDecoder(codec).decode(rest).replace(/\0/g, '').trim();
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

function inferImageMime(imgBytes: Uint8Array, declaredMime: string): string {
  const lower = (declaredMime || '').toLowerCase().trim();
  if (lower === 'image/jpg') return 'image/jpeg';
  if (lower.startsWith('image/')) return lower;

  if (imgBytes.length >= 4) {
    if (imgBytes[0] === 0xff && imgBytes[1] === 0xd8) return 'image/jpeg';
    if (imgBytes[0] === 0x89 && imgBytes[1] === 0x50 && imgBytes[2] === 0x4e && imgBytes[3] === 0x47) {
      return 'image/png';
    }
    if (
      imgBytes[0] === 0x52 &&
      imgBytes[1] === 0x49 &&
      imgBytes[2] === 0x46 &&
      imgBytes[3] === 0x46
    ) {
      return 'image/webp';
    }
    if (imgBytes[0] === 0x47 && imgBytes[1] === 0x49 && imgBytes[2] === 0x46) return 'image/gif';
  }
  return 'image/jpeg';
}

function extractApicCover(frameData: Uint8Array, cacheKey: string, isV22: boolean): string | undefined {
  if (!frameData || frameData.length < 16) return undefined;

  let imgOffset = 0;
  let declaredMime = '';

  if (isV22) {
    // ID3v2.2 PIC: [encoding 1B][imageFormat 3B][picType 1B][description (null-term)][data...]
    const enc = frameData[0];
    const fmt = String.fromCharCode(frameData[1] || 0, frameData[2] || 0, frameData[3] || 0).toLowerCase();
    declaredMime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    let pos = 5;
    if (enc === 1 || enc === 2) {
      while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
        pos += 2;
      }
      pos += 2;
    } else {
      const z = frameData.indexOf(0, pos);
      pos = z >= 0 ? z + 1 : pos;
    }
    imgOffset = pos;
  } else {
    // ID3v2.3 / v2.4 APIC: [encoding 1B][mime (null-term)][picType 1B][description (null-term)][data...]
    const enc = frameData[0];
    const mimeEnd = frameData.indexOf(0, 1);
    if (mimeEnd < 0) return undefined;

    for (let i = 1; i < mimeEnd; i++) {
      declaredMime += String.fromCharCode(frameData[i]);
    }

    let pos = mimeEnd + 2; // skip null + pictureType
    if (enc === 1 || enc === 2) {
      while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
        pos += 2;
      }
      pos += 2;
    } else {
      const z = frameData.indexOf(0, pos);
      pos = z >= 0 ? z + 1 : pos;
    }
    imgOffset = pos;
  }

  if (imgOffset <= 0 || imgOffset >= frameData.length - 8) return undefined;

  const imgBytes = frameData.slice(imgOffset);
  if (imgBytes.length < 16) return undefined;

  const mime = inferImageMime(imgBytes, declaredMime);
  const prevUrl = coverUrlCache.get(cacheKey);
  if (prevUrl) return prevUrl;

  const blob = new Blob([imgBytes], { type: mime });
  const objectUrl = URL.createObjectURL(blob);
  coverUrlCache.set(cacheKey, objectUrl);
  return objectUrl;
}

export function parseAudioMetadata(
  arrayBuffer: ArrayBuffer,
  cacheKey: string,
  filename: string
): ParsedAudioMetadata {
  const bytes = new Uint8Array(arrayBuffer);
  const fromName = prettifyAudioFilename(filename);

  let title = '';
  let artist = '';
  let album = '';
  let coverUrl = coverUrlCache.get(cacheKey);

  // 1. Parse ID3v2 tag at file start
  if (
    bytes.length > 10 &&
    bytes[0] === 0x49 && // I
    bytes[1] === 0x44 && // D
    bytes[2] === 0x33    // 3
  ) {
    const majorVer = bytes[3];
    const flags = bytes[5];
    const tagSize = readSyncSafeInt(bytes, 6);
    const tagEnd = Math.min(bytes.length, 10 + tagSize);

    let pos = 10;
    // Skip extended header if present
    if ((flags & 0x40) !== 0 && pos + 4 <= tagEnd) {
      if (majorVer === 4) {
        pos += readSyncSafeInt(bytes, pos);
      } else {
        pos += 4 + readUInt32BE(bytes, pos);
      }
    }

    if (majorVer === 2) {
      while (pos + 6 <= tagEnd) {
        const frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2]);
        if (!/^[A-Z0-9]{3}$/.test(frameId)) break;
        const frameSize = readUInt24BE(bytes, pos + 3);
        if (frameSize <= 0 || pos + 6 + frameSize > tagEnd) break;
        const frameData = bytes.subarray(pos + 6, pos + 6 + frameSize);

        if (frameId === 'TT2' && !title) title = decodeTextFrame(frameData);
        else if (frameId === 'TP1' && !artist) artist = decodeTextFrame(frameData);
        else if (frameId === 'TAL' && !album) album = decodeTextFrame(frameData);
        else if (frameId === 'PIC' && !coverUrl) {
          coverUrl = extractApicCover(frameData, cacheKey, true);
        }

        pos += 6 + frameSize;
      }
    } else if (majorVer === 3 || majorVer === 4) {
      while (pos + 10 <= tagEnd) {
        const frameId = String.fromCharCode(
          bytes[pos],
          bytes[pos + 1],
          bytes[pos + 2],
          bytes[pos + 3]
        );
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

        let frameSize =
          majorVer === 4 ? readSyncSafeInt(bytes, pos + 4) : readUInt32BE(bytes, pos + 4);
        // Handle non-standard encoders that write uint32 even in v2.4
        if (majorVer === 4 && pos + 10 + frameSize > tagEnd) {
          const altSize = readUInt32BE(bytes, pos + 4);
          if (altSize > 0 && pos + 10 + altSize <= tagEnd) {
            frameSize = altSize;
          }
        }
        if (frameSize <= 0 || pos + 10 + frameSize > tagEnd) break;

        const frameData = bytes.subarray(pos + 10, pos + 10 + frameSize);

        if (frameId === 'TIT2' && !title) title = decodeTextFrame(frameData);
        else if (frameId === 'TPE1' && !artist) artist = decodeTextFrame(frameData);
        else if (frameId === 'TALB' && !album) album = decodeTextFrame(frameData);
        else if (frameId === 'APIC' && !coverUrl) {
          coverUrl = extractApicCover(frameData, cacheKey, false);
        }

        pos += 10 + frameSize;
      }
    }
  }

  // 2. Fallback to ID3v1 at file end (128 bytes starting with "TAG")
  if ((!title || !artist) && bytes.length >= 128) {
    const tail = bytes.subarray(bytes.length - 128);
    if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
      const decodeV1 = (slice: Uint8Array) => {
        const hasHigh = slice.some((b) => b >= 0x80);
        return new TextDecoder(hasHigh ? 'windows-1251' : 'latin1')
          .decode(slice)
          .replace(/\0/g, '')
          .trim();
      };
      if (!title) title = decodeV1(tail.subarray(3, 33));
      if (!artist) artist = decodeV1(tail.subarray(33, 63));
      if (!album) album = decodeV1(tail.subarray(63, 93));
    }
  }

  return {
    title: title || fromName.title,
    artist: artist || fromName.artist || 'Rain Game OST',
    album: album || undefined,
    coverUrl,
  };
}

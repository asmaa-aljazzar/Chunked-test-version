const LOCAL_MEDIA_PREFIXES = [
  '/storage/focus-media/',
  '/api/storage/public-objects/focus-media/',
  '/api/storage/focus-media/',
];

function isSafeLocalMediaPath(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0];
  if (!LOCAL_MEDIA_PREFIXES.some((prefix) => path.startsWith(prefix)) || path.includes('\\')) {
    return false;
  }

  return path.split('/').slice(1).every((segment) => {
    if (!segment) return false;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== '.' && decoded !== '..' && !decoded.includes('/') && !decoded.includes('\\');
    } catch {
      return false;
    }
  });
}

function directHttpsAsset(value: string, extensions: string): string | null {
  const trimmed = value.trim();
  const path = trimmed.split(/[?#]/, 1)[0];
  if (
    isSafeLocalMediaPath(trimmed)
    && new RegExp(`\\.(?:${extensions})$`, 'i').test(path)
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (!new RegExp(`\\.(?:${extensions})$`, 'i').test(parsed.pathname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function validateDirectVisualUrl(value: string): string | null {
  return directHttpsAsset(value, 'png|jpe?g|webp|gif|mp4|webm|mov');
}

export function validateDirectAudioUrl(value: string): string | null {
  return directHttpsAsset(value, 'mp3|wav|ogg|m4a|aac|webm');
}

export function isVideoUrl(value: string): boolean {
  const trimmed = value.trim();
  if (isSafeLocalMediaPath(trimmed)) {
    return /\.(mp4|webm|mov)$/i.test(trimmed.split(/[?#]/, 1)[0]);
  }
  try {
    return /\.(mp4|webm|mov)$/i.test(new URL(trimmed).pathname);
  } catch {
    return false;
  }
}

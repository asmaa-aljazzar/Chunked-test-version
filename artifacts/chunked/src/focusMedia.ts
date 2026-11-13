function directHttpsAsset(value: string, extensions: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.startsWith('/storage/focus-media/')
    && !trimmed.startsWith('//')
    && !trimmed.includes('\\')
    && !trimmed.split(/[?#]/, 1)[0].split('/').includes('..')
    && new RegExp(`\\.(?:${extensions})$`, 'i').test(trimmed.split(/[?#]/, 1)[0])
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
  if (value.trim().startsWith('/storage/focus-media/')) {
    return /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(value.trim());
  }
  try {
    return /\.(mp4|webm|mov)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

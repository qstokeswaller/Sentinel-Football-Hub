/** Video URL helpers — ported from src/js/r2-upload.js isStoredVideo. */
export function isStoredVideo(url?: string): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v|avi)(\?.*)?$/i.test(url) || url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com');
}

/** Extract a YouTube video id from a watch/embed/short URL, else null. */
export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

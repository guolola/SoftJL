// Validates the deployment origin shared by server metadata and client navigation.
export function resolvePublicSiteUrl(value?: string, required = false): string {
  const raw = value?.trim();
  if (!raw && required) throw new Error('PUBLIC_WEB_BASE_URL is required for a production SEO build.');
  const url = new URL(raw || 'http://localhost:3000');
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && (!localHttp || required)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_WEB_BASE_URL must be an HTTPS origin without credentials, path, query, or hash.');
  }
  return url.origin;
}

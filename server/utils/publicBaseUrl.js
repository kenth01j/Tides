function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
    ? forwardedProtocol
    : req.protocol;
  if (!host) throw new Error('A public host is required to generate booking receipt links.');
  return `${protocol}://${host}`;
}

module.exports = publicBaseUrl;

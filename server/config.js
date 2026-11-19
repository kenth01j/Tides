const path = require('path');

function getConfig(env = process.env, projectRoot = path.resolve(__dirname, '..')) {
  const errors = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const port = env.PORT === undefined || env.PORT === '' ? 3000 : Number(env.PORT);
  const mongoUri = env.MONGODB_URI;
  const jwtSecret = env.JWT_SECRET;
  const trustProxySetting = env.TRUST_PROXY || 'loopback';
  let publicBaseUrl;

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, test, or production.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535.');
  }
  if (!mongoUri) {
    errors.push('MONGODB_URI is required.');
  } else {
    try {
      const parsedMongoUri = new URL(mongoUri);
      if (!['mongodb:', 'mongodb+srv:'].includes(parsedMongoUri.protocol) || !parsedMongoUri.hostname) {
        errors.push('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
      }
    } catch {
      errors.push('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
    }
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    errors.push('JWT_SECRET is required and must contain at least 32 characters.');
  }

  let trustProxy;
  if (trustProxySetting === 'true') trustProxy = 1;
  else if (trustProxySetting === 'false') trustProxy = false;
  else if (/^\d+$/.test(trustProxySetting)) trustProxy = Number(trustProxySetting);
  else trustProxy = trustProxySetting;
  if (typeof trustProxy === 'number' && (!Number.isSafeInteger(trustProxy) || trustProxy < 0)) {
    errors.push('TRUST_PROXY must be true, false, a non-negative hop count, or a trusted subnet name.');
  }

  if (env.PUBLIC_BASE_URL) {
    try {
      const parsedBaseUrl = new URL(env.PUBLIC_BASE_URL);
      if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) ||
          parsedBaseUrl.username || parsedBaseUrl.password ||
          parsedBaseUrl.search || parsedBaseUrl.hash ||
          (parsedBaseUrl.pathname !== '/' && parsedBaseUrl.pathname !== '')) {
        errors.push('PUBLIC_BASE_URL must be an origin such as https://tides.example, without credentials, path, query, or fragment.');
      } else {
        publicBaseUrl = parsedBaseUrl.origin;
      }
    } catch {
      errors.push('PUBLIC_BASE_URL must be an absolute HTTP or HTTPS origin.');
    }
  }
  if (nodeEnv === 'production' && (!publicBaseUrl || !publicBaseUrl.startsWith('https://'))) {
    errors.push('PUBLIC_BASE_URL must be set to your HTTPS site origin in production.');
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  const paymentProofDir = path.resolve(
    projectRoot,
    env.PAYMENT_PROOF_DIR || path.join('server', 'private', 'payment-proofs')
  );
  return {
    nodeEnv,
    port,
    mongoUri,
    jwtSecret,
    trustProxy,
    publicBaseUrl,
    paymentProofDir
  };
}

module.exports = { getConfig };

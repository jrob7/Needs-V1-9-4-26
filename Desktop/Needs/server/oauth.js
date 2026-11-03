// server/oauth.js
//
// OAuth 2.1 authorization server protecting /mcp, so an AI agent/MCP client
// can get a real, user-approved access token instead of only being able to
// act as a guest. Public clients only (PKCE, no client secret) - every MCP
// client is effectively a native/public app, so there is no meaningful
// "confidential client" here; issuing secrets nobody could actually keep
// secret would be theater, not security.
//
// Flow: POST /oauth/register (Dynamic Client Registration, RFC 7591) once
// per client -> GET /oauth/authorize (the user logs into their real Needs
// account and approves the client; PKCE challenge recorded against a
// single-use code) -> POST /oauth/token (code + verifier -> the same
// access/refresh tokens /login already issues) -> client calls /mcp with
// Authorization: Bearer <token>.
//
// Deliberately scoped: login only at /oauth/authorize, not full signup -
// someone without an account yet creates one through the app itself first.
// One implicit scope (full account access, matching what /login already
// grants) rather than a scope negotiation system nothing here needs yet.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const AUTH_CODE_TTL_MS = 60 * 1000; // single-use, exchanged almost immediately

function renderAuthorizePage({ clientName, redirectUri, formAction, hidden, error }) {
  const hiddenInputs = Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${(v || '').replace(/"/g, '&quot;')}">`)
    .join('');
  const host = (() => { try { return new URL(redirectUri).host; } catch { return redirectUri; } })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${clientName} — Needs</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F4F8FD; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; overflow: hidden; position: relative; }
  .wave-back, .wave-front { position: absolute; bottom: 0; left: 0; width: 100%; }
  .wave-back { height: 160px; }
  .wave-front { height: 120px; }
  .card { position: relative; background: #fff; border-radius: 24px; padding: 32px 26px 26px; width: 100%; max-width: 420px; box-shadow: 0 8px 20px rgba(30,58,138,.12); text-align: center; z-index: 1; }
  .logo { width: 130px; height: 65px; object-fit: contain; margin-bottom: 6px; }
  .title { font-size: 1.3rem; font-weight: 800; color: #0F172A; margin: 10px 0 4px; }
  .subtitle { font-size: .85rem; color: #64748B; margin-bottom: 22px; line-height: 1.5; }
  .subtitle b { color: #0F172A; }
  .field { width: 100%; border: 1px solid #E2E8F0; border-radius: 12px; padding: 0 14px; height: 50px; font-size: .9rem; margin-bottom: 12px; outline: none; color: #0F172A; background: #F8FAFC; }
  .field:focus { border-color: #2563EB; }
  .error { background: #FEF2F2; color: #DC2626; font-size: .8rem; border-radius: 10px; padding: 9px 12px; margin-bottom: 12px; text-align: left; }
  .submit { background: #2563EB; color: #fff; border: none; border-radius: 12px; height: 50px; font-size: .92rem; font-weight: 700; cursor: pointer; width: 100%; box-shadow: 0 4px 10px rgba(37,99,235,.28); }
  .scope-note { font-size: .76rem; color: #94A3B8; margin-top: 16px; line-height: 1.5; }
</style>
</head>
<body>
  <svg class="wave-back" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M0,12 C25,28 75,5 100,18 L100,30 L0,30 Z" fill="#DCE9FB"/></svg>
  <svg class="wave-front" viewBox="0 0 100 22" preserveAspectRatio="none"><path d="M0,16 C30,2 70,26 100,14 L100,22 L0,22 Z" fill="#C7DCF6"/></svg>
  <div class="card">
    <img class="logo" src="/assets/NeedsLogo.png" alt="Needs">
    <div class="title">Authorize ${clientName}</div>
    <div class="subtitle"><b>${clientName}</b> wants to access your Needs account (${host}). Log in to approve.</div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="${formAction}">
      ${hiddenInputs}
      <input class="field" type="email" name="email" placeholder="Email address" required autofocus>
      <input class="field" type="password" name="password" placeholder="Password" required>
      <button class="submit" type="submit">Log In &amp; Authorize</button>
    </form>
    <div class="scope-note">This lets ${clientName} request quotes and ask businesses questions as you, skipping the usual email confirmation step. You can revoke access by changing your password.</div>
  </div>
</body>
</html>`;
}

function renderOAuthError(message) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Authorization Error — Needs</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F0F2F5;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.card{background:#fff;border-radius:16px;padding:36px 28px;max-width:420px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08);}
h1{font-size:1.2rem;color:#0F172A;margin-bottom:8px;}p{font-size:.95rem;color:#64748B;line-height:1.5;}</style></head>
<body><div class="card"><div style="font-size:2.6rem;margin-bottom:12px;">⚠️</div><h1>Authorization Error</h1><p>${message}</p></div></body></html>`;
}

function registerOAuthRoutes(app, { database, bcrypt, signTokens, NODE_API }) {
  const ISSUER = process.env.MODULE_BASE_URL || NODE_API;

  // ── Discovery metadata ───────────────────────────────────────────────────
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      registration_endpoint: `${ISSUER}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
      resource: `${ISSUER}/mcp`,
      authorization_servers: [ISSUER],
    });
  });

  // ── Dynamic Client Registration (RFC 7591) ───────────────────────────────
  app.post('/oauth/register', async (req, res) => {
    try {
      const { redirect_uris, client_name } = req.body || {};
      if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
      }
      for (const uri of redirect_uris) {
        try { new URL(uri); } catch {
          return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `Not a valid URL: ${uri}` });
        }
      }
      const client_id = crypto.randomBytes(16).toString('hex');
      await database.collection('OAuthClients').insertOne({
        client_id, client_name: client_name || 'Unnamed MCP client', redirect_uris,
        createdAt: new Date(),
      });
      res.status(201).json({
        client_id,
        redirect_uris,
        client_name: client_name || 'Unnamed MCP client',
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      });
    } catch (err) {
      console.error('❌ /oauth/register error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── Authorization endpoint ────────────────────────────────────────────────
  app.get('/oauth/authorize', async (req, res) => {
    const { client_id, redirect_uri, code_challenge, code_challenge_method, state, response_type } = req.query;
    if (response_type !== 'code') return res.status(400).send(renderOAuthError('Only response_type=code is supported.'));
    if (!client_id || !redirect_uri || !code_challenge) return res.status(400).send(renderOAuthError('Missing required parameters (client_id, redirect_uri, code_challenge).'));
    if (code_challenge_method && code_challenge_method !== 'S256') return res.status(400).send(renderOAuthError('Only the S256 code_challenge_method is supported.'));

    const oauthClient = await database.collection('OAuthClients').findOne({ client_id });
    if (!oauthClient) return res.status(400).send(renderOAuthError('Unknown client_id. This client must register via /oauth/register first.'));
    if (!oauthClient.redirect_uris.includes(redirect_uri)) return res.status(400).send(renderOAuthError('redirect_uri does not match a URI registered for this client.'));

    res.send(renderAuthorizePage({
      clientName: oauthClient.client_name,
      redirectUri: redirect_uri,
      formAction: '/oauth/authorize',
      hidden: { client_id, redirect_uri, code_challenge, state: state || '' },
    }));
  });

  app.post('/oauth/authorize', async (req, res) => {
    try {
      const { email, password, client_id, redirect_uri, code_challenge, state } = req.body || {};
      const oauthClient = await database.collection('OAuthClients').findOne({ client_id });
      if (!oauthClient || !oauthClient.redirect_uris.includes(redirect_uri)) {
        return res.status(400).send(renderOAuthError('Invalid client or redirect_uri.'));
      }

      const normEmail = String(email || '').trim().toLowerCase();
      const user = await database.collection('Users').findOne({ email: normEmail });
      const dbPw = user?.password;
      const isBcrypt = typeof dbPw === 'string' && dbPw.startsWith('$2');
      const ok = user && dbPw != null && (isBcrypt
        ? await bcrypt.compare(String(password || ''), dbPw)
        : String(password || '') === String(dbPw));

      if (!ok) {
        return res.send(renderAuthorizePage({
          clientName: oauthClient.client_name,
          redirectUri: redirect_uri,
          formAction: '/oauth/authorize',
          hidden: { client_id, redirect_uri, code_challenge, state: state || '' },
          error: 'Incorrect email or password.',
        }));
      }

      const code = crypto.randomBytes(24).toString('hex');
      await database.collection('OAuthAuthCodes').insertOne({
        code, client_id, userId: user._id, redirect_uri, code_challenge,
        createdAt: new Date(), used: false,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', code);
      if (state) redirectUrl.searchParams.set('state', state);
      res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error('❌ POST /oauth/authorize error:', err);
      res.status(500).send(renderOAuthError('Something went wrong. Please try again.'));
    }
  });

  // ── Token endpoint ─────────────────────────────────────────────────────────
  app.post('/oauth/token', async (req, res) => {
    try {
      const { grant_type, code, code_verifier, redirect_uri, refresh_token } = req.body || {};

      if (grant_type === 'refresh_token') {
        if (!refresh_token) return res.status(400).json({ error: 'invalid_request' });
        try {
          const payload = jwt.verify(refresh_token, process.env.REFRESH_SECRET);
          const { token, refreshToken } = signTokens(payload.userId);
          return res.json({ access_token: token, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 1800 });
        } catch {
          return res.status(400).json({ error: 'invalid_grant' });
        }
      }

      if (grant_type !== 'authorization_code') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
      }
      if (!code || !code_verifier || !redirect_uri) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      const authCode = await database.collection('OAuthAuthCodes').findOne({ code });
      if (!authCode || authCode.used) return res.status(400).json({ error: 'invalid_grant' });
      // Single-use: mark consumed immediately, before any further validation,
      // so a retried/duplicated exchange can never succeed twice.
      await database.collection('OAuthAuthCodes').updateOne({ _id: authCode._id }, { $set: { used: true } });

      const isExpired = (Date.now() - new Date(authCode.createdAt).getTime()) > AUTH_CODE_TTL_MS;
      if (isExpired) return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired' });
      if (authCode.redirect_uri !== redirect_uri) return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });

      const computedChallenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');
      if (computedChallenge !== authCode.code_challenge) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }

      const { token, refreshToken } = signTokens(authCode.userId.toString());
      res.json({ access_token: token, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 1800 });
    } catch (err) {
      console.error('❌ /oauth/token error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}

module.exports = { registerOAuthRoutes };

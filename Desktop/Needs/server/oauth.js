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
// single-use code) -> POST /oauth/token (code + verifier -> an mcp-scoped
// access/refresh token pair, shaped like but distinct from what /login
// issues) -> client calls /mcp with Authorization: Bearer <token>.
//
// Deliberately scoped: login only at /oauth/authorize, not full signup -
// someone without an account yet creates one through the app itself first.
// The `signTokens` passed in here is app.js's signMcpTokens, not its plain
// signTokens - every token this module issues carries scope: 'mcp', which
// requireAuth (app.js) refuses everywhere except the couple of endpoints an
// MCP client is actually meant to call. Keeps this module's own code
// agnostic to that distinction; it just calls whatever token-signing
// function it was handed.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { escapeHtml } = require('./htmlEscape');

const AUTH_CODE_TTL_MS = 60 * 1000; // single-use, exchanged almost immediately

// The permissions an approving user can grant/withhold per connection.
// Stored on the auth code at approval time, then copied onto the resulting
// OAuthGrants row at token exchange - every MCP tool checks this array
// (via /mcp/account's resolved scopes) before doing anything, independent
// of whatever the connecting client itself claims to want.
const SCOPE_CATALOG = [
  { id: 'search',   label: 'Search businesses and services' },
  { id: 'request',  label: 'Create quote requests and ask businesses questions' },
  { id: 'read',     label: 'Read your existing requests, quotes, and conversations' },
  { id: 'respond',  label: 'Respond to businesses on your behalf' },
  { id: 'schedule', label: 'Request, propose, and confirm appointment times' },
];
const DEFAULT_SCOPES = SCOPE_CATALOG.map(s => s.id);

// Registration itself grants no access (a real user still has to approve a
// client by logging in at /oauth/authorize), so this isn't a hard security
// boundary - it just raises the cost of mass-registering throwaway clients
// for a phishing campaign (see the security review). 10/hour per IP is
// generous for real use (registering one client per app/device is rare)
// while meaningfully limiting bulk abuse.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', error_description: 'Too many client registrations from this address. Try again later.' },
});

function renderAuthorizePage({ clientName, redirectUri, formAction, hidden, error, selectedScopes }) {
  // client_name and redirect_uri are both attacker-controlled free text at
  // registration time (POST /oauth/register accepts any string) - this page
  // renders on our own real domain, so without escaping, a malicious
  // client_name would execute as script in the context of a trusted origin
  // while a real user is actively typing their password into the form here.
  const safeClientName = escapeHtml(clientName);
  const safeRedirectUri = escapeHtml(redirectUri);
  const hiddenInputs = Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v || '')}">`)
    .join('');
  const checkedScopes = new Set(selectedScopes || DEFAULT_SCOPES);
  const scopeRows = SCOPE_CATALOG.map(s => `
    <label class="scope-row">
      <input type="checkbox" name="scopes" value="${escapeHtml(s.id)}" ${checkedScopes.has(s.id) ? 'checked' : ''}>
      <span>${escapeHtml(s.label)}</span>
    </label>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize ${safeClientName} — Needs</title>
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
  .redirect-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px; margin-bottom: 18px; font-size: .76rem; color: #334155; word-break: break-all; text-align: left; }
  .redirect-box b { display: block; font-size: .68rem; color: #94A3B8; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 3px; font-weight: 700; }
  .scopes-label { font-size: .72rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: .4px; text-align: left; margin-bottom: 8px; }
  .scope-row { display: flex; align-items: center; gap: 10px; text-align: left; padding: 9px 0; border-bottom: 1px solid #F1F5F9; font-size: .85rem; color: #334155; }
  .scope-row:last-child { border-bottom: none; }
  .scope-row input { width: 17px; height: 17px; flex-shrink: 0; accent-color: #2563EB; }
  .scopes-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; margin-bottom: 18px; }
</style>
</head>
<body>
  <svg class="wave-back" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M0,12 C25,28 75,5 100,18 L100,30 L0,30 Z" fill="#DCE9FB"/></svg>
  <svg class="wave-front" viewBox="0 0 100 22" preserveAspectRatio="none"><path d="M0,16 C30,2 70,26 100,14 L100,22 L0,22 Z" fill="#C7DCF6"/></svg>
  <div class="card">
    <img class="logo" src="/assets/NeedsLogo.png" alt="Needs">
    <div class="title">Authorize ${safeClientName}</div>
    <div class="subtitle"><b>${safeClientName}</b> wants to access your Needs account. Log in to approve.</div>
    <div class="redirect-box"><b>You will be returned to</b>${safeRedirectUri}</div>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="${formAction}">
      ${hiddenInputs}
      <input class="field" type="email" name="email" placeholder="Email address" required autofocus>
      <input class="field" type="password" name="password" placeholder="Password" required>
      <div class="scopes-label">${safeClientName} is requesting</div>
      <div class="scopes-box">${scopeRows}</div>
      <button class="submit" type="submit">Log In &amp; Authorize</button>
    </form>
    <div class="scope-note">Uncheck anything you don't want to allow. Accepting a quote, confirming an appointment, or canceling one always asks you separately, no matter what's checked above. You can review or revoke this anytime from Account &rarr; Connected AI.</div>
  </div>
</body>
</html>`;
}

function renderOAuthError(message) {
  // Every current call site passes a fixed string we wrote, never user
  // input - escaped anyway so that stays true even if a future call site
  // forgets to, rather than relying on every caller remembering to.
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Authorization Error — Needs</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F0F2F5;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.card{background:#fff;border-radius:16px;padding:36px 28px;max-width:420px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08);}
h1{font-size:1.2rem;color:#0F172A;margin-bottom:8px;}p{font-size:.95rem;color:#64748B;line-height:1.5;}</style></head>
<body><div class="card"><div style="font-size:2.6rem;margin-bottom:12px;">⚠️</div><h1>Authorization Error</h1><p>${escapeHtml(message)}</p></div></body></html>`;
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

  // /mcp itself is optionally-authenticated (guest-first by design - see
  // mcp.js) so it isn't really "protected" in the sense this document means.
  // /mcp/account is the endpoint that actually requires a valid grant.
  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
      resource: `${ISSUER}/mcp/account`,
      authorization_servers: [ISSUER],
    });
  });

  // ── Dynamic Client Registration (RFC 7591) ───────────────────────────────
  app.post('/oauth/register', registerLimiter, async (req, res) => {
    try {
      const { redirect_uris, client_name } = req.body || {};
      if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
      }
      for (const uri of redirect_uris) {
        let parsed;
        try { parsed = new URL(uri); } catch {
          return res.status(400).json({ error: 'invalid_redirect_uri', error_description: `Not a valid URL: ${uri}` });
        }
        // OAuth 2.1 requires redirect_uris to be HTTPS, with the standard
        // exception for loopback addresses used by local/dev clients - an
        // http:// redirect anywhere else lets the authorization code (and
        // the account access it grants) be intercepted in transit.
        const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
          return res.status(400).json({
            error: 'invalid_redirect_uri',
            error_description: `redirect_uri must be https:// (or http://localhost for local development): ${uri}`,
          });
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

      // Checkbox fields only arrive as an array when 2+ are checked; a
      // single checked box posts as a bare string instead.
      const rawScopes = req.body?.scopes;
      const requestedScopes = Array.isArray(rawScopes) ? rawScopes : (rawScopes ? [rawScopes] : []);
      // Never trust an unknown value through to storage - whitelist against
      // the catalog this page itself rendered.
      const validScopeIds = new Set(SCOPE_CATALOG.map(s => s.id));
      const scopes = requestedScopes.filter(s => validScopeIds.has(s));

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
          selectedScopes: scopes,
        }));
      }

      const code = crypto.randomBytes(24).toString('hex');
      await database.collection('OAuthAuthCodes').insertOne({
        code, client_id, userId: user._id, redirect_uri, code_challenge, scopes,
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
          // Never trust the tokenVersion embedded in the token being
          // refreshed - look up what it is right now, so a revoke
          // (Sign Out of All Devices) takes effect on this refresh instead
          // of silently minting another valid pair for an already-revoked
          // session.
          if (!ObjectId.isValid(payload.userId)) return res.status(400).json({ error: 'invalid_grant' });
          const user = await database.collection('Users').findOne(
            { _id: new ObjectId(payload.userId) }, { projection: { tokenVersion: 1 } }
          );
          if (!user || (user.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
            return res.status(400).json({ error: 'invalid_grant' });
          }
          // Same check as /mcp/account's own gate - a refresh for a since-
          // revoked connection (Account -> Connected AI -> Disconnect)
          // must fail here too, not just on its next actual tool call.
          if (payload.clientId) {
            const grant = await database.collection('OAuthGrants').findOne({ userId: payload.userId, client_id: payload.clientId });
            if (!grant || grant.revoked) return res.status(400).json({ error: 'invalid_grant' });
          }
          const { token, refreshToken } = signTokens(payload.userId, user.tokenVersion || 0, payload.clientId || null);
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
      // Not exploitable here (code_challenge is public, not a secret - see
      // the security review), but timing-safe comparison is the correct
      // default discipline for crypto code regardless. timingSafeEqual
      // throws on mismatched lengths rather than returning false, hence the
      // length check first.
      const challengeMatches = computedChallenge.length === authCode.code_challenge.length
        && crypto.timingSafeEqual(Buffer.from(computedChallenge), Buffer.from(authCode.code_challenge));
      if (!challengeMatches) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }

      const user = await database.collection('Users').findOne(
        { _id: authCode.userId }, { projection: { tokenVersion: 1 } }
      );
      const userIdStr = authCode.userId.toString();

      // This is the actual "user approved this client" moment - record it as
      // its own grant (keyed by userId + client_id) so /mcp/account can
      // reject just this one connection later without touching any other
      // approved client or the user's regular app sessions. Upsert because
      // the same client can be re-authorized after being disconnected.
      const oauthClient = await database.collection('OAuthClients').findOne({ client_id: authCode.client_id });
      await database.collection('OAuthGrants').updateOne(
        { userId: userIdStr, client_id: authCode.client_id },
        {
          $set: {
            clientName: oauthClient?.client_name || 'Unnamed MCP client', revoked: false, grantedAt: new Date(),
            scopes: Array.isArray(authCode.scopes) ? authCode.scopes : [],
          },
          $setOnInsert: { lastVerifiedAt: new Date(), readCountSinceVerified: 0, createdAt: new Date() },
        },
        { upsert: true }
      );

      const { token, refreshToken } = signTokens(userIdStr, user?.tokenVersion || 0, authCode.client_id);
      res.json({ access_token: token, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 1800 });
    } catch (err) {
      console.error('❌ /oauth/token error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}

module.exports = { registerOAuthRoutes };

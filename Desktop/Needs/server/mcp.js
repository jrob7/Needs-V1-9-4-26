// server/mcp.js
//
// MCP server exposing the same operations the module page chat widget
// already performs, as directly-callable tools instead of something an
// agent has to simulate by typing into a chat box.
//
// Auth model: every tool works with no Authorization header at all, acting
// as a guest exactly like an anonymous module-page visitor - request_quote
// and ask_business go through the same email double opt-in guardrail the
// guest chat flow already uses, so nothing can take an action without a
// human confirming by email first. If the request carries a valid
// Authorization: Bearer <token> (obtained via the OAuth flow in oauth.js),
// request_quote and ask_business instead act as that real Needs user and
// skip the email confirmation step, the same way the web login/handoff
// flow already does.
//
// Every tool is a thin wrapper over an existing HTTP endpoint or a direct,
// read-only DB query - nothing here re-implements business logic that
// already exists elsewhere, so this can't drift out of sync with the
// module page itself.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

function buildServer({ client, NODE_API, userId, clientId = null, scopes = null, needsReverification = false }) {
  const server = new McpServer({ name: 'needs-module', version: '1.0.0' });

  const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
  const errorText = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

  // scopes is only ever a real array when this call resolved an actual
  // OAuthGrants row (always true for /mcp/account; best-effort for /mcp).
  // null means "no grant to check against" - guest use, or a token that
  // predates grants - and stays fully permissive, same as before scopes
  // existed at all. Only an authenticated session with a *resolved* grant
  // gets denied for a missing scope.
  const hasScope = (id) => scopes === null || scopes.includes(id);
  const scopeDeniedText = (label) =>
    errorText(`This connection doesn't have permission to ${label}. The user can enable it under Account → Connected AI on needs-module.com.`);

  // Every tool call for a real account gets one row here - the data trail
  // Account -> Connected AI's activity view reads from, and the substrate
  // any future smarter anomaly detection would be built on. Best-effort:
  // a logging failure should never break the actual tool call.
  const logActivity = (toolName, outcome) => {
    if (!userId) return;
    client.db('Need').collection('McpActivityLog').insertOne({
      userId, clientId, tool: toolName, outcome, at: new Date(),
    }).catch(() => {});
  };
  const registerLoggedTool = (name, config, handler) => {
    server.registerTool(name, config, async (...args) => {
      try {
        const result = await handler(...args);
        logActivity(name, result?.isError ? 'denied' : 'success');
        return result;
      } catch (err) {
        logActivity(name, 'error');
        throw err;
      }
    });
  };

  // Folded into the same message the server already returns for the
  // email-confirmation step, instead of a separate field. The confirmation
  // line gets relayed to the user reliably because it reads as the actual
  // fact of what happened, not a behavioral instruction about what to say;
  // a separate "nextStep"/"monitoring" field read as an optional aside and
  // got dropped in practice. Putting the same question inside the one
  // string the model already treats as load-bearing content is the fix.
  const withMonitoringAsk = (message, checkTool, checkArgs) =>
    `${message} Businesses on Needs often respond quickly, sometimes within the hour, so checking only once or twice a day can easily miss that - set up a recurring task now (calling ${checkTool}(${checkArgs})) that checks about every hour until there's a response, then stop it. Tell the user you are doing this. If you already have a recurring check running for something else, say so and switch it to about every hour too instead of leaving it on a slower interval.`;

  // Guest-only replacement for withMonitoringAsk on this path: there is no
  // check_request_status tool to poll anymore, since reading/acting on a
  // guest request happens entirely through the tracking link's own web
  // page now, not MCP. No key either - the tracking link itself becomes a
  // live read/write chat once confirmed, if AI access was requested.
  // Relay this as written - it tells the visitor what actually happens
  // next, not an instruction for the AI to act on by itself.
  const withTrackingLinkNote = (message, trackingKey, aiAccessEnabled) =>
    `${message} ${aiAccessEnabled
      ? `Since you asked for AI access, once confirmed this same tracking link becomes a live chat your AI can read and write through for 48 hours - no key needed: ${NODE_API}/trackRequest/${trackingKey}`
      : `Track status at ${NODE_API}/trackRequest/${trackingKey} once confirmed.`}`;

  registerLoggedTool('get_business', {
    title: 'Get business profile',
    description: 'Fetch a Needs business or restaurant profile by its slug: name, category, services, pricing (with a disclaimer that it is an estimate, not a binding quote), hours/availability, and contact info.',
    inputSchema: { slug: z.string().describe('The business slug, e.g. "example-technology-business-law-firm"') },
  }, async ({ slug }) => {
    if (userId && !hasScope('search')) return scopeDeniedText('search businesses');
    const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/profile`);
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Business not found');
    return text(data);
  });

  // Only offered when not already authenticated - the whole point is to
  // surface an option that is otherwise invisible to a client that has no
  // Authorization header, since /mcp itself always succeeds either way and
  // never forces discovery via a 401 challenge (that would break guest
  // access entirely, which is deliberately not required here).
  if (!userId) {
    registerLoggedTool('get_sign_in_url', {
      title: 'Check if the user can sign in to Needs',
      description: 'Call this if the user has (or might have) an existing Needs account and would prefer not to confirm every request by email. Returns how to connect their account so future quote requests and questions are sent instantly instead of needing an email confirmation click each time.',
      inputSchema: {},
    }, async () => {
      return text({
        explanation: 'This MCP server supports OAuth for users with an existing Needs account. Once connected, request_quote and ask_business stop requiring an email and are sent immediately as that user.',
        discovery_url: `${process.env.MODULE_BASE_URL || NODE_API}/.well-known/oauth-authorization-server`,
        instructions: 'Register a client via the registration_endpoint in discovery_url (RFC 7591 Dynamic Client Registration) if not already done, then direct the user to the authorization_endpoint with PKCE (S256) to sign in and approve. This is a one-time setup per client/device.',
      });
    });
  }

  registerLoggedTool('search_businesses', {
    title: 'Search businesses',
    description: 'Search Needs businesses and restaurants by name, category, or description. Returns matching slugs - use get_business to fetch full details for one.',
    inputSchema: {
      query: z.string().describe('Search text, e.g. "lawyer", "plumber", "italian restaurant"'),
      limit: z.number().int().min(1).max(25).optional().describe('Max results (default 10)'),
    },
  }, async ({ query, limit }) => {
    if (userId && !hasScope('search')) return scopeDeniedText('search businesses');
    const db = client.db('Need');
    const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const max = limit || 10;

    const [services, restaurants, nonprofits] = await Promise.all([
      db.collection('Services').find({
        $or: [{ businessName: rx }, { providerName: rx }, { category: rx }, { description: rx }],
      }).limit(max).toArray(),
      db.collection('Restaurants').find({
        $or: [{ name: rx }, { cuisine: rx }, { description: rx }],
      }).limit(max).toArray(),
      db.collection('Nonprofits').find({
        $or: [{ orgName: rx }, { orgType: rx }, { description: rx }],
      }).limit(max).toArray(),
    ]);

    const results = [
      ...services.map(s => ({
        slug: s.slug, type: 'service', name: s.businessName || s.providerName || '',
        category: s.category || '', area: s.serviceArea || s.businessAddress || '',
      })),
      ...restaurants.map(r => ({
        slug: r.slug, type: 'restaurant', name: r.name || '',
        category: r.cuisine || '', area: r.address || '',
      })),
      ...nonprofits.map(n => ({
        slug: n.slug, type: 'nonprofit', name: n.orgName || '',
        category: n.orgType || '', area: n.serviceArea || n.address || '',
      })),
    ].slice(0, max);

    return text({ query, count: results.length, results });
  });

  registerLoggedTool('ask_question', {
    title: 'Ask a business a question',
    description: 'Ask a general question about a business (hours, what they offer, policies, pricing, etc.) and get an answer grounded in their actual profile. If the question is really a request to be hired/quoted, use request_quote instead - this tool will say so if it detects that.',
    inputSchema: {
      slug: z.string().describe('The business slug'),
      question: z.string().describe('The question to ask'),
    },
  }, async ({ slug, question }) => {
    if (userId && !hasScope('search')) return scopeDeniedText('ask businesses general questions');
    const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, history: [] }),
    });
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Could not reach this business');
    if (data.intent === 'quote') {
      return text({
        note: 'This reads as a request to be hired or quoted, not a general question - use the request_quote tool instead.',
        reply: data.reply || null,
      });
    }
    return text({ reply: data.reply, cannotAnswer: !!data.cannotAnswer });
  });

  registerLoggedTool('request_quote', {
    title: 'Request a quote',
    description: userId
      ? 'Send a quote request to a business as the authenticated Needs user. Sent immediately - no email confirmation needed, since this request is already authorized. The result message already asks the user whether they want periodic status checks - relay it to them as written, do not shorten it away. If they say yes, set up a recurring task that calls check_my_requests(slug) about every hour until there is a response, then stop it.'
      : "Send a quote request to a business on a visitor's behalf. Without authentication, the visitor's email is required and will receive a confirmation link - nothing is sent to the business until they click it. This is a deliberate anti-spam/anti-impersonation step, not an extra round trip to skip. The result message already explains what happens next - relay it to them as written, do not shorten it away. Checking status later or reading the business's response happens entirely through the tracking link's own web page, not through this MCP connection - there is no polling tool for a guest request. If enableAiAccess is true (the default), that same tracking link becomes a live read/write chat for 48 hours once confirmed, with no key needed - ask the visitor first if they want that, and pass false if they say no. If the visitor has a Needs account, call get_sign_in_url first to skip the email step on future requests.",
    inputSchema: {
      slug: z.string().describe('The business slug'),
      description: z.string().describe('A description of what the visitor needs, in their own words'),
      name: userId
        ? z.string().optional().describe('Not needed - the request is sent as the authenticated user')
        : z.string().describe("The visitor's first name, so the business can address them by name"),
      email: userId
        ? z.string().email().optional().describe('Not needed - the request is sent as the authenticated user')
        : z.string().email().describe("The visitor's email address - they must confirm via a link sent there before this is sent to the business"),
      enableAiAccess: userId
        ? z.boolean().optional().describe('Not applicable for an authenticated user')
        : z.boolean().optional().describe('Whether this AI should get read/write access to the tracking link for 48 hours once the visitor confirms. Defaults to true - ask the visitor first and pass false if they decline.'),
    },
  }, async ({ slug, description, name, email, enableAiAccess }) => {
    const db = client.db('Need');
    const service = await db.collection('Services').findOne({ slug }, { projection: { _id: 1 } });
    if (!service) return errorText('Business not found (or is a restaurant, which does not take quote requests)');

    if (userId) {
      if (!hasScope('request')) return scopeDeniedText('create quote requests');
      const resp = await fetch(`${NODE_API}/authedRequestQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentBearerToken(server)}` },
        body: JSON.stringify({ businessId: service._id.toString(), description }),
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not send the quote request');
      return text({
        success: true,
        message: withMonitoringAsk(data.message, 'check_my_requests', `slug: "${slug}"`),
      });
    }

    if (!email) return errorText('email is required when not authenticated.');
    if (!name) return errorText('name is required when not authenticated.');
    const aiAccess = enableAiAccess !== false;
    const resp = await fetch(`${NODE_API}/requestQuote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: service._id.toString(), description, email, firstName: name, enableAiAccess: aiAccess }),
    });
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Could not send the quote request');
    return text({
      success: true, trackingKey: data.trackingKey,
      message: withTrackingLinkNote(data.message, data.trackingKey, aiAccess),
    });
  });

  registerLoggedTool('ask_business', {
    title: 'Send a question directly to a business',
    description: userId
      ? "Send a question to a business as the authenticated Needs user, when it could not be answered from its public profile. Sent immediately - the business's answer will be delivered through the normal Needs notification flow. The result message already asks the user whether they want periodic status checks - relay it to them as written, do not shorten it away. If they say yes, set up a recurring task that calls check_my_requests(slug) about every hour until there is a response, then stop it."
      : "Send a question to a business that could not be answered from its public profile. Without authentication, the visitor's email is required and will receive a confirmation link before the question is actually sent, and will later receive the business's answer by email. The result message already explains what happens next - relay it to them as written, do not shorten it away. Checking status later or reading the business's answer happens entirely through the tracking link's own web page, not through this MCP connection - there is no polling tool for a guest request. If enableAiAccess is true (the default), that same tracking link becomes a live read/write chat for 48 hours once confirmed, with no key needed - ask the visitor first if they want that, and pass false if they say no. If the visitor has a Needs account, call get_sign_in_url first to skip the email step on future requests.",
    inputSchema: {
      slug: z.string().describe('The business slug'),
      question: z.string().describe('The question to send'),
      name: userId
        ? z.string().optional().describe('Not needed - the question is sent as the authenticated user')
        : z.string().describe("The visitor's first name, so the business can address them by name"),
      email: userId
        ? z.string().email().optional().describe('Not needed - the question is sent as the authenticated user')
        : z.string().email().describe("The visitor's email address"),
      enableAiAccess: userId
        ? z.boolean().optional().describe('Not applicable for an authenticated user')
        : z.boolean().optional().describe('Whether this AI should get read/write access to the tracking link for 48 hours once the visitor confirms. Defaults to true - ask the visitor first and pass false if they decline.'),
    },
  }, async ({ slug, question, name, email, enableAiAccess }) => {
    if (userId) {
      if (!hasScope('request')) return scopeDeniedText('ask businesses questions');
      const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/authedAskBusiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentBearerToken(server)}` },
        body: JSON.stringify({ question }),
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not send the question');
      return text({
        success: true,
        message: withMonitoringAsk(data.message, 'check_my_requests', `slug: "${slug}"`),
      });
    }

    if (!email) return errorText('email is required when not authenticated.');
    if (!name) return errorText('name is required when not authenticated.');
    const aiAccess = enableAiAccess !== false;
    const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/askBusiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, email, firstName: name, enableAiAccess: aiAccess }),
    });
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Could not send the question');
    return text({
      success: true, trackingKey: data.trackingKey,
      message: withTrackingLinkNote(data.message, data.trackingKey, aiAccess),
    });
  });

  // Guest AI access/authorization (reading or acting on a confirmed guest
  // request beyond the bare status above) is deliberately not an MCP tool
  // at all anymore - a guest has no Needs account and no reason to have
  // connected this MCP server in the first place, so the only thing that
  // reliably works with whatever AI they actually use is a plain web page:
  // the tracking link (returned above, and content-free on its own)
  // becomes a live read/write chat on its own once confirmed, if AI access
  // was requested - no key, no second URL. See the "Guest AI
  // authorization" section of server/app.js for that whole flow.

  // Authenticated-only: no key needed here at all. The OAuth access token
  // already persists across conversations at the connector/account level
  // (unlike a guest, who has nothing durable), so this just works
  // automatically in any future call, same session or a brand new one.
  if (userId && hasScope('read')) {
    registerLoggedTool('check_my_requests', {
      title: 'Check my requests to a business',
      description: 'Check the status of the authenticated Needs user’s recent quote requests and questions to a specific business. No key or email needed - this is tied to the signed-in account and works the same in any future conversation.',
      inputSchema: { slug: z.string().describe('The business slug') },
    }, async ({ slug }) => {
      const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/myRequests`, {
        headers: { 'Authorization': `Bearer ${currentBearerToken(server)}` },
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not look up your requests for this business');
      return text(data);
    });
  }

  if (userId && hasScope('read')) {
    registerLoggedTool('read_my_conversations', {
      title: 'Read my requests, quotes, and conversations',
      description: "List the authenticated Needs user's own quote requests and questions across every business - status, price, proposed time(s), and the full message thread for each. No business slug needed - tied to the signed-in account.",
      inputSchema: {},
    }, async () => {
      const resp = await fetch(`${NODE_API}/myConversations`, {
        headers: { 'Authorization': `Bearer ${currentBearerToken(server)}` },
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not read your conversations');
      return text(data);
    });
  }

  if (userId && hasScope('respond')) {
    registerLoggedTool('respond_to_business', {
      title: 'Send a message to a business about my quote',
      description: "Send a free-form message on an existing quote conversation, as the authenticated Needs user - e.g. answering a question the business asked, or asking one of your own. Not for accepting a quote, confirming a time, or canceling an appointment - those are separate tools that always need the user's own separate confirmation first.",
      inputSchema: {
        quoteId: z.string().describe('The quoteId from read_my_conversations'),
        text: z.string().describe('The message to send'),
      },
    }, async ({ quoteId, text: messageText }) => {
      const resp = await fetch(`${NODE_API}/respondAsCustomer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentBearerToken(server)}` },
        body: JSON.stringify({ quoteId, text: messageText }),
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not send the message');
      return text({ success: true });
    });
  }

  // These three are consequential (money and/or schedule commitments), so
  // none of them finalize anything directly - each just asks the server to
  // email *the account's own* address a confirm link, same pause-then-
  // email-confirm pattern the guest tracking link already uses for these
  // same actions. The AI being OAuth-authorized only proves the account
  // trusts it to act in general, not that the user is watching this
  // specific decision right now - see /mcpRequestConsequentialAction.
  if (userId && hasScope('schedule')) {
    const requestConsequentialAction = async (quoteId, actionType) => {
      const resp = await fetch(`${NODE_API}/mcpRequestConsequentialAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentBearerToken(server)}` },
        body: JSON.stringify({ quoteId, actionType }),
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not start this action');
      return text({ success: true, message: data.message });
    };

    registerLoggedTool('accept_quote', {
      title: 'Accept a quote',
      description: "Accept a quote from a business, as the authenticated Needs user. This is consequential - nothing is finalized here. The user's own email gets a confirmation link, and this only takes effect once they click it themselves. Relay the returned message to them as written, do not shorten it away.",
      inputSchema: { quoteId: z.string().describe('The quoteId from read_my_conversations') },
    }, async ({ quoteId }) => requestConsequentialAction(quoteId, 'accept_quote'));

    registerLoggedTool('confirm_appointment_time', {
      title: 'Confirm a proposed appointment time',
      description: "Confirm the appointment time a business proposed, as the authenticated Needs user. This is consequential - nothing is finalized here. The user's own email gets a confirmation link (showing the actual proposed time(s) to pick from if there's more than one), and this only takes effect once they click it themselves. Relay the returned message to them as written, do not shorten it away.",
      inputSchema: { quoteId: z.string().describe('The quoteId from read_my_conversations') },
    }, async ({ quoteId }) => requestConsequentialAction(quoteId, 'confirm_appointment_time'));

    registerLoggedTool('cancel_appointment', {
      title: 'Cancel a confirmed appointment',
      description: "Cancel an already-confirmed appointment, as the authenticated Needs user. This is consequential and cannot be undone - nothing is finalized here. The user's own email gets a confirmation link, and this only takes effect once they click it themselves. Relay the returned message to them as written, do not shorten it away.",
      inputSchema: { quoteId: z.string().describe('The quoteId from read_my_conversations') },
    }, async ({ quoteId }) => requestConsequentialAction(quoteId, 'cancel_appointment'));
  }

  // Offered only once this connection's last confirmation is 30+ days old
  // (see computeEffectiveScopes below) - at that point every scope but
  // 'search' is withheld regardless of what was originally granted, so
  // this is the one tool still available to get back to full access.
  if (userId && needsReverification) {
    registerLoggedTool('request_reverification', {
      title: 'Re-verify this connection',
      description: "This connection hasn't been re-confirmed by the user in over 30 days, so reading or acting on private account data (conversations, responses, scheduling) is temporarily unavailable until they confirm it's still them - this is routine, not a sign anything is wrong. Call this to send that confirmation link to the user's own email. Tell the user you're doing this and that nothing else will work until they click it.",
      inputSchema: {},
    }, async () => {
      const resp = await fetch(`${NODE_API}/mcpRequestReverification`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentBearerToken(server)}` },
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not send a re-verification link');
      return text({ success: true, message: data.message });
    });
  }

  return server;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Shared by both auth paths below so a stale grant degrades identically
// regardless of which endpoint resolved it. 'search' stays available even
// when stale - it touches no private data - everything else needs a fresh
// confirmation first.
function computeEffectiveScopes(grant) {
  const scopes = grant.scopes || [];
  const stale = !grant.lastVerifiedAt || (Date.now() - new Date(grant.lastVerifiedAt).getTime()) > THIRTY_DAYS_MS;
  return { scopes: stale ? scopes.filter(s => s === 'search') : scopes, needsReverification: stale };
}

// Validates the incoming Bearer token (same JWT_SECRET/shape /login issues)
// and returns the userId it represents, or null if there is none/it is
// invalid/expired - an invalid token degrades to guest access rather than
// rejecting the request, since every tool here is safe to use as a guest.
// Best-effort scope resolution: only looked up when the token carries a
// clientId (every token minted since OAuthGrants existed); scopes stays
// null (fully permissive, same as before scopes existed) if that lookup
// doesn't resolve - this endpoint's guest-first behavior never gets
// *stricter* because of scopes, only /mcp/account does.
async function getAuthedUserId(req, client) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return { userId: null, token: null, scopes: null };
  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { userId: null, token: null, scopes: null };
  }
  if (!payload.clientId) return { userId: payload.userId, token, scopes: null };
  const grant = await client.db('Need').collection('OAuthGrants')
    .findOne({ userId: payload.userId, client_id: payload.clientId })
    .catch(() => null);
  // A revoked or suspended grant degrades this request fully back to guest
  // (not to "authenticated with zero scopes") - this endpoint's whole point
  // is that it never gets *stricter* than guest, so a dead connection
  // shouldn't leave it in some half-authenticated state either.
  if (!grant || grant.revoked || grant.suspended) return { userId: null, token: null, scopes: null };
  return { userId: payload.userId, token, scopes: computeEffectiveScopes(grant).scopes };
}

// Validates the incoming Bearer token for /mcp/account, the dedicated
// "I specifically want my real account" endpoint - unlike getAuthedUserId
// above, this NEVER degrades to guest access. Missing, malformed, expired,
// wrong-scope, or belonging to a since-revoked grant (Account -> Connected
// AI -> Disconnect, or a global Sign Out of All Devices via tokenVersion)
// all reject outright. Also the one place that resolves which Needs account
// a call acts as - every tool handler must derive userId from here, never
// from an argument the AI itself supplied.
async function getStrictAuthedUserId(req, client) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return { ok: false };
  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { ok: false };
  }
  if (payload.scope !== 'mcp' || !payload.clientId || !ObjectId.isValid(payload.userId)) return { ok: false };

  const db = client.db('Need');
  const user = await db.collection('Users').findOne(
    { _id: new ObjectId(payload.userId) }, { projection: { tokenVersion: 1 } }
  );
  if (!user || (user.tokenVersion || 0) !== (payload.tokenVersion || 0)) return { ok: false };

  const grant = await db.collection('OAuthGrants').findOne({ userId: payload.userId, client_id: payload.clientId });
  if (!grant || grant.revoked || grant.suspended) return { ok: false };

  const { scopes, needsReverification } = computeEffectiveScopes(grant);
  return { ok: true, userId: payload.userId, clientId: payload.clientId, token, scopes, needsReverification };
}

function sendAuthRequired(req, res, NODE_API) {
  res.set('WWW-Authenticate', `Bearer realm="needs", resource_metadata="${NODE_API}/.well-known/oauth-protected-resource"`);
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Authentication required, expired, or revoked.' }, id: null });
}

// Stateless by design (sessionIdGenerator: undefined, a fresh server+transport
// per request): simpler and safer for a multi-instance deployment than
// session affinity, and every tool call here is independent anyway - nothing
// needs a conversation to persist across calls.
function registerMcpRoutes(app, { client, NODE_API, mcpAccountLimiter }) {
  app.post('/mcp', async (req, res) => {
    try {
      const { userId, token, scopes } = await getAuthedUserId(req, client);
      const server = buildServer({ client, NODE_API, userId, scopes });
      // Stashed so the authed-tool handlers above can forward the same
      // token to the authedRequestQuote/authedAskBusiness calls they make.
      server._bearerToken = token;
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('❌ /mcp error:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  // No persistent sessions, so GET (resumable streams) and DELETE (session
  // teardown) are not meaningful here.
  app.get('/mcp', (req, res) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  });
  app.delete('/mcp', (req, res) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  });

  // POST /mcp/account - same tools as /mcp, but this is the endpoint a user
  // reaches from Account -> Connected AI specifically to connect their real
  // account, so it never silently falls back to guest: no token, an
  // invalid/expired one, or one tied to a since-revoked/suspended grant all
  // get a hard 401 instead of quietly degrading to anonymous access.
  // mcpAccountLimiter (app.js) throttles per-connection and escalates to a
  // full suspend after repeated trips - see its own comment there.
  app.post('/mcp/account', mcpAccountLimiter, async (req, res) => {
    try {
      const auth = await getStrictAuthedUserId(req, client);
      if (!auth.ok) return sendAuthRequired(req, res, NODE_API);

      const server = buildServer({
        client, NODE_API, userId: auth.userId, clientId: auth.clientId,
        scopes: auth.scopes, needsReverification: auth.needsReverification,
      });
      server._bearerToken = auth.token;
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('❌ /mcp/account error:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });
  app.get('/mcp/account', (req, res) => sendAuthRequired(req, res, NODE_API));
  app.delete('/mcp/account', (req, res) => sendAuthRequired(req, res, NODE_API));
}

function currentBearerToken(server) {
  return server._bearerToken;
}

module.exports = { registerMcpRoutes };

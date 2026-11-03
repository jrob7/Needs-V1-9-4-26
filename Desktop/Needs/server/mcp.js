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

function buildServer({ client, NODE_API, userId }) {
  const server = new McpServer({ name: 'needs-module', version: '1.0.0' });

  const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
  const errorText = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

  server.registerTool('get_business', {
    title: 'Get business profile',
    description: 'Fetch a Needs business or restaurant profile by its slug: name, category, services, pricing (with a disclaimer that it is an estimate, not a binding quote), hours/availability, and contact info.',
    inputSchema: { slug: z.string().describe('The business slug, e.g. "example-technology-business-law-firm"') },
  }, async ({ slug }) => {
    const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/profile`);
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Business not found');
    return text(data);
  });

  server.registerTool('search_businesses', {
    title: 'Search businesses',
    description: 'Search Needs businesses and restaurants by name, category, or description. Returns matching slugs - use get_business to fetch full details for one.',
    inputSchema: {
      query: z.string().describe('Search text, e.g. "lawyer", "plumber", "italian restaurant"'),
      limit: z.number().int().min(1).max(25).optional().describe('Max results (default 10)'),
    },
  }, async ({ query, limit }) => {
    const db = client.db('Need');
    const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const max = limit || 10;

    const [services, restaurants] = await Promise.all([
      db.collection('Services').find({
        $or: [{ businessName: rx }, { providerName: rx }, { category: rx }, { description: rx }],
      }).limit(max).toArray(),
      db.collection('Restaurants').find({
        $or: [{ name: rx }, { cuisine: rx }, { description: rx }],
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
    ].slice(0, max);

    return text({ query, count: results.length, results });
  });

  server.registerTool('ask_question', {
    title: 'Ask a business a question',
    description: 'Ask a general question about a business (hours, what they offer, policies, pricing, etc.) and get an answer grounded in their actual profile. If the question is really a request to be hired/quoted, use request_quote instead - this tool will say so if it detects that.',
    inputSchema: {
      slug: z.string().describe('The business slug'),
      question: z.string().describe('The question to ask'),
    },
  }, async ({ slug, question }) => {
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

  server.registerTool('request_quote', {
    title: 'Request a quote',
    description: userId
      ? 'Send a quote request to a business as the authenticated Needs user. Sent immediately - no email confirmation needed, since this request is already authorized.'
      : "Send a quote request to a business on a visitor's behalf. Without authentication, the visitor's email is required and will receive a confirmation link - nothing is sent to the business until they click it. This is a deliberate anti-spam/anti-impersonation step, not an extra round trip to skip.",
    inputSchema: {
      slug: z.string().describe('The business slug'),
      description: z.string().describe('A description of what the visitor needs, in their own words'),
      email: userId
        ? z.string().email().optional().describe('Not needed - the request is sent as the authenticated user')
        : z.string().email().describe("The visitor's email address - they must confirm via a link sent there before this is sent to the business"),
    },
  }, async ({ slug, description, email }) => {
    const db = client.db('Need');
    const service = await db.collection('Services').findOne({ slug }, { projection: { _id: 1 } });
    if (!service) return errorText('Business not found (or is a restaurant, which does not take quote requests)');

    if (userId) {
      const resp = await fetch(`${NODE_API}/authedRequestQuote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentBearerToken(server)}` },
        body: JSON.stringify({ businessId: service._id.toString(), description }),
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not send the quote request');
      return text({ success: true, message: data.message });
    }

    if (!email) return errorText('email is required when not authenticated.');
    const resp = await fetch(`${NODE_API}/requestQuote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: service._id.toString(), description, email }),
    });
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Could not send the quote request');
    return text({ success: true, message: data.message });
  });

  server.registerTool('ask_business', {
    title: 'Send a question directly to a business',
    description: userId
      ? "Send a question to a business as the authenticated Needs user, when it could not be answered from its public profile. Sent immediately - the business's answer will be delivered through the normal Needs notification flow."
      : "Send a question to a business that could not be answered from its public profile. Without authentication, the visitor's email is required and will receive a confirmation link before the question is actually sent, and will later receive the business's answer by email.",
    inputSchema: {
      slug: z.string().describe('The business slug'),
      question: z.string().describe('The question to send'),
      email: userId
        ? z.string().email().optional().describe('Not needed - the question is sent as the authenticated user')
        : z.string().email().describe("The visitor's email address"),
    },
  }, async ({ slug, question, email }) => {
    if (userId) {
      const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/authedAskBusiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentBearerToken(server)}` },
        body: JSON.stringify({ question }),
      });
      const data = await resp.json();
      if (!resp.ok) return errorText(data.error || 'Could not send the question');
      return text({ success: true, message: data.message });
    }

    if (!email) return errorText('email is required when not authenticated.');
    const resp = await fetch(`${NODE_API}/m/${encodeURIComponent(slug)}/askBusiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, email }),
    });
    const data = await resp.json();
    if (!resp.ok) return errorText(data.error || 'Could not send the question');
    return text({ success: true, message: data.message });
  });

  return server;
}

// Validates the incoming Bearer token (same JWT_SECRET/shape /login issues)
// and returns the userId it represents, or null if there is none/it is
// invalid/expired - an invalid token degrades to guest access rather than
// rejecting the request, since every tool here is safe to use as a guest.
function getAuthedUserId(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return { userId: null, token: null };
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: payload.userId, token };
  } catch {
    return { userId: null, token: null };
  }
}

// Stateless by design (sessionIdGenerator: undefined, a fresh server+transport
// per request): simpler and safer for a multi-instance deployment than
// session affinity, and every tool call here is independent anyway - nothing
// needs a conversation to persist across calls.
function registerMcpRoutes(app, { client, NODE_API }) {
  app.post('/mcp', async (req, res) => {
    try {
      const { userId, token } = getAuthedUserId(req);
      const server = buildServer({ client, NODE_API, userId });
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
}

function currentBearerToken(server) {
  return server._bearerToken;
}

module.exports = { registerMcpRoutes };

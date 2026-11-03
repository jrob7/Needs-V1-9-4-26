// server/mcp.js
//
// Public, unauthenticated MCP server exposing the same operations the
// module page chat widget already performs, as directly-callable tools
// instead of something an agent has to simulate by typing into a chat box.
//
// Scope decision: no OAuth yet. Every tool here either only reads already-
// public data, or (for request_quote / ask_business) goes through the exact
// same email double opt-in guardrail the module page's guest flow already
// uses - nothing here can take an action without a human confirming by
// email first. An authenticated tool surface (acting as a real logged-in
// Needs user, skipping that confirmation) is a deliberate follow-up once
// OAuth 2.1 + Dynamic Client Registration is actually built, not bundled in
// here.
//
// Every tool is a thin wrapper over an existing HTTP endpoint or a direct,
// read-only DB query - nothing here re-implements business logic that
// already exists elsewhere, so this can't drift out of sync with the
// module page itself.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

function buildServer({ client, NODE_API }) {
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
    description: "Send a quote request to a business on a visitor's behalf. The visitor's email is required and will receive a confirmation link - nothing is sent to the business until they click it. This is a deliberate anti-spam/anti-impersonation step, not an extra API round trip to skip.",
    inputSchema: {
      slug: z.string().describe('The business slug'),
      description: z.string().describe("A description of what the visitor needs, in their own words"),
      email: z.string().email().describe("The visitor's email address - they must confirm via a link sent there before this is sent to the business"),
    },
  }, async ({ slug, description, email }) => {
    const db = client.db('Need');
    const service = await db.collection('Services').findOne({ slug }, { projection: { _id: 1 } });
    if (!service) return errorText('Business not found (or is a restaurant, which does not take quote requests)');

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
    description: "Send a question to a business that could not be answered from its public profile. The visitor's email is required and will receive a confirmation link before the question is actually sent, and will later receive the business's answer by email.",
    inputSchema: {
      slug: z.string().describe('The business slug'),
      question: z.string().describe('The question to send'),
      email: z.string().email().describe("The visitor's email address"),
    },
  }, async ({ slug, question, email }) => {
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

// Stateless by design (sessionIdGenerator: undefined, a fresh server+transport
// per request): simpler and safer for a multi-instance deployment than
// session affinity, and every tool call here is independent anyway - nothing
// needs a conversation to persist across calls.
function registerMcpRoutes(app, { client, NODE_API }) {
  app.post('/mcp', async (req, res) => {
    try {
      const server = buildServer({ client, NODE_API });
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

module.exports = { registerMcpRoutes };

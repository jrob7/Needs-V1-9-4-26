// server/googleCalendar.js
// Google Calendar OAuth + event helpers.
// Credentials come from env vars set in Railway:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
// GOOGLE_REDIRECT_URI must match exactly what's registered in Google Cloud Console,
// e.g. https://your-node-server.up.railway.app/auth/google/calendar/callback

const { google } = require('googleapis');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;

// Scopes: read/write calendar events + free/busy queries
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// ── Build an OAuth2 client ────────────────────────────────────────────────────
function buildOAuth2Client(tokens = null) {
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  if (tokens) client.setCredentials(tokens);
  return client;
}

// ── URL the user visits to grant access ──────────────────────────────────────
function getAuthUrl(statePayload) {
  const client = buildOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',   // get refresh_token
    prompt:      'consent',   // force refresh_token even if already granted
    scope:       SCOPES,
    state:       Buffer.from(JSON.stringify(statePayload)).toString('base64'),
  });
}

// ── Exchange code → tokens ────────────────────────────────────────────────────
async function exchangeCode(code) {
  const client = buildOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, token_type, scope }
}

// ── Build an authenticated client from stored tokens, refreshing if needed ───
async function authedClient(storedTokens) {
  const client = buildOAuth2Client(storedTokens);
  // googleapis refreshes automatically when access_token is expired if
  // refresh_token is present, but we listen to get the new token to save back.
  return client;
}

// ── Create a calendar event for a confirmed appointment ───────────────────────
// appointment: { needText, businessName, date, time, address, price }
// tokens: the tokens stored on the user doc
// Returns the created event object (or null on failure).
async function createCalendarEvent(tokens, appointment) {
  try {
    const auth     = await authedClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth });

    const { date, time, needText, businessName, address, price } = appointment;

    // Parse the stored date/time strings into an ISO datetime
    const start = parseToISO(date, time);
    if (!start) return null;
    const end   = new Date(start.getTime() + 60 * 60 * 1000); // default 1-hour slot

    const event = {
      summary:     `${businessName || 'Appointment'}: ${(needText || '').slice(0, 60)}`,
      location:    address || '',
      description: [
        needText  ? `Service: ${needText}` : '',
        price     ? `Price: ${price}`      : '',
      ].filter(Boolean).join('\n'),
      start: { dateTime: start.toISOString(), timeZone: 'America/Los_Angeles' },
      end:   { dateTime: end.toISOString(),   timeZone: 'America/Los_Angeles' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 120 }, // 2-hour reminder
          { method: 'email', minutes: 60  },
        ],
      },
    };

    const res = await calendar.events.insert({ calendarId: 'primary', resource: event });
    return res.data; // { id, htmlLink, ... }
  } catch (err) {
    console.error('createCalendarEvent error:', err?.message);
    return null;
  }
}

// ── Delete a calendar event (on appointment cancellation) ─────────────────────
async function deleteCalendarEvent(tokens, eventId) {
  try {
    const auth     = await authedClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({ calendarId: 'primary', eventId });
    return true;
  } catch (err) {
    console.error('deleteCalendarEvent error:', err?.message);
    return false;
  }
}

// ── Get free/busy slots for a given date range ────────────────────────────────
// Returns array of busy intervals: [{ start: Date, end: Date }]
async function getBusySlots(tokens, dateStart, dateEnd) {
  try {
    const auth     = await authedClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.freebusy.query({
      resource: {
        timeMin: dateStart.toISOString(),
        timeMax: dateEnd.toISOString(),
        items:   [{ id: 'primary' }],
      },
    });
    const busy = res.data.calendars?.primary?.busy || [];
    return busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch (err) {
    console.error('getBusySlots error:', err?.message);
    return [];
  }
}

// ── Build a list of available 1-hour slots on a given date ───────────────────
// workStart/workEnd: hour numbers, e.g. 8 and 17 for 8am–5pm
async function getAvailableSlots(tokens, date, workStart = 8, workEnd = 17) {
  const dayStart = new Date(date);
  dayStart.setHours(workStart, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(workEnd, 0, 0, 0);

  const busy = await getBusySlots(tokens, dayStart, dayEnd);

  const slots = [];
  let cursor = new Date(dayStart);
  while (cursor < dayEnd) {
    const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
    if (slotEnd > dayEnd) break;
    const overlap = busy.some(b => cursor < b.end && slotEnd > b.start);
    if (!overlap) {
      slots.push({
        start: cursor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        end:   slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      });
    }
    cursor = slotEnd;
  }
  return slots;
}

// ── Parse "Fri, Jul 10, 2026" + "11:00 AM" → Date ───────────────────────────
const MONTH_IDX = {
  Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
  Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,
};
function parseToISO(dateStr, timeStr) {
  try {
    const clean = (dateStr || '').replace(/^\w+,\s*/, '').trim();
    const dp = clean.match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (!dp || MONTH_IDX[dp[1]] === undefined) return null;
    const d = new Date(parseInt(dp[3],10), MONTH_IDX[dp[1]], parseInt(dp[2],10));
    if (isNaN(d.getTime())) return null;
    if (timeStr && timeStr !== 'As Agreed') {
      const t  = timeStr.trim().replace(/[^\S ]/g, ' ');
      const tp = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (tp) {
        let h = parseInt(tp[1],10);
        const m = parseInt(tp[2],10);
        const ampm = (tp[3]||'').toUpperCase();
        if (ampm==='PM'&&h!==12) h+=12;
        if (ampm==='AM'&&h===12) h=0;
        d.setHours(h,m,0,0);
      }
    }
    return d;
  } catch { return null; }
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  authedClient,
  createCalendarEvent,
  deleteCalendarEvent,
  getBusySlots,
  getAvailableSlots,
};

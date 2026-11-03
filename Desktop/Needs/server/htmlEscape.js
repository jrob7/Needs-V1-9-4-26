// server/htmlEscape.js
// Minimal HTML-escaping for interpolating untrusted strings into
// server-rendered pages. Covers the characters that matter for breaking out
// of text content or a double-quoted attribute value.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };

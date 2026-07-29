// Pemanggil webhook bersama untuk command dan pesan masuk. Keduanya memakai
// kontrak yang sama: secret melalui Bearer, timeout dengan AbortController, dan
// balasan berupa string biasa atau JSON dengan field `reply`/`message`.

async function postWebhook({
  url,
  payload,
  secret = '',
  secretHeader = 'x-webhook-secret',
  timeoutMs = 10000,
  fetchImpl = global.fetch,
  label = 'command',
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error(`Runtime Node.js tidak menyediakan fetch untuk ${label} webhook`);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const headers = { 'content-type': 'application/json' };

  if (secret) {
    headers.authorization = `Bearer ${secret}`;
    headers[secretHeader] = secret;
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Webhook ${label} merespons HTTP ${response.status}`);
    }

    const body = await response.text();
    if (!body.trim()) return null;

    const contentType = response.headers?.get?.('content-type') || '';
    if (!contentType.includes('application/json')) return body.trim();

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`Webhook ${label} mengirim JSON yang tidak valid`);
    }

    if (typeof parsed === 'string') return parsed.trim() || null;
    if (parsed === null || typeof parsed !== 'object') return null;

    const reply = parsed.reply ?? parsed.message ?? null;
    if (reply !== null && typeof reply !== 'string') {
      throw new Error('Field reply dari webhook harus berupa string atau null');
    }
    return reply?.trim() || null;
  } catch (error) {
    if (timedOut) {
      throw new Error(`Webhook ${label} tidak merespons dalam ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { postWebhook };

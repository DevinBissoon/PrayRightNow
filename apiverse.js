// api/verse.js  — Vercel Serverless Function (Node)
const fetch = global.fetch;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });

    // read ?feeling=... from the URL
    let feeling = '';
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      feeling = url.searchParams.get('feeling') || '';
    } catch {}

    // if POST, allow JSON body { feeling: "..." }
    if (!feeling && req.method === 'POST') {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw) feeling = (JSON.parse(raw).feeling || '').trim();
      } catch {}
    }

    if (!feeling.trim()) return res.status(400).json({ error: 'Missing "feeling"' });

    const prompt =
      `Based on the feeling: "${feeling}", provide ONE uplifting but less-common Bible verse. ` +
      `Respond ONLY as strict JSON: {"text":"<full verse text>","reference":"Book Chapter:Verse"}.`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = result?.error?.message || `Gemini error ${resp.status}`;
      return res.status(resp.status).json({ error: msg });
    }

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const raw = parts.map(p => p?.text).filter(Boolean).join('\n').trim();

    let verse = null;
    try { verse = JSON.parse(raw); } catch {}
    if (!verse || !verse.text || !verse.reference) {
      const m = raw && raw.match(/\{[\s\S]*\}/);
      if (m) { try { verse = JSON.parse(m[0]); } catch {} }
    }

    if (!verse || !verse.text) {
      if (raw) verse = { text: raw, reference: 'Reference unavailable' };
      else return res.status(502).json({ error: 'Empty response from model' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(verse);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

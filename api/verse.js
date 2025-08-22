// api/verse.js — Vercel serverless function
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });

    // get ?feeling=... from the URL
    let feeling = '';
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      feeling = (url.searchParams.get('feeling') || '').trim();
    } catch {}

    if (!feeling) return res.status(400).json({ error: 'Missing "feeling"' });

    const prompt =
      `Based on the feeling: "${feeling}", provide ONE uplifting but less-common Bible verse. ` +
      `Respond ONLY as JSON: {"text":"<full verse text>","reference":"Book Chapter:Verse"}.`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: j?.error?.message || 'Gemini error' });

    const parts = j?.candidates?.[0]?.content?.parts || [];
    const raw = parts.map(p => p?.text).filter(Boolean).join('\n').trim();

    let verse;
    try { verse = JSON.parse(raw); } catch {}
    if (!verse || !verse.text || !verse.reference) {
      return res.status(502).json({ error: 'Bad model response', raw });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(verse);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

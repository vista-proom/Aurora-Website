let cachedApp = null;
let loadError = null;

export default async function handler(req, res) {
  if (!cachedApp && !loadError) {
    try {
      const mod = await import('../server/server.js');
      cachedApp = mod.default;
    } catch (err) {
      loadError = err;
      console.error('[Vercel Bootstrap Error]:', err);
    }
  }

  if (loadError) {
    res.status(500).json({
      success: false,
      error: 'Server bootstrap failed: ' + (loadError.message || String(loadError))
    });
    return;
  }

  return cachedApp(req, res);
}

// api/cron/scrape.js
const { run } = require('../../src/scraper/scheduler');

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  try {
    const result = await run();
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

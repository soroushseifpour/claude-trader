// Fetch current stock price from Yahoo Finance
// Uses a CORS proxy to handle browser restrictions
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const CORS_PROXY = 'https://corsproxy.io/?url=';

export async function fetchStockPrice(ticker) {
  const url = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;

  try {
    const res = await fetch(proxiedUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No result in Yahoo Finance response');

    const meta = result.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose;

    if (!price) throw new Error('No price found in response');

    return {
      ticker,
      price: parseFloat(price.toFixed(2)),
      currency: meta?.currency || 'USD',
      marketState: meta?.marketState || 'UNKNOWN',
      name: meta?.shortName || ticker,
    };
  } catch (err) {
    // Fallback: try without CORS proxy (may work in some environments)
    try {
      const res2 = await fetch(url);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const data2 = await res2.json();
      const result2 = data2?.chart?.result?.[0];
      const meta2 = result2?.meta;
      const price2 = meta2?.regularMarketPrice || meta2?.previousClose;
      if (!price2) throw new Error('No price');
      return {
        ticker,
        price: parseFloat(price2.toFixed(2)),
        currency: meta2?.currency || 'USD',
        marketState: meta2?.marketState || 'UNKNOWN',
        name: meta2?.shortName || ticker,
      };
    } catch {
      throw new Error(`Failed to fetch price for ${ticker}: ${err.message}`);
    }
  }
}

export async function fetchMultiplePrices(tickers) {
  const results = await Promise.allSettled(tickers.map(fetchStockPrice));
  const prices = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      prices[tickers[i]] = r.value;
    } else {
      prices[tickers[i]] = null;
    }
  });
  return prices;
}

// Convert USD price to CAD (approximate, using a fixed rate updated periodically)
// Claude will work in USD prices but display in CAD
// We use a conversion factor for display purposes
export const USD_TO_CAD = 1.36; // approximate rate, user can see this is CAD

export function toCAD(usdPrice) {
  return parseFloat((usdPrice * USD_TO_CAD).toFixed(2));
}

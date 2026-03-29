/**
 * trade.mjs — GitHub Actions trading cycle script
 *
 * Reads data/portfolio.json, calls Anthropic API (claude-sonnet-4-6) with
 * web_search tool, executes the decision, updates portfolio state, and
 * writes back to data/portfolio.json. Generates a daily report at the
 * market-close cycle (3:30 PM ET = 19:30 UTC) and appends to data/reports.json.
 *
 * Usage: node scripts/trade.mjs
 * Requires env: ANTHROPIC_API_KEY
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORTFOLIO_PATH = path.join(ROOT, 'data', 'portfolio.json');
const REPORTS_PATH = path.join(ROOT, 'data', 'reports.json');

// ── Constants ─────────────────────────────────────────────────────────────────
const USD_TO_CAD = 1.36;

const DEFAULT_PORTFOLIO = {
  cash: 500,
  startingCapital: 500,
  currency: 'CAD',
  positions: {},
  totalValue: 500,
  trades: [],
  log: [],
  equityCurve: [{ time: 'start', value: 500 }],
  lastUpdated: null,
  isBankrupt: false,
  dayStartValue: 500,
  dayStartDate: null,
};

const SYSTEM_PROMPT = `You are an autonomous stock investor managing a $500 CAD portfolio. Your goal is to grow the portfolio over weeks and months, not minutes. You are NOT a day trader. Each session, you receive the current portfolio state and market conditions. You should:
- Research fundamentals, news, and trends before acting
- Hold positions for days or weeks when appropriate — do NOT sell just because you can
- Only trade when there is a clear reason to buy or sell
- It is perfectly fine to HOLD everything and do nothing
- Avoid overtrading — quality over quantity
- Track your reasoning and learn from past decisions

Rules:
- For BUY: ensure you have enough cash (shares * price <= available cash)
- For SELL: you must own shares of the ticker
- For HOLD: ticker can be any symbol you researched or null, shares=0, price=0
- Search for current prices and news before making any decision
- Only trade stocks listed on Canadian (TSX, TSX-V) or US (NYSE, NASDAQ) exchanges
- For Canadian stocks use the .TO suffix (e.g. SHOP.TO, RY.TO, TD.TO, CNR.TO)
- For US stocks use the plain symbol (e.g. AAPL, MSFT, NVDA)
- Prices should be in USD for US stocks and CAD for Canadian stocks (we handle conversion on our end)
- Think about fundamentals, long-term trends, and news catalysts
- Keep positions reasonable - don't bet everything on one stock
- Prefer well-known Canadian and US companies you have strong conviction in

Always respond with valid JSON: {"action": "BUY"|"SELL"|"HOLD", "ticker": "SYMBOL or null", "shares": number or 0, "price": number or 0, "reasoning": "your explanation", "hold_duration": "expected hold time e.g. 3-5 days, 2 weeks"}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function calcPortfolioValue(portfolio) {
  const positionValue = Object.values(portfolio.positions).reduce((sum, pos) => {
    return sum + pos.shares * pos.currentPrice * USD_TO_CAD;
  }, 0);
  return portfolio.cash + positionValue;
}

function getTodayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function readPortfolio() {
  if (!existsSync(PORTFOLIO_PATH)) {
    log('No portfolio.json found — starting fresh with $500 CAD');
    return { ...DEFAULT_PORTFOLIO };
  }
  try {
    const raw = readFileSync(PORTFOLIO_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Ensure all required fields exist (forward-compat)
    return { ...DEFAULT_PORTFOLIO, ...parsed };
  } catch (err) {
    log(`Failed to read portfolio.json: ${err.message} — starting fresh`);
    return { ...DEFAULT_PORTFOLIO };
  }
}

function readReports() {
  if (!existsSync(REPORTS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(REPORTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writePortfolio(portfolio) {
  writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2), 'utf8');
  log('Wrote portfolio.json');
}

function writeReports(reports) {
  writeFileSync(REPORTS_PATH, JSON.stringify(reports, null, 2), 'utf8');
  log('Wrote reports.json');
}

// ── Yahoo Finance price fetch ─────────────────────────────────────────────────

async function fetchStockPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${ticker}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No meta in Yahoo Finance response for ${ticker}`);
  const price = meta.regularMarketPrice ?? meta.previousClose;
  if (!price) throw new Error(`No price in Yahoo Finance response for ${ticker}`);
  return price;
}

// ── JSON extraction from Claude response ──────────────────────────────────────

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}

  const jsonMatch = text.match(/\{[^{}]*"action"[^{}]*\}/s);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch {} }

  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) { try { return JSON.parse(codeBlockMatch[1]); } catch {} }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }

  return null;
}

// ── Build portfolio prompt ────────────────────────────────────────────────────

function buildPortfolioPrompt(portfolio) {
  const { cash, startingCapital, positions, totalValue, trades } = portfolio;
  const pnl = totalValue - startingCapital;
  const pnlPct = ((pnl / startingCapital) * 100).toFixed(2);

  let positionsText = 'No open positions.';
  if (Object.keys(positions).length > 0) {
    positionsText = Object.entries(positions)
      .map(([ticker, pos]) => {
        const unrealizedPnl = (pos.currentPrice - pos.avgCost) * pos.shares;
        return `  ${ticker}: ${pos.shares} shares @ avg $${pos.avgCost.toFixed(2)} USD, current ~$${pos.currentPrice.toFixed(2)} USD, unrealized P&L: $${unrealizedPnl.toFixed(2)}`;
      })
      .join('\n');
  }

  const recentTrades = Array.isArray(trades) ? trades : [];
  const recentTradesText =
    recentTrades.length > 0
      ? recentTrades
          .slice(-5)
          .map(
            (t) =>
              `  ${t.timestamp} - ${t.action} ${t.shares} ${t.ticker} @ $${t.price} (${t.outcome || 'OPEN'})`
          )
          .join('\n')
      : 'No recent trades.';

  return `Current Portfolio State:
- Total Value: $${totalValue.toFixed(2)} CAD
- Cash Available: $${cash.toFixed(2)} CAD
- Starting Capital: $${startingCapital.toFixed(2)} CAD
- Total P&L: $${pnl.toFixed(2)} CAD (${pnlPct}%)

Open Positions:
${positionsText}

Recent Trades:
${recentTradesText}

Instructions:
1. Search for current market news and price data for promising stocks
2. Consider your current positions - should you hold, sell, or add?
3. Look for new opportunities if you have cash available
4. Return your decision as JSON

Note: Cash is in CAD. Stock prices are in USD. Use approximate 1 USD = 1.36 CAD for position sizing.
Available cash in USD equivalent: ~$${(cash / 1.36).toFixed(2)} USD

Make your decision now.`;
}

// ── Claude trading cycle ──────────────────────────────────────────────────────

async function runTradingCycle(portfolio) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = buildPortfolioPrompt(portfolio);
  log('Calling Claude (claude-sonnet-4-6) with web_search tool...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  let fullText = '';

  for (const block of response.content) {
    if (block.type === 'text') {
      fullText += block.text;
    } else if (block.type === 'tool_use' && block.name === 'web_search') {
      log(`Web search: "${block.input?.query || 'market data'}"`);
    }
  }

  // Handle tool_use stop — feed results back and get final answer
  if (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    log(`Performed ${toolUseBlocks.length} web search(es), continuing...`);

    const toolResults = toolUseBlocks.map((block) => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: 'Search completed. Use the information to make your trading decision.',
    }));

    const continuation = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ],
    });

    for (const block of continuation.content) {
      if (block.type === 'text') fullText += block.text;
    }
  }

  if (!fullText) throw new Error('No text response from Claude');

  log('Parsing Claude decision...');
  const decision = extractJSON(fullText);
  if (!decision) throw new Error(`Could not parse JSON from: ${fullText.slice(0, 300)}`);

  const { action, ticker, shares, price, reasoning, hold_duration } = decision;

  if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
    throw new Error(`Invalid action: ${action}`);
  }

  log(`Decision: ${action} ${ticker || ''} x${shares} @ $${price} — ${reasoning?.slice(0, 100)}`);

  if (action === 'HOLD') {
    return { action: 'HOLD', ticker: ticker || 'N/A', shares: 0, price: 0, reasoning, hold_duration };
  }

  // Verify price via Yahoo Finance
  let verifiedPrice = price;
  try {
    verifiedPrice = await fetchStockPrice(ticker);
    log(`Verified ${ticker} price via Yahoo Finance: $${verifiedPrice}`);
  } catch (err) {
    log(`Yahoo Finance failed for ${ticker}: ${err.message} — using Claude's estimate $${price}`);
  }

  return {
    action,
    ticker: ticker.toUpperCase(),
    shares: Math.max(1, Math.floor(shares)),
    price: verifiedPrice,
    reasoning,
    hold_duration,
  };
}

// ── Trade execution ───────────────────────────────────────────────────────────

function executeTrade(portfolio, decision) {
  const { action, ticker, shares, price, reasoning, hold_duration } = decision;

  if (action === 'HOLD' || !ticker || shares <= 0) return portfolio;

  const priceCAD = price * USD_TO_CAD;
  const tradeValue = shares * priceCAD;
  let newPortfolio = { ...portfolio, positions: { ...portfolio.positions } };
  let trade = null;

  if (action === 'BUY') {
    if (tradeValue > portfolio.cash) {
      log(`ERROR: Insufficient funds for ${shares} ${ticker} @ $${priceCAD.toFixed(2)} CAD (need $${tradeValue.toFixed(2)}, have $${portfolio.cash.toFixed(2)})`);
      return portfolio;
    }

    const existingPos = portfolio.positions[ticker];
    const newShares = (existingPos?.shares || 0) + shares;
    const newAvgCost = existingPos
      ? (existingPos.avgCost * existingPos.shares + price * shares) / newShares
      : price;

    newPortfolio.cash = portfolio.cash - tradeValue;
    newPortfolio.positions[ticker] = {
      shares: newShares,
      avgCost: parseFloat(newAvgCost.toFixed(4)),
      currentPrice: price,
    };

    trade = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      action: 'BUY',
      ticker,
      shares,
      price: parseFloat(priceCAD.toFixed(2)),
      priceUSD: price,
      tradeValue: parseFloat(tradeValue.toFixed(2)),
      pnl: 0,
      outcome: 'OPEN',
      reasoning,
      hold_duration,
    };

    log(`BUY ${shares} ${ticker} @ $${priceCAD.toFixed(2)} CAD = $${tradeValue.toFixed(2)} CAD`);

  } else if (action === 'SELL') {
    const position = portfolio.positions[ticker];
    if (!position || position.shares < shares) {
      log(`ERROR: Cannot sell ${shares} ${ticker} — only own ${position?.shares || 0} shares`);
      return portfolio;
    }

    const pnl = (price - position.avgCost) * shares * USD_TO_CAD;
    const pnlPct = ((price - position.avgCost) / position.avgCost) * 100;
    const outcome = pnl >= 0 ? 'WIN' : 'LOSS';

    const remainingShares = position.shares - shares;
    if (remainingShares <= 0) {
      delete newPortfolio.positions[ticker];
    } else {
      newPortfolio.positions[ticker] = { ...position, shares: remainingShares };
    }

    newPortfolio.cash = portfolio.cash + tradeValue;

    trade = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      action: 'SELL',
      ticker,
      shares,
      price: parseFloat(priceCAD.toFixed(2)),
      priceUSD: price,
      tradeValue: parseFloat(tradeValue.toFixed(2)),
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPct: parseFloat(pnlPct.toFixed(2)),
      outcome,
      reasoning,
      hold_duration,
    };

    log(`SELL ${shares} ${ticker} @ $${priceCAD.toFixed(2)} CAD | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} CAD [${outcome}]`);
  }

  // Recalculate total value
  const totalValue = calcPortfolioValue(newPortfolio);
  newPortfolio.totalValue = parseFloat(totalValue.toFixed(2));
  newPortfolio.peakValue = Math.max(portfolio.peakValue || portfolio.startingCapital, totalValue);

  if (trade) {
    if (!Array.isArray(newPortfolio.trades)) newPortfolio.trades = [];
    newPortfolio.trades = [...newPortfolio.trades, trade];
  }

  return newPortfolio;
}

// ── Daily report generation ───────────────────────────────────────────────────

function generateDailyReport(portfolio) {
  const today = getTodayET();
  const trades = Array.isArray(portfolio.trades) ? portfolio.trades : [];

  const todayTrades = trades.filter((t) => {
    if (!t.timestamp) return false;
    const tradeDate = new Date(t.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return tradeDate === today;
  });

  const endValue = parseFloat(calcPortfolioValue(portfolio).toFixed(2));
  const startValue = portfolio.dayStartValue ?? portfolio.startingCapital;
  const dayPnl = parseFloat((endValue - startValue).toFixed(2));
  const dayPnlPct = startValue > 0 ? parseFloat((((dayPnl / startValue) * 100)).toFixed(2)) : 0;

  // Find last meaningful log entry for commentary
  const logEntries = Array.isArray(portfolio.log) ? portfolio.log : [];
  const lastReasoningLog = logEntries.find(
    (l) => (l.type === 'HOLD' || l.type === 'BUY' || l.type === 'SELL') && l.message?.length > 20
  );
  let commentary = '';
  if (lastReasoningLog) {
    const msg = lastReasoningLog.message;
    const dashIdx = msg.indexOf('—');
    const colonIdx = msg.indexOf(':');
    const startIdx = dashIdx !== -1 ? dashIdx + 1 : colonIdx !== -1 ? colonIdx + 1 : 0;
    commentary = msg.slice(startIdx).trim().slice(0, 300);
  }

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    startValue,
    endValue,
    dayPnl,
    dayPnlPct,
    tradesCount: todayTrades.length,
    trades: todayTrades.map((t) => ({
      action: t.action,
      ticker: t.ticker,
      shares: t.shares,
      price: t.price,
      pnl: t.pnl ?? 0,
    })),
    positionsSnapshot: JSON.parse(JSON.stringify(portfolio.positions)),
    commentary,
  };
}

// ── Is market-close cycle? (3:30 PM ET = 19:30 UTC) ──────────────────────────

function isMarketCloseCycle() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  // 19:30 UTC = 3:30 PM ET (EST). Allow a 10-minute window.
  return utcHour === 19 && utcMin >= 25 && utcMin <= 40;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Claude Trader — GitHub Actions cycle starting ===');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  // Load portfolio
  let portfolio = readPortfolio();
  log(`Portfolio loaded: $${portfolio.totalValue?.toFixed(2) ?? portfolio.cash} CAD total value`);

  // Check bankruptcy
  if (portfolio.isBankrupt) {
    log('Portfolio is bankrupt — halting all trading.');
    process.exit(1);
  }

  const totalValue = calcPortfolioValue(portfolio);
  if (totalValue <= 1) {
    log(`BANKRUPT: Total value $${totalValue.toFixed(2)} CAD <= $1. Halting.`);
    portfolio.isBankrupt = true;
    portfolio.lastUpdated = new Date().toISOString();
    writePortfolio(portfolio);
    process.exit(1);
  }

  // Ensure dayStart is set for today
  const today = getTodayET();
  if (portfolio.dayStartDate !== today) {
    portfolio.dayStartValue = parseFloat(totalValue.toFixed(2));
    portfolio.dayStartDate = today;
    log(`New day detected (${today}) — set dayStartValue to $${portfolio.dayStartValue}`);
  }

  // Run trading cycle
  let decision;
  try {
    decision = await runTradingCycle(portfolio);
  } catch (err) {
    log(`Trade cycle failed: ${err.message}`);
    // Don't exit 1 on API errors — still update lastUpdated and save
    portfolio.lastUpdated = new Date().toISOString();
    writePortfolio(portfolio);
    process.exit(0);
  }

  // Execute trade if not HOLD
  if (decision.action !== 'HOLD') {
    portfolio = executeTrade(portfolio, decision);
  } else {
    log(`HOLD — ${decision.ticker}: ${decision.reasoning?.slice(0, 120)}`);
  }

  // Add to log
  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type: decision.action,
    message: decision.action === 'HOLD'
      ? `HOLD — ${decision.ticker}: ${decision.reasoning}`
      : `${decision.action} ${decision.shares} ${decision.ticker} @ $${(decision.price * USD_TO_CAD).toFixed(2)} CAD | ${decision.reasoning?.slice(0, 100)}`,
  };
  if (!Array.isArray(portfolio.log)) portfolio.log = [];
  portfolio.log = [logEntry, ...portfolio.log].slice(0, 200);

  // Update equity curve
  const newValue = parseFloat(calcPortfolioValue(portfolio).toFixed(2));
  portfolio.totalValue = newValue;
  if (!Array.isArray(portfolio.equityCurve)) portfolio.equityCurve = [];
  portfolio.equityCurve = [...portfolio.equityCurve, {
    time: new Date().toISOString(),
    value: newValue,
  }].slice(-200);

  portfolio.lastUpdated = new Date().toISOString();

  // Post-trade bankruptcy check
  if (newValue <= 1) {
    log(`BANKRUPT after trade: $${newValue.toFixed(2)} CAD. Halting.`);
    portfolio.isBankrupt = true;
    writePortfolio(portfolio);
    process.exit(1);
  }

  // Write updated portfolio
  writePortfolio(portfolio);
  log(`Cycle complete. Portfolio value: $${newValue.toFixed(2)} CAD`);

  // Generate daily report on market-close cycle
  if (isMarketCloseCycle()) {
    log('Market close cycle detected — generating daily report...');
    const report = generateDailyReport(portfolio);
    const reports = readReports();
    // Upsert: replace same-date report if exists
    const filtered = reports.filter((r) => r.date !== report.date);
    const newReports = [report, ...filtered];
    writeReports(newReports);
    log(`Daily report generated for ${report.date}: P&L ${report.dayPnl >= 0 ? '+' : ''}$${report.dayPnl} CAD (${report.dayPnlPct >= 0 ? '+' : ''}${report.dayPnlPct}%)`);
  }

  log('=== Cycle finished ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

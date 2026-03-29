import Anthropic from '@anthropic-ai/sdk';
import { fetchStockPrice } from './prices.js';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

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

// Extract JSON from Claude's response text
function extractJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Try to find JSON in the text
  const jsonMatch = text.match(/\{[^{}]*"action"[^{}]*\}/s);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Try finding any JSON block
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {}
  }

  // Last resort: find first { to last }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function buildPortfolioPrompt(portfolio, recentTrades) {
  const { cash, startingCapital, positions, totalValue } = portfolio;
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

export async function runTradingCycle(portfolio, trades, onLog) {
  onLog({ type: 'THINKING', message: 'Claude is analyzing the market...' });

  const prompt = buildPortfolioPrompt(portfolio, trades);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        },
      ],
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Collect all text from response
    let fullText = '';
    let searchesPerformed = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        fullText += block.text;
      } else if (block.type === 'tool_use' && block.name === 'web_search') {
        const query = block.input?.query || 'market data';
        searchesPerformed.push(query);
        onLog({ type: 'THINKING', message: `Searching: "${query}"` });
      }
    }

    // Handle tool_use responses that require continuation
    if (response.stop_reason === 'tool_use') {
      // Extract tool use blocks
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

      onLog({ type: 'THINKING', message: `Performed ${toolUseBlocks.length} web search(es), processing results...` });

      // Continue the conversation with tool results
      const toolResults = toolUseBlocks.map((block) => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: 'Search completed. Use the information to make your trading decision.',
      }));

      const continuation = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      });

      for (const block of continuation.content) {
        if (block.type === 'text') {
          fullText += block.text;
        }
      }
    }

    if (!fullText) {
      throw new Error('No text response from Claude');
    }

    onLog({ type: 'THINKING', message: `Claude responded. Parsing decision...` });

    const decision = extractJSON(fullText);
    if (!decision) {
      throw new Error(`Could not parse JSON from response: ${fullText.slice(0, 200)}`);
    }

    const { action, ticker, shares, price, reasoning, hold_duration } = decision;

    if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
      throw new Error(`Invalid action: ${action}`);
    }

    if (action === 'HOLD') {
      const holdMsg = hold_duration
        ? `HOLD — ${ticker || 'No trade'}: ${reasoning} [Hold duration: ${hold_duration}]`
        : `HOLD — ${ticker || 'No trade'}: ${reasoning}`;
      onLog({
        type: 'HOLD',
        message: holdMsg,
      });
      return { action: 'HOLD', ticker: ticker || 'N/A', shares: 0, price: 0, reasoning, hold_duration };
    }

    // Verify price by fetching current market price
    let verifiedPrice = price;
    try {
      const priceData = await fetchStockPrice(ticker);
      verifiedPrice = priceData.price;
      onLog({ type: 'THINKING', message: `Verified ${ticker} price: $${verifiedPrice} USD` });
    } catch {
      onLog({ type: 'THINKING', message: `Using Claude's price estimate for ${ticker}: $${price} USD` });
      verifiedPrice = price;
    }

    return {
      action,
      ticker: ticker.toUpperCase(),
      shares: Math.floor(shares),
      price: verifiedPrice,
      reasoning,
      hold_duration,
    };
  } catch (err) {
    const errMsg = err?.message || String(err);
    onLog({ type: 'ERROR', message: `Trade cycle failed: ${errMsg}` });
    throw err;
  }
}

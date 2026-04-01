export default function About() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">How Claude Trader Works</h1>
        <p className="text-gray-400 text-sm mt-1">Understanding the AI-powered paper trading system</p>
      </div>

      {/* Paper money disclaimer */}
      <div className="bg-yellow-950/30 border border-yellow-700/60 rounded-xl p-5">
        <h2 className="text-yellow-400 font-bold text-lg mb-2">Paper Money Only</h2>
        <p className="text-yellow-200/80 text-sm leading-relaxed">
          Claude Trader uses <strong>simulated paper money</strong> — no real money is ever traded.
          This is an educational tool to explore AI decision-making in financial markets.
          Do not use this as financial advice. Past performance in paper trading does not indicate
          real-world returns.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h2 className="text-white font-bold text-lg">The Trading Cycle</h2>
        <div className="space-y-4">
          {[
            {
              step: '1',
              title: 'Portfolio State Analysis',
              desc: 'Each cycle, the app gathers your current cash balance, open positions, recent trades, and P&L metrics.',
              color: 'bg-blue-600',
            },
            {
              step: '2',
              title: 'Claude Searches for Market Data',
              desc: 'Claude (claude-sonnet-4-6) uses a built-in web_search tool to research current stock prices, market news, earnings announcements, and analyst sentiment for candidate stocks.',
              color: 'bg-purple-600',
            },
            {
              step: '3',
              title: 'AI Reasoning & Decision',
              desc: 'After gathering real-time information, Claude analyzes opportunities and risks, then makes a structured decision: BUY, SELL, or HOLD. Every decision includes a detailed written justification.',
              color: 'bg-green-600',
            },
            {
              step: '4',
              title: 'Trade Execution',
              desc: 'The app validates the decision (checks sufficient funds, owned shares, etc.) and executes the paper trade, updating portfolio state in localStorage.',
              color: 'bg-orange-600',
            },
            {
              step: '5',
              title: 'Repeat',
              desc: 'The cycle repeats on your configured schedule (30s / 1min / 2min / 5min), building an equity curve and trade history over time.',
              color: 'bg-pink-600',
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-4">
              <div
                className={`${item.color} rounded-full w-7 h-7 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}
              >
                {item.step}
              </div>
              <div>
                <h3 className="text-white font-semibold">{item.title}</h3>
                <p className="text-gray-400 text-sm mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technical details */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
        <h2 className="text-white font-bold text-lg">Technical Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'AI Model', value: 'claude-sonnet-4-6' },
            { label: 'Currency', value: 'CAD (Canadian Dollar)' },
            { label: 'Default Capital', value: '$500 CAD' },
            { label: 'Price Source', value: 'Yahoo Finance (live)' },
            { label: 'Data Storage', value: 'Browser localStorage' },
            { label: 'Framework', value: 'React + Vite + Tailwind CSS' },
            { label: 'Charts', value: 'Recharts' },
            { label: 'Exchange Rate', value: '~1 USD = 1.36 CAD (fixed)' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-700/50">
              <span className="text-gray-400 text-sm">{item.label}</span>
              <span className="font-mono text-sm text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Claude system prompt */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-white font-bold text-lg mb-3">Claude's System Prompt</h2>
        <pre className="bg-gray-900 rounded-lg p-4 text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed border border-gray-700">
{`You are an autonomous paper trader managing a $500 CAD portfolio.
Your goal is to grow the portfolio. Each cycle, you receive the
current portfolio state. You must search for relevant market news
and current prices, identify opportunities, and return a single
structured trade decision or HOLD. Justify every move. Be bold
but not reckless. You track your own mistakes.

Always respond with valid JSON in this exact format:
{
  "action": "BUY" | "SELL" | "HOLD",
  "ticker": "SYMBOL",
  "shares": number,
  "price": number,
  "reasoning": "your explanation"
}`}
        </pre>
      </div>

      {/* Setup */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-white font-bold text-lg mb-3">Setup</h2>
        <p className="text-gray-400 text-sm mb-3">
          To enable trading, add your Anthropic API key to a <code className="bg-gray-700 px-1.5 py-0.5 rounded text-green-300 text-xs font-mono">.env</code> file in the project root:
        </p>
        <pre className="bg-gray-900 rounded-lg p-4 text-xs text-green-300 font-mono border border-gray-700">
          VITE_ANTHROPIC_API_KEY=sk-ant-...
        </pre>
        <p className="text-gray-500 text-xs mt-3">
          The API key is used client-side with <code className="font-mono">dangerouslyAllowBrowser: true</code>.
          In production, proxy requests through a backend to protect your key.
        </p>
      </div>

      {/* GitHub Auto-Trading Setup */}
      <div className="bg-indigo-950/30 rounded-xl p-5 border border-indigo-700/60 space-y-4">
        <h2 className="text-indigo-300 font-bold text-lg">GitHub Auto-Trading Setup</h2>
        <p className="text-indigo-200/70 text-sm leading-relaxed">
          Claude Trader can run fully autonomously via GitHub Actions — no browser required.
          The bot trades 7 times per trading day and commits portfolio state back to the repo.
        </p>

        <div className="space-y-3">
          {[
            {
              step: '1',
              title: 'Add your API key to GitHub Secrets',
              desc: (
                <>
                  Go to your repo on GitHub → <strong>Settings</strong> → <strong>Secrets and variables</strong> → <strong>Actions</strong> → <strong>New repository secret</strong>.
                  Name it <code className="bg-indigo-900/40 px-1.5 py-0.5 rounded text-green-300 text-xs font-mono">ANTHROPIC_API_KEY</code> and paste your Anthropic API key.
                </>
              ),
            },
            {
              step: '2',
              title: 'The bot runs automatically Mon–Fri',
              desc: 'GitHub Actions triggers at 9:30 AM, 10:30 AM, 11:30 AM, 12:30 PM, 1:30 PM, 2:30 PM, and 3:30 PM ET (7 cycles per trading day). The 3:30 PM cycle also generates a daily report.',
            },
            {
              step: '3',
              title: 'State is saved to data/portfolio.json',
              desc: (
                <>
                  After each cycle the bot commits updated <code className="bg-indigo-900/40 px-1.5 py-0.5 rounded text-green-300 text-xs font-mono">data/portfolio.json</code> and <code className="bg-indigo-900/40 px-1.5 py-0.5 rounded text-green-300 text-xs font-mono">data/reports.json</code> directly to the <code className="bg-indigo-900/40 px-1.5 py-0.5 rounded text-green-300 text-xs font-mono">main</code> branch. The Dashboard fetches these files live on every page load and every 5 minutes during market hours.
                </>
              ),
            },
            {
              step: '4',
              title: 'Manual trigger available',
              desc: 'You can run the bot on-demand from GitHub: go to Actions → "Claude Trader" → "Run workflow". Useful for testing or running outside the scheduled times.',
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-4">
              <div className="bg-indigo-700 rounded-full w-7 h-7 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <h3 className="text-white font-semibold">{item.title}</h3>
                <p className="text-indigo-200/70 text-sm mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-indigo-900/20 rounded-lg p-3 border border-indigo-700/40">
          <p className="text-indigo-300 text-xs font-mono">
            Repo: <a href="https://github.com/soroushseifpour/claude-trader" target="_blank" rel="noreferrer" className="underline hover:text-indigo-100">soroushseifpour/claude-trader</a>
            {' · '}Portfolio: <a href="https://raw.githubusercontent.com/soroushseifpour/claude-trader/master/data/portfolio.json" target="_blank" rel="noreferrer" className="underline hover:text-indigo-100">data/portfolio.json</a>
          </p>
        </div>
      </div>
    </div>
  );
}

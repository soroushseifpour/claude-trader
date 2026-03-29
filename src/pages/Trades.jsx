import TradeTable from '../components/TradeTable.jsx';

export default function Trades() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trade History</h1>
        <p className="text-gray-400 text-sm mt-1">All trades executed by Claude AI</p>
      </div>
      <TradeTable />
    </div>
  );
}

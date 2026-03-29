import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useStore } from '../store/useStore.js';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
        <p className="text-gray-400">{label}</p>
        <p className="text-green-400 font-mono font-bold">
          ${payload[0].value?.toFixed(2)} CAD
        </p>
      </div>
    );
  }
  return null;
};

export default function EquityChart() {
  const equityCurve = useStore((s) => s.equityCurve);
  const startingCapital = useStore((s) => s.portfolio.startingCapital);

  const minVal = Math.min(...equityCurve.map((d) => d.value), startingCapital) * 0.98;
  const maxVal = Math.max(...equityCurve.map((d) => d.value), startingCapital) * 1.02;

  if (equityCurve.length < 2) {
    return (
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="text-gray-400 text-sm uppercase tracking-wider font-medium mb-4">
          Equity Curve
        </h3>
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
          Waiting for trades to build equity curve...
        </div>
      </div>
    );
  }

  // Show only last 50 points for readability
  const displayData = equityCurve.slice(-50);

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-gray-400 text-sm uppercase tracking-wider font-medium mb-4">
        Equity Curve
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={displayData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minVal, maxVal]}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            width={65}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={startingCapital}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{ value: 'Start', fill: '#6b7280', fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

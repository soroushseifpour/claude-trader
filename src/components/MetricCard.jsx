export default function MetricCard({ title, value, subValue, positive, negative, icon }) {
  const valueColor =
    positive === true
      ? 'text-green-400'
      : negative === true
      ? 'text-red-400'
      : 'text-white';

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">{title}</span>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold font-mono mt-1 ${valueColor} truncate`}>{value}</div>
      {subValue && (
        <div
          className={`text-sm font-mono ${
            positive ? 'text-green-400' : negative ? 'text-red-400' : 'text-gray-400'
          }`}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}

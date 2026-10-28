import React from 'react';
import { Bot } from 'lucide-react';

export default function AutoBidsList({ autoBids }) {
  if (!autoBids || autoBids.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-4 border border-slate-800">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4 text-purple-400" />
        <h4 className="text-sm font-bold text-slate-200 font-heading">
          Public Auto-Bid Maximums ({autoBids.length})
        </h4>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Configured proxy limits visible to ensure transparency across all students.
      </p>

      <div className="space-y-2">
        {autoBids.map((ab) => (
          <div
            key={ab.id}
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
          >
            <span className="font-medium text-slate-300">{ab.user_name}</span>
            <span className="font-mono font-bold text-purple-300">
              Max: ₹{Number(ab.max_amount).toLocaleString('en-IN')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

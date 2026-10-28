import React from 'react';
import { Crown, Bot, History, User } from 'lucide-react';

export default function BidHistory({ bids }) {
  if (!bids || bids.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500 text-sm glass-card rounded-2xl">
        <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
        No bids placed yet. Be the first to start the auction!
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between mb-3 px-1">
        <h4 className="text-sm font-bold text-slate-200 font-heading flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" />
          Bid History ({bids.length})
        </h4>
        <span className="text-xs text-slate-400">Public Record</span>
      </div>

      <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto">
        {bids.map((bid, index) => {
          const isHighest = index === 0;

          return (
            <div
              key={bid.id || index}
              className={`py-2.5 px-2 flex items-center justify-between rounded-lg transition-colors ${
                isHighest ? 'bg-indigo-950/20' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isHighest
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isHighest ? <Crown className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-200">
                      {bid.bidder_name}
                    </span>
                    {isHighest && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Leader
                      </span>
                    )}
                    {bid.is_auto && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-0.5">
                        <Bot className="w-2.5 h-2.5" /> Auto
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {new Date(bid.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono font-bold text-sm text-white">
                  ₹{Number(bid.amount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

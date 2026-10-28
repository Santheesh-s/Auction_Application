import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Gavel, Bot, AlertCircle, CheckCircle2, ChevronRight, X } from 'lucide-react';

export default function BidForm({ listing, userState, onBidSuccess }) {
  const { user } = useAuth();

  const currentPrice = listing.current_price ?? listing.start_price;
  const minIncrement = listing.min_increment;
  const minAllowedBid = listing.current_price === null
    ? listing.start_price
    : listing.current_price + minIncrement;

  const [bidAmount, setBidAmount] = useState(minAllowedBid);
  const [autoBidMax, setAutoBidMax] = useState(minAllowedBid + minIncrement * 2);
  const [showAutoBidModal, setShowAutoBidModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!user) {
    return (
      <div className="p-6 rounded-2xl glass-card text-center border border-indigo-500/20">
        <h4 className="text-base font-semibold text-slate-100 mb-1">Want to place a bid?</h4>
        <p className="text-xs text-slate-400 mb-4">Sign in with your campus account to participate in live auctions.</p>
        <a
          href="/login"
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          Log in to Bid
        </a>
      </div>
    );
  }

  if (userState?.isSeller) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          This is your listing. Sellers cannot bid on their own items.
        </p>
      </div>
    );
  }

  if (listing.status !== 'open') {
    return (
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          Bidding is closed for this item ({listing.status.replace('_', ' ')}).
        </p>
      </div>
    );
  }

  const handleManualBid = async (e) => {
    e?.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await api.post(`/api/listings/${listing.id}/bids`, {
        amount: Number(bidAmount),
      });

      // Celebratory confetti on placing lead bid
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {}

      setSuccessMsg(`Bid of ₹${bidAmount} placed! You are now leading.`);
      onBidSuccess?.(res.bid);
    } catch (err) {
      setError(err.message || 'Failed to place bid');
    } finally {
      setLoading(false);
    }
  };

  const handleSetAutoBid = async (e) => {
    e?.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await api.put(`/api/listings/${listing.id}/auto-bid`, {
        max_amount: Number(autoBidMax),
      });

      setShowAutoBidModal(false);
      setSuccessMsg(`Auto-bid set up to ₹${autoBidMax}! The system will proxy-bid for you.`);
      onBidSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to set auto-bid');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAutoBid = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/api/listings/${listing.id}/auto-bid`);
      setSuccessMsg('Your automatic bid has been cancelled.');
      onBidSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickAdds = [minIncrement, minIncrement * 2, minIncrement * 5];

  return (
    <div className="rounded-2xl glass-card p-5 border border-indigo-500/20 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Next Minimum Bid</span>
          <div className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
            <span className="text-indigo-400 text-lg">₹</span>
            <span>{minAllowedBid.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {userState?.isLeading && (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
            <CheckCircle2 className="w-3.5 h-3.5" />
            You're in the Lead
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Manual Bid Form */}
      <form onSubmit={handleManualBid} className="space-y-3">
        {/* Quick Increment Buttons */}
        <div className="flex items-center gap-2">
          {quickAdds.map((add) => {
            const val = minAllowedBid + (add - minIncrement);
            return (
              <button
                key={add}
                type="button"
                onClick={() => setBidAmount(val)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  bidAmount === val
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                ₹{val}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-mono text-base font-bold">
            ₹
          </div>
          <input
            type="number"
            min={minAllowedBid}
            step={1}
            value={bidAmount}
            onChange={(e) => setBidAmount(parseInt(e.target.value, 10) || 0)}
            disabled={loading || userState?.isLeading}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-lg font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            placeholder={String(minAllowedBid)}
          />
        </div>

        <button
          type="submit"
          disabled={loading || userState?.isLeading || bidAmount < minAllowedBid}
          className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Gavel className="w-4 h-4" />
          {loading ? 'Placing Bid...' : userState?.isLeading ? 'You Are Leading' : `Place Bid for ₹${bidAmount}`}
        </button>
      </form>

      {/* Auto-Bid Section */}
      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
        {userState?.myAutoBidMax ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-slate-400">
              Active auto-bid up to <strong className="text-white font-mono">₹{userState.myAutoBidMax}</strong>
            </span>
            <button
              onClick={handleRemoveAutoBid}
              disabled={loading}
              className="text-rose-400 hover:text-rose-300 font-semibold"
            >
              Cancel Auto-Bid
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAutoBidModal(true)}
            className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Bot className="w-4 h-4" />
            <span>Set Automatic Max Bid</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Auto-Bid Modal */}
      {showAutoBidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-slate-700 shadow-2xl relative">
            <button
              onClick={() => setShowAutoBidModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white font-heading">Set Automatic Bid</h3>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Enter the maximum rupees you are willing to pay. The system will automatically place minimum incremental bids on your behalf whenever someone outbids you, keeping you in the lead up to your limit.
            </p>

            <form onSubmit={handleSetAutoBid} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Maximum Limit (INR)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">
                    ₹
                  </div>
                  <input
                    type="number"
                    min={minAllowedBid}
                    value={autoBidMax}
                    onChange={(e) => setAutoBidMax(parseInt(e.target.value, 10) || 0)}
                    className="w-full pl-8 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Must be at least the current minimum bid of ₹{minAllowedBid}
                </span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAutoBidModal(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || autoBidMax < minAllowedBid}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
                >
                  {loading ? 'Activating...' : 'Confirm Auto-Bid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import api from '../lib/api.js';
import {
  CheckCircle,
  XCircle,
  Clock,
  PackageCheck,
  AlertOctagon,
  ArrowRight,
  Handshake
} from 'lucide-react';

export default function SaleWorkflowBanner({ listing, userState, onStatusUpdated }) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const status = listing.status;

  const handleAction = async (endpoint, payload = {}) => {
    setLoading(true);
    try {
      await api.post(`/api/listings/${listing.id}/${endpoint}`, payload);
      onStatusUpdated?.();
    } catch (err) {
      alert(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'open') return null;

  if (status === 'pending_approval') {
    return (
      <div className="p-5 rounded-2xl bg-amber-950/40 border border-amber-600/50 shadow-lg space-y-3">
        <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
          <Clock className="w-5 h-5" />
          <span>Auction Ended — Awaiting Seller Price Approval</span>
        </div>
        <p className="text-xs text-amber-200/80 leading-relaxed">
          The auction has closed with a provisional winning bid of <strong className="text-white font-mono">₹{listing.current_price}</strong> by <strong className="text-white">{listing.winner_name || 'Provisional Winner'}</strong>.
        </p>

        {userState?.isSeller && (
          <div className="pt-2 flex flex-wrap gap-2.5">
            <button
              onClick={() => handleAction('approve')}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              Approve Winning Bid & Reserve Item
            </button>

            {!showRejectInput ? (
              <button
                onClick={() => setShowRejectInput(true)}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-900 transition-colors"
              >
                Reject Final Price
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full mt-2">
                <input
                  type="text"
                  placeholder="Reason for rejection (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                />
                <button
                  onClick={() => handleAction('reject', { note })}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => setShowRejectInput(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {userState?.isWinner && (
          <p className="text-xs text-emerald-400 font-medium">
            You placed the top bid! You will be notified as soon as the seller approves.
          </p>
        )}
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="p-5 rounded-2xl bg-indigo-950/40 border border-indigo-500/50 shadow-lg space-y-3">
        <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
          <Handshake className="w-5 h-5" />
          <span>Item Reserved — Coordinate Campus Handover</span>
        </div>
        <p className="text-xs text-indigo-200/80 leading-relaxed">
          The seller approved the winning price of <strong className="text-white font-mono">₹{listing.current_price}</strong>. Winner is <strong className="text-white">{listing.winner_name}</strong>. Please meet at a campus landmark (e.g. library, canteen) for inspection and exchange.
        </p>

        {(userState?.isSeller || userState?.isWinner) && (
          <div className="pt-2 flex flex-wrap gap-2.5">
            <button
              onClick={() => handleAction('handover')}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
            >
              <PackageCheck className="w-4 h-4" />
              Confirm Handover Completed
            </button>

            {userState?.isSeller && (
              <button
                onClick={() => handleAction('pickup-failed')}
                disabled={loading}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
              >
                Report Pickup Failed
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-600/40 shadow-lg flex items-center gap-3">
        <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-emerald-300">Transaction Completed</h4>
          <p className="text-xs text-emerald-400/80">
            Handover successfully confirmed. Item has been delivered to {listing.winner_name}.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="p-5 rounded-2xl bg-rose-950/30 border border-rose-800/40 shadow-lg flex items-center gap-3">
        <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-rose-300">Sale Not Completed</h4>
          <p className="text-xs text-rose-400/80">
            The seller did not accept the final auction price.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
        <AlertOctagon className="w-6 h-6 text-slate-500 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-slate-300">Listing Cancelled</h4>
          <p className="text-xs text-slate-500">
            This listing was cancelled by the seller.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'failed_pickup') {
    return (
      <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-800/40 flex items-center gap-3">
        <AlertOctagon className="w-6 h-6 text-amber-400 shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-amber-300">Pickup Failed</h4>
          <p className="text-xs text-amber-400/80">
            Campus handover could not be completed.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'unsold') {
    return (
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
        <p className="text-sm font-semibold text-slate-300">Auction Ended Without Bids</p>
        <p className="text-xs text-slate-500 mt-1">This item received no bids before closing.</p>
      </div>
    );
  }

  return null;
}

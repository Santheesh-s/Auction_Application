import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import Countdown from '../components/Countdown.jsx';
import { Package, Crown, AlertCircle, CheckCircle2, ArrowRight, Tag } from 'lucide-react';

export default function MyBids() {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyBids = async () => {
    try {
      const data = await api.get('/api/me/bids');
      setBids(data.bids || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyBids();
  }, []);

  return (
    <div className="space-y-6 py-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading flex items-center gap-2">
          <Package className="w-7 h-7 text-indigo-400" />
          My Bidding Activity
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Monitor auctions you've bid on, your leading bids, and won items.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading your bids...</div>
      ) : bids.length === 0 ? (
        <div className="py-16 text-center glass-panel rounded-3xl p-8 space-y-4">
          <p className="text-sm font-semibold text-slate-300">You haven't placed any bids yet</p>
          <p className="text-xs text-slate-500">Browse campus items and place a bid to see them here.</p>
          <Link
            to="/browse"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Explore Auctions
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bids.map((b) => {
            const isLeading = b.is_leading;
            const isWinner = b.is_winner;
            const isClosed = b.status !== 'open';

            return (
              <div
                key={b.listing_id}
                className="p-4 rounded-2xl glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-xl bg-slate-900 overflow-hidden shrink-0">
                    {b.primary_image ? (
                      <img src={b.primary_image} alt={b.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Tag className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {isWinner ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> You Won!
                        </span>
                      ) : isLeading && !isClosed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                          <Crown className="w-3 h-3" /> Highest Bidder
                        </span>
                      ) : !isClosed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Outbid
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                          Auction Ended
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">
                        {b.category}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-100 hover:text-indigo-400 transition-colors">
                      <Link to={`/listing/${b.listing_id}`}>{b.title}</Link>
                    </h3>

                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Your Highest Bid:{' '}
                      <strong className="text-white font-mono">
                        ₹{Number(b.my_highest_bid).toLocaleString('en-IN')}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">
                      Leading Price
                    </span>
                    <span className="font-mono font-bold text-base text-white">
                      ₹{Number(b.current_price).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="mt-1">
                    {b.status === 'open' ? (
                      <Link
                        to={`/listing/${b.listing_id}`}
                        className={`text-xs font-bold flex items-center gap-1 ${
                          isLeading ? 'text-indigo-400 hover:text-indigo-300' : 'text-amber-400 hover:text-amber-300'
                        }`}
                      >
                        {isLeading ? 'View Auction' : 'Increase Bid'} <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to={`/listing/${b.listing_id}`}
                        className="text-xs font-semibold text-slate-400 hover:text-white"
                      >
                        View Outcome →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

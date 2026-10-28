import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import Countdown from '../components/Countdown.jsx';
import { Layers, PlusCircle, ArrowRight, Tag } from 'lucide-react';

export default function MyListings() {
  const [listings, setListings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchMyListings = async () => {
    try {
      const data = await api.get('/api/me/listings');
      setListings(data.listings || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyListings();
  }, []);

  const filtered = listings.filter((item) => {
    if (filter === 'open') return item.status === 'open';
    if (filter === 'pending') return item.status === 'pending_approval';
    if (filter === 'approved') return item.status === 'approved';
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'other') return ['unsold', 'rejected', 'cancelled', 'failed_pickup'].includes(item.status);
    return true;
  });

  return (
    <div className="space-y-6 py-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading flex items-center gap-2">
            <Layers className="w-7 h-7 text-indigo-400" />
            My Listed Items
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Track and manage your campus auctions, price approvals, and student handovers.
          </p>
        </div>

        <Link
          to="/create"
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          List New Item
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800 text-xs">
        {[
          { id: 'all', label: `All (${listings.length})` },
          { id: 'open', label: 'Active / Open' },
          { id: 'pending', label: 'Needs Approval' },
          { id: 'approved', label: 'In Handover' },
          { id: 'completed', label: 'Completed' },
          { id: 'other', label: 'Unsold / Other' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-2 font-semibold border-b-2 transition-all whitespace-nowrap ${
              filter === tab.id
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Listing Cards */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading your listings...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center glass-panel rounded-3xl p-8 space-y-3">
          <p className="text-sm font-semibold text-slate-300">No items match this filter</p>
          <p className="text-xs text-slate-500">List an item or check other tabs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const price = item.current_price ?? item.start_price;
            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800/80 hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-xl bg-slate-900 overflow-hidden shrink-0">
                    {item.primary_image ? (
                      <img src={item.primary_image} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Tag className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                        {item.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          item.status === 'open'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : item.status === 'pending_approval'
                            ? 'bg-amber-500/10 text-amber-400 animate-pulse'
                            : item.status === 'completed'
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-100 hover:text-indigo-400 transition-colors">
                      <Link to={`/listing/${item.id}`}>{item.title}</Link>
                    </h3>

                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {item.bid_count} {Number(item.bid_count) === 1 ? 'bid' : 'bids'} placed
                      {item.winner_name && ` • Winner: ${item.winner_name}`}
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">
                      {item.current_price ? 'Current Bid' : 'Starting Price'}
                    </span>
                    <span className="font-mono font-bold text-base text-white">
                      ₹{Number(price).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="mt-1">
                    {item.status === 'open' ? (
                      <Countdown closesAt={item.closes_at} />
                    ) : (
                      <Link
                        to={`/listing/${item.id}`}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        Manage Auction <ArrowRight className="w-3.5 h-3.5" />
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

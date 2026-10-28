import React from 'react';
import { Link } from 'react-router-dom';
import Countdown from './Countdown.jsx';
import { Tag, TrendingUp, ShieldCheck } from 'lucide-react';

const CATEGORY_COLORS = {
  cycle: 'from-blue-500/20 to-cyan-500/10 text-cyan-400 border-cyan-500/30',
  calculator: 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30',
  books: 'from-purple-500/20 to-indigo-500/10 text-purple-400 border-purple-500/30',
  electronics: 'from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30',
  other: 'from-slate-500/20 to-slate-500/10 text-slate-300 border-slate-500/30',
};

const CONDITION_LABELS = {
  new: 'Brand New',
  like_new: 'Like New',
  good: 'Good Condition',
  fair: 'Fair',
  poor: 'Needs Repair',
};

export default function ListingCard({ listing }) {
  const currentPrice = listing.current_price ?? listing.start_price;
  const hasBids = listing.current_price !== null && listing.current_price !== undefined;
  const catStyle = CATEGORY_COLORS[listing.category] || CATEGORY_COLORS.other;

  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block rounded-2xl glass-card overflow-hidden hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 flex flex-col"
    >
      {/* Image Preview Container */}
      <div className="relative aspect-4/3 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
        {listing.primary_image ? (
          <img
            src={listing.primary_image}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-slate-900 to-indigo-950 flex flex-col items-center justify-center text-slate-600 gap-2">
            <Tag className="w-10 h-10 stroke-[1.5]" />
            <span className="text-xs uppercase tracking-wider font-semibold">Campus Item</span>
          </div>
        )}

        {/* Floating Category Badge */}
        <div className="absolute top-3 left-3">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider border bg-gradient-to-r backdrop-blur-md shadow-sm ${catStyle}`}>
            {listing.category}
          </span>
        </div>

        {/* Floating Live Countdown */}
        <div className="absolute top-3 right-3 shadow-md">
          <Countdown closesAt={listing.closes_at} />
        </div>

        {/* Bid count tag */}
        <div className="absolute bottom-3 left-3">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-900/80 backdrop-blur-md text-slate-300 border border-slate-700/60 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-indigo-400" />
            {listing.bid_count || 0} {Number(listing.bid_count) === 1 ? 'bid' : 'bids'}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium text-slate-400">{CONDITION_LABELS[listing.condition] || listing.condition}</span>
            <span className="truncate max-w-[120px] text-slate-500">by {listing.seller_name}</span>
          </div>

          <h3 className="font-heading font-semibold text-slate-100 text-base line-clamp-1 group-hover:text-indigo-400 transition-colors">
            {listing.title}
          </h3>

          <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
            {listing.description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-baseline justify-between">
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
              {hasBids ? 'Current Bid' : 'Starting Price'}
            </span>
            <div className="text-xl font-extrabold text-white font-mono flex items-baseline gap-0.5">
              <span className="text-indigo-400 text-base">₹</span>
              <span>{Number(currentPrice).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <span className="text-xs font-semibold text-indigo-400 group-hover:translate-x-0.5 transition-transform">
            View Auction →
          </span>
        </div>
      </div>
    </Link>
  );
}

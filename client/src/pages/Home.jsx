import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import ListingCard from '../components/ListingCard.jsx';
import {
  Gavel,
  Search,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Clock,
  ArrowRight,
  Bike,
  Calculator,
  BookOpen,
  Laptop,
  Flame
} from 'lucide-react';

const CATEGORIES = [
  { id: 'cycle', name: 'Cycles', icon: Bike, desc: 'Mountain & geared bikes' },
  { id: 'calculator', name: 'Calculators', icon: Calculator, desc: 'Exam approved scientific' },
  { id: 'books', name: 'Textbooks', icon: BookOpen, desc: 'Engineering, CS & notes' },
  { id: 'electronics', name: 'Electronics', icon: Laptop, desc: 'Headphones, monitors & chargers' },
];

export default function Home() {
  const [closingSoonListings, setClosingSoonListings] = useState([]);
  const [featuredListings, setFeaturedListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/listings?sort=closing_soon&limit=4'),
      api.get('/api/listings?sort=newest&limit=8'),
    ])
      .then(([closingData, featuredData]) => {
        setClosingSoonListings(closingData.listings || []);
        setFeaturedListings(featuredData.listings || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-16 py-8">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl glass-panel p-8 sm:p-14 border border-indigo-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/25">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>The Premier Student Auction Experience</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white font-heading leading-tight">
            Buy & Sell On Campus With{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
              Live Auctions.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
            Pass on your cycles, scientific calculators, and course textbooks directly to fellow students. Atomic bidding, 30-second anti-sniping clock extensions, and campus verified handovers.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/browse"
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-xl shadow-indigo-600/30 transition-all flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Browse Active Auctions
            </Link>

            <Link
              to="/create"
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-all flex items-center gap-2"
            >
              <Gavel className="w-4 h-4 text-indigo-400" />
              List an Item for Free
            </Link>
          </div>

          {/* Highlights Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xs text-slate-300 font-medium">Server Row-Lock Guard</span>
            </div>
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="text-xs text-slate-300 font-medium">30s Auto Extension</span>
            </div>
            <div className="flex items-center gap-2.5 col-span-2 sm:col-span-1">
              <Clock className="w-5 h-5 text-cyan-400 shrink-0" />
              <span className="text-xs text-slate-300 font-medium">Real-Time WebSockets</span>
            </div>
          </div>
        </div>
      </section>

      {/* Category Pills */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
          <span>Popular Campus Categories</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.id}
                to={`/browse?category=${cat.id}`}
                className="group p-4 rounded-2xl glass-card hover:border-indigo-500/40 transition-all flex items-center gap-3.5"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100 group-hover:text-indigo-400 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{cat.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Ending Soon Section */}
      {closingSoonListings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-rose-500/10 text-rose-400">
                <Flame className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white font-heading">
                Closing Soon (High Action)
              </h2>
            </div>
            <Link
              to="/browse?closingWithin=1h"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              See all closing soon <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {closingSoonListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      )}

      {/* Featured / Fresh Listings Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white font-heading">
            Latest Campus Auctions
          </h2>
          <Link
            to="/browse"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            Explore all listings <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="aspect-4/3 rounded-2xl bg-slate-900/60 animate-pulse" />
            ))}
          </div>
        ) : featuredListings.length === 0 ? (
          <div className="py-12 text-center text-slate-500 glass-card rounded-2xl">
            No active listings found. Be the first to list!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

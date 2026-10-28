import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api.js';
import getSocket from '../lib/socket.js';
import ListingCard from '../components/ListingCard.jsx';
import {
  Search,
  Filter,
  SlidersHorizontal,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'cycle', label: 'Cycles' },
  { id: 'calculator', label: 'Calculators' },
  { id: 'books', label: 'Textbooks' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'other', label: 'Hostel Gear & Other' },
];

const CONDITIONS = [
  { id: 'all', label: 'Any Condition' },
  { id: 'new', label: 'Brand New' },
  { id: 'like_new', label: 'Like New' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
];

const SORT_OPTIONS = [
  { id: 'closing_soon', label: 'Closing Soonest' },
  { id: 'newest', label: 'Newest Listed' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
];

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [condition, setCondition] = useState(searchParams.get('condition') || 'all');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [closingWithin, setClosingWithin] = useState(searchParams.get('closingWithin') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'closing_soon');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));

  const [listings, setListings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (category !== 'all') params.set('category', category);
      if (condition !== 'all') params.set('condition', condition);
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      if (closingWithin) params.set('closingWithin', closingWithin);
      if (sort) params.set('sort', sort);
      params.set('page', String(page));
      params.set('limit', '12');

      setSearchParams(params, { replace: true });

      const data = await api.get(`/api/listings?${params.toString()}`);
      setListings(data.listings || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [category, condition, closingWithin, sort, page]);

  // Listen to live broadcast updates
  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      // Re-fetch current browse page on live updates
      fetchListings();
    };

    socket.on('browse:listing_updated', handleUpdate);
    socket.on('browse:listing_extended', handleUpdate);
    socket.on('browse:listing_closed', handleUpdate);

    return () => {
      socket.off('browse:listing_updated', handleUpdate);
      socket.off('browse:listing_extended', handleUpdate);
      socket.off('browse:listing_closed', handleUpdate);
    };
  }, [category, condition, closingWithin, sort, page, query, minPrice, maxPrice]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchListings();
  };

  const handleResetFilters = () => {
    setQuery('');
    setCategory('all');
    setCondition('all');
    setMinPrice('');
    setMaxPrice('');
    setClosingWithin('');
    setSort('closing_soon');
    setPage(1);
  };

  return (
    <div className="space-y-6 py-6">
      {/* Header & Search Bar */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-black text-white font-heading">
            Browse Campus Auctions
          </h1>
          <p className="text-sm text-slate-400">
            Find items listed by students across all campus hostels and departments.
          </p>
        </div>

        {/* Search & Sort Controls Bar */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by keywords (e.g. cycle, Casio, CLRS, induction)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Filter Pills Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Category Chips */}
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                category === cat.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}

          {/* Closing Soon Filter */}
          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          {['1h', '6h', '24h'].map((time) => (
            <button
              key={time}
              onClick={() => {
                setClosingWithin(closingWithin === time ? '' : time);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                closingWithin === time
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              Next {time}
            </button>
          ))}

          {(query || category !== 'all' || condition !== 'all' || minPrice || maxPrice || closingWithin) && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 ml-auto"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="aspect-4/3 rounded-2xl bg-slate-900/60 animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="py-20 text-center glass-panel rounded-3xl p-8 space-y-3">
          <p className="text-base font-semibold text-slate-300">No auctions match your current filters</p>
          <p className="text-xs text-slate-500">Try adjusting your keywords, price range, or category filter.</p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white mt-2"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6 border-t border-slate-800/80">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pagination.page <= 1}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <span className="text-xs text-slate-400 font-medium">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={pagination.page >= pagination.totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

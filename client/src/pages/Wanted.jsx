import React, { useState, useEffect } from 'react';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { BookmarkCheck, Plus, Trash2, Bell, CheckCircle2, AlertCircle, GraduationCap, ShieldAlert } from 'lucide-react';

const CATEGORIES = [
  { id: '', name: 'Any Category' },
  { id: 'cycle', name: 'Cycle' },
  { id: 'calculator', name: 'Scientific Calculator' },
  { id: 'books', name: 'Textbooks' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'other', name: 'Hostel Gear / Other' },
];

export default function Wanted() {
  const { user } = useAuth();
  const [wantedItems, setWantedItems] = useState([]);
  const [keywords, setKeywords] = useState('');
  const [category, setCategory] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const fetchWanted = async () => {
    try {
      const data = await api.get('/api/wanted');
      setWantedItems(data.wantedItems || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchWanted();
    else setLoading(false);
  }, [user]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!keywords.trim()) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      const payload = {
        keywords: keywords.trim(),
        category: category || null,
        max_price: maxPrice ? parseInt(maxPrice, 10) : null,
      };

      const res = await api.post('/api/wanted', payload);
      setMessage(res.message);
      setKeywords('');
      setMaxPrice('');
      fetchWanted();
    } catch (err) {
      setError(err.message || 'Failed to create alert');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/wanted/${id}`);
      setWantedItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete alert');
    }
  };

  if (!user) {
    return (
      <div className="py-20 text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Sign In Required</h2>
        <p className="text-sm text-slate-400">Please sign in to set up item search alerts.</p>
        <a href="/login" className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs">
          Log In
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading flex items-center gap-2">
            <BookmarkCheck className="w-7 h-7 text-indigo-400" />
            Campus Item Alerts
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Set up keyword alerts for items you need (e.g. "scientific calculator", "geared cycle"). As soon as another student in your college lists it, you'll receive a live notification.
          </p>
        </div>
        {user?.collegeDomain && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold self-start sm:self-auto shrink-0">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Monitors {user.collegeDomain}</span>
          </div>
        )}
      </div>

      {!user?.emailVerified && (
        <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Your college email is not verified yet. Please check your inbox to verify before creating alerts.
          </span>
        </div>
      )}

      {/* Create Alert Card */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
          <Plus className="w-5 h-5 text-indigo-400" />
          Create New Alert
        </h3>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Keywords *</label>
              <input
                type="text"
                required
                placeholder="e.g. Casio fx-991, cycle"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category (Optional)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Max Price ₹ (Optional)</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 2000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !user?.emailVerified}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bell className="w-4 h-4" />
            {!user?.emailVerified ? 'Verification Required' : submitting ? 'Setting Alert...' : 'Save Item Alert'}
          </button>
        </form>
      </div>

      {/* Active Alerts List */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-white font-heading">
          Your Active Alerts ({wantedItems.length})
        </h3>

        {loading ? (
          <div className="py-8 text-center text-slate-500">Loading alerts...</div>
        ) : wantedItems.length === 0 ? (
          <div className="py-12 text-center glass-card rounded-2xl text-xs text-slate-400">
            No active alerts configured. Save an alert above to get notified when students list matching gear.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wantedItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl glass-card border border-slate-800 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-white">"{item.keywords}"</span>
                    {item.category && (
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Budget Cap: {item.max_price ? `Up to ₹${item.max_price}` : 'No limit'}
                  </p>
                </div>

                <button
                  onClick={() => handleDelete(item.id)}
                  title="Remove alert"
                  className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Edit, Lock, AlertCircle } from 'lucide-react';

const CATEGORIES = [
  { id: 'cycle', name: 'Cycle' },
  { id: 'calculator', name: 'Scientific Calculator' },
  { id: 'books', name: 'Textbooks' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'other', name: 'Other' },
];

const CONDITIONS = [
  { id: 'new', name: 'Brand New' },
  { id: 'like_new', name: 'Like New' },
  { id: 'good', name: 'Good' },
  { id: 'fair', name: 'Fair' },
  { id: 'poor', name: 'Needs Repair' },
];

export default function EditListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('cycle');
  const [condition, setCondition] = useState('good');
  const [description, setDescription] = useState('');
  const [hasBids, setHasBids] = useState(false);
  const [startPrice, setStartPrice] = useState(500);
  const [minIncrement, setMinIncrement] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/listings/${id}`)
      .then((data) => {
        const l = data.listing;
        if (user && user.id !== l.seller_id) {
          navigate(`/listing/${id}`);
          return;
        }
        setTitle(l.title);
        setCategory(l.category);
        setCondition(l.condition);
        setDescription(l.description);
        setStartPrice(l.start_price);
        setMinIncrement(l.min_increment);
        setHasBids(data.bids && data.bids.length > 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = {
        title,
        category,
        condition,
        description,
      };

      if (!hasBids) {
        payload.start_price = Number(startPrice);
        payload.min_increment = Number(minIncrement);
      }

      await api.patch(`/api/listings/${id}`, payload);
      navigate(`/listing/${id}`);
    } catch (err) {
      setError(err.message || 'Failed to update listing');
      setSaving(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-400">Loading listing...</div>;

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-slate-800 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
            Edit Listing
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Update your item information.
          </p>
        </div>

        {hasBids && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-600/40 text-amber-300 text-xs flex items-center gap-2.5">
            <Lock className="w-5 h-5 shrink-0 text-amber-400" />
            <span>
              <strong>Price & increment locked:</strong> Bids have already been placed on this auction. Financial terms and closing time cannot be altered to protect student bidders.
            </span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Condition *
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Description *
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {!hasBids && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Start Price (₹)
                </label>
                <input
                  type="number"
                  min={1}
                  value={startPrice}
                  onChange={(e) => setStartPrice(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Min Increment (₹)
                </label>
                <input
                  type="number"
                  min={1}
                  value={minIncrement}
                  onChange={(e) => setMinIncrement(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm font-bold text-white"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              {saving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

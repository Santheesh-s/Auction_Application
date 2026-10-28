import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PlusCircle, Upload, X, AlertCircle, GraduationCap, ShieldAlert } from 'lucide-react';

const CATEGORIES = [
  { id: 'cycle', name: 'Cycle (Geared / Standard)' },
  { id: 'calculator', name: 'Scientific Calculator' },
  { id: 'books', name: 'Course Textbook / Study Notes' },
  { id: 'electronics', name: 'Electronics / Tech Accessories' },
  { id: 'other', name: 'Hostel Gear / Other Items' },
];

const CONDITIONS = [
  { id: 'new', name: 'Brand New (Unopened)' },
  { id: 'like_new', name: 'Like New (Minimal Use)' },
  { id: 'good', name: 'Good (Fully Functional)' },
  { id: 'fair', name: 'Fair (Visible Wear)' },
  { id: 'poor', name: 'Needs Repair' },
];

export default function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('cycle');
  const [condition, setCondition] = useState('good');
  const [description, setDescription] = useState('');
  const [startPrice, setStartPrice] = useState(500);
  const [minIncrement, setMinIncrement] = useState(50);
  
  // Default closes_at: 24 hours from now in local datetime-local format
  const defaultClose = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const [closesAt, setClosesAt] = useState(defaultClose);

  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!user) {
    return (
      <div className="py-20 text-center space-y-4">
        <h2 className="text-2xl font-bold text-white">Sign In Required</h2>
        <p className="text-sm text-slate-400">Please sign in with your campus account to create a listing.</p>
        <a href="/login" className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs">
          Log in to Continue
        </a>
      </div>
    );
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 5) {
      alert('You can upload up to 5 photos per listing.');
      return;
    }

    const newImages = [...images, ...files];
    setImages(newImages);

    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setPreviews([...previews, ...newPreviews]);
  };

  const handleRemoveImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (images.length === 0) {
      setError('Please add at least one photo of the item.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      formData.append('condition', condition);
      formData.append('description', description);
      formData.append('start_price', String(startPrice));
      formData.append('min_increment', String(minIncrement));
      formData.append('closes_at', new Date(closesAt).toISOString());

      images.forEach((file) => {
        formData.append('images', file);
      });

      const res = await api.post('/api/listings', formData);
      navigate(`/listing/${res.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create listing');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-slate-800 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
              List an Item for Auction
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Fill in the details below. Once bids are placed, starting price and closing time are locked.
            </p>
          </div>
          {user?.collegeDomain && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold self-start sm:self-auto shrink-0">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Visible to students of {user.collegeDomain} only</span>
            </div>
          )}
        </div>

        {!user?.emailVerified && (
          <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Your college email is not verified yet. Please check your inbox to verify before creating listings.
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
          {/* Photo Upload Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Item Photos (1 to 5 images) *
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {previews.map((preview, i) => (
                <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-700 group">
                  <img src={preview} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(i)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-950/80 text-rose-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {images.length < 5 && (
                <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer flex flex-col items-center justify-center p-3 text-center transition-all">
                  <Upload className="w-6 h-6 text-indigo-400 mb-1" />
                  <span className="text-[11px] font-semibold text-slate-300">Add Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Listing Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Hercules 21-Speed Mountain Cycle with Lock"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category & Condition */}
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

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Description & Campus Pickup Details *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Describe condition, semester used, accessories included, and preferred pickup hostel..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Pricing & Closing Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Starting Price (₹) *
              </label>
              <input
                type="number"
                min={1}
                required
                value={startPrice}
                onChange={(e) => setStartPrice(parseInt(e.target.value, 10) || 0)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Min Increment (₹) *
              </label>
              <input
                type="number"
                min={1}
                required
                value={minIncrement}
                onChange={(e) => setMinIncrement(parseInt(e.target.value, 10) || 0)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Closes At *
              </label>
              <input
                type="datetime-local"
                required
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !user?.emailVerified}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="w-5 h-5" />
            {!user?.emailVerified ? 'Verification Required to Publish' : loading ? 'Creating Listing...' : 'Publish Auction'}
          </button>
        </form>
      </div>
    </div>
  );
}

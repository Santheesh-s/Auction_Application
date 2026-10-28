import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Bell, Check, Clock, BellRing, ArrowRight } from 'lucide-react';

export default function Notifications() {
  const { user, browserNotifEnabled, requestNotificationPermission } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = async () => {
    try {
      const data = await api.get('/api/notifications');
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.post('/api/notifications/read');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 py-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading flex items-center gap-2">
            <Bell className="w-7 h-7 text-indigo-400" />
            Notifications Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time updates on your bids, price approvals, and wanted item matches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!browserNotifEnabled && (
            <button
              onClick={requestNotificationPermission}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-950/60 border border-indigo-700/60 text-indigo-300 hover:bg-indigo-900/60 flex items-center gap-1.5"
            >
              <BellRing className="w-4 h-4 text-indigo-400" />
              Enable Desktop Popups
            </button>
          )}

          <button
            onClick={handleMarkAllRead}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            Mark All Read
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="py-16 text-center glass-panel rounded-3xl p-8 space-y-2">
          <p className="text-sm font-semibold text-slate-300">You're all caught up!</p>
          <p className="text-xs text-slate-500">No new notifications at this time.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-2xl glass-card border flex items-start justify-between gap-4 transition-all ${
                !n.read ? 'bg-indigo-950/20 border-indigo-500/30' : 'border-slate-800/80 opacity-80'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      n.type === 'outbid'
                        ? 'bg-rose-500/10 text-rose-400'
                        : n.type === 'wanted_match'
                        ? 'bg-purple-500/10 text-purple-400'
                        : n.type === 'won_pending_approval' || n.type === 'winner_approved'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-indigo-500/10 text-indigo-400'
                    }`}
                  >
                    {n.type.replace('_', ' ')}
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                  {n.message}
                </p>
              </div>

              {n.listing_id && (
                <Link
                  to={`/listing/${n.listing_id}`}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-400 shrink-0 flex items-center gap-1"
                >
                  View <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

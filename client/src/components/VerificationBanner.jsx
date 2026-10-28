import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import { AlertTriangle, Mail, CheckCircle, RefreshCw } from 'lucide-react';

export default function VerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  if (!user || user.emailVerified || user.email_verified) {
    return null;
  }

  const handleResend = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post('/api/auth/resend-verification');
      setMessage(res.message || 'Verification link sent to your inbox.');
    } catch (err) {
      setError(err.message || 'Failed to resend verification link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span>
            <strong>Action Required:</strong> Your college account (<span className="text-white font-medium">{user.email}</span>) is unverified.
            Verification is required to place bids and create listings.
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {message && (
            <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              {message}
            </span>
          )}
          {error && (
            <span className="text-rose-400 text-[11px]">
              {error}
            </span>
          )}

          <button
            onClick={handleResend}
            disabled={loading}
            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Mail className="w-3 h-3" />
            )}
            Resend Email
          </button>
        </div>
      </div>
    </div>
  );
}

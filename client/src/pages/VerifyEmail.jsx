import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { CheckCircle2, XCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErrorMessage('Missing verification token in URL.');
      return;
    }

    api
      .post('/api/auth/verify', { token })
      .then((res) => {
        setSuccess(true);
        if (refreshUser) refreshUser();
        try {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore
        }
      })
      .catch((err) => {
        setErrorMessage(err.message || 'Verification token is invalid or has expired.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <div className="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl text-center space-y-6">
        {loading ? (
          <div className="py-12 space-y-4">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-white font-heading">
              Verifying Your College Email...
            </h2>
            <p className="text-xs text-slate-400">
              Please wait while we confirm your institution credentials.
            </p>
          </div>
        ) : success ? (
          <div className="py-6 space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white font-heading">
                College Email Verified!
              </h1>
              <p className="text-xs text-slate-300">
                Your account is now fully verified. You can now browse, bid, and sell items exclusively with fellow students from your campus.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Full bidding and selling privileges unlocked</span>
            </div>

            <Link
              to="/browse"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all"
            >
              Start Exploring Campus Auctions
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="py-6 space-y-5">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/40">
              <XCircle className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white font-heading">
                Verification Failed
              </h1>
              <p className="text-xs text-rose-300">
                {errorMessage}
              </p>
            </div>

            <div className="pt-4 flex flex-col gap-2">
              <Link
                to="/browse"
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
              >
                Return to Campus Auctions
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

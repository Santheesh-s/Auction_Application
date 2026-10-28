import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Gavel, Lock, Mail, User, AlertCircle, CheckCircle, GraduationCap, ArrowRight } from 'lucide-react';
import { getCollegeDomainClient, isPersonalDomainClient } from '../lib/college.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registeredEmail, setRegisteredEmail] = useState(null);

  // Live college domain calculation
  const detectedDomain = getCollegeDomainClient(email);
  const isPersonal = detectedDomain ? isPersonalDomainClient(detectedDomain) : false;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (isPersonal) {
      setError(`Personal email addresses (@${detectedDomain}) are blocked. Please use your official college or university email.`);
      return;
    }

    if (!detectedDomain) {
      setError('Please enter a valid college or institution email address.');
      return;
    }

    setLoading(true);

    try {
      await register(name, email, password, collegeName);
      setRegisteredEmail(email);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (registeredEmail) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="glass-panel p-8 rounded-3xl border border-indigo-500/30 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/40 animate-bounce">
            <Mail className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-white font-heading">
              Check Your Inbox
            </h1>
            <p className="text-xs text-slate-300">
              We've dispatched a secure verification link to:
            </p>
            <p className="text-sm font-bold text-indigo-300 bg-slate-900/80 py-1.5 px-3 rounded-lg border border-slate-800 break-all">
              {registeredEmail}
            </p>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Click the link in the email to activate your account. In development mode without SMTP, the verification link is also printed in your terminal server console.
          </p>

          <div className="pt-2 flex flex-col gap-3">
            <Link
              to="/browse"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
            >
              Explore Campus Auctions
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-600/30">
            <Gavel className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white font-heading">
            Create Student Account
          </h1>
          <p className="text-xs text-slate-400">
            Join the verified campus auction network
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Full Name (Public Display Name)
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                required
                placeholder="e.g. Alex Johnson"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              College / University Name
            </label>
            <div className="relative">
              <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="e.g. Kongu Engineering College"
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Used for your campus profile and badge
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Campus Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                placeholder="e.g. santheeshs.23cse@kongu.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Live College Domain Hint or Personal Domain Block */}
            {detectedDomain && (
              <div className="mt-2 text-xs">
                {isPersonal ? (
                  <div className="p-2 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-300 flex items-center gap-1.5 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Personal email (@{detectedDomain}) not allowed. Use your college email.</span>
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-indigo-300 flex items-center gap-1.5 text-[11px]">
                    <GraduationCap className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Your college: <strong>{detectedDomain}</strong></span>
                  </div>
                )}
              </div>
            )}

            <span className="text-[11px] text-slate-500 mt-1 block">
              Private and never shared with other students
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Password (min 6 characters)
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || isPersonal}
            className="w-full py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            {loading ? 'Registering...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

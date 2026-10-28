import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import getSocket from '../lib/socket.js';
import {
  Gavel,
  Search,
  PlusCircle,
  Bell,
  Sparkles,
  BookmarkCheck,
  Package,
  Layers,
  LogOut,
  User,
  Check,
  Clock,
  ChevronDown,
  GraduationCap
} from 'lucide-react';
import VerificationBanner from './VerificationBanner.jsx';

export default function Navbar() {
  const { user, logout, browserNotifEnabled, requestNotificationPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await api.get('/api/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const socket = getSocket();

      const onNewNotif = (notif) => {
        setNotifications((prev) => [notif, ...prev]);
        setUnreadCount((c) => c + 1);
      };

      socket.on('notification:new', onNewNotif);
      return () => socket.off('notification:new', onNewNotif);
    }
  }, [user]);

  const handleMarkAllRead = async () => {
    try {
      await api.post('/api/notifications/read');
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Campus Brand */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Gavel className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-300 bg-clip-text text-transparent font-heading">
                CampusAuction
              </span>
              <span className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
                Verified
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link
              to="/browse"
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                isActive('/browse')
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Search className="w-4 h-4" />
              Browse
            </Link>

            <Link
              to="/wanted"
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                isActive('/wanted')
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BookmarkCheck className="w-4 h-4" />
              Alerts
            </Link>

            <Link
              to="/assistant"
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                isActive('/assistant')
                  ? 'bg-purple-600/15 text-purple-400 border border-purple-500/30'
                  : 'text-purple-300 hover:text-purple-200 hover:bg-purple-900/20'
              }`}
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              AI Assistant
            </Link>

            {user && (
              <>
                <Link
                  to="/my-bids"
                  className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                    isActive('/my-bids')
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  My Bids
                </Link>

                <Link
                  to="/my-listings"
                  className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                    isActive('/my-listings')
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  My Listings
                </Link>
              </>
            )}
          </nav>

          {/* Right Side: Sell Button & Auth State */}
          <div className="flex items-center gap-3">
            <Link
              to="/create"
              className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-600/20 hover:from-indigo-600 hover:to-indigo-700 transition-all flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Sell Item</span>
            </Link>

            {user ? (
              <div className="flex items-center gap-2">
                {/* Notification Bell Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowNotifDropdown(!showNotifDropdown);
                      setShowUserMenu(false);
                    }}
                    className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors relative"
                    aria-label="Notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {showNotifDropdown && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 glass-panel rounded-2xl shadow-2xl border border-slate-700/80 py-3 z-50">
                      <div className="px-4 pb-2 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">Notifications</span>
                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-indigo-500/20 text-indigo-400 font-medium">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Mark read
                          </button>
                        )}
                      </div>

                      {/* Browser Notification Opt-in Prompt */}
                      {!browserNotifEnabled && (
                        <div className="px-4 py-2 bg-indigo-950/40 border-b border-indigo-900/40 flex items-center justify-between">
                          <span className="text-xs text-indigo-200">Get alerts in background tab?</span>
                          <button
                            onClick={requestNotificationPermission}
                            className="px-2 py-1 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            Enable
                          </button>
                        </div>
                      )}

                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center text-sm text-slate-400">
                            No notifications yet
                          </div>
                        ) : (
                          notifications.slice(0, 8).map((notif) => (
                            <div
                              key={notif.id}
                              className={`p-3 text-xs transition-colors hover:bg-slate-800/40 cursor-pointer ${
                                !notif.read ? 'bg-indigo-950/20' : ''
                              }`}
                              onClick={() => {
                                if (notif.listing_id) {
                                  navigate(`/listing/${notif.listing_id}`);
                                  setShowNotifDropdown(false);
                                }
                              }}
                            >
                              <p className={`line-clamp-2 ${!notif.read ? 'text-slate-100 font-medium' : 'text-slate-300'}`}>
                                {notif.message}
                              </p>
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                                <Clock className="w-3 h-3" />
                                {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="px-4 pt-2 border-t border-slate-800 text-center">
                        <Link
                          to="/notifications"
                          onClick={() => setShowNotifDropdown(false)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                        >
                          View all notifications →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* College Badge */}
                {(user.collegeName || user.college_name || user.collegeDomain || user.college_domain) && (
                  <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 max-w-[220px] truncate" title={user.collegeName || user.college_name || user.collegeDomain}>
                    <GraduationCap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{user.collegeName || user.college_name || user.collegeDomain || user.college_domain}</span>
                  </span>
                )}

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowUserMenu(!showUserMenu);
                      setShowNotifDropdown(false);
                    }}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors text-sm text-slate-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs uppercase shadow-inner">
                      {user.name.charAt(0)}
                    </div>
                    <span className="hidden sm:inline font-medium text-slate-200 max-w-[100px] truncate">
                      {user.name}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-56 glass-panel rounded-2xl shadow-2xl border border-slate-700/80 py-2 z-50">
                      <div className="px-4 py-2 border-b border-slate-800">
                        <p className="text-sm font-semibold text-slate-100">{user.name}</p>
                        {(user.collegeName || user.college_name) && (
                          <p className="text-xs text-slate-300 truncate mt-0.5">
                            {user.collegeName || user.college_name}
                          </p>
                        )}
                        <p className="text-xs text-indigo-300 font-medium flex items-center gap-1 mt-0.5">
                          <GraduationCap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{user.collegeDomain || user.college_domain}</span>
                        </p>
                      </div>

                      <Link
                        to="/my-bids"
                        onClick={() => setShowUserMenu(false)}
                        className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                      >
                        <Package className="w-4 h-4 text-indigo-400" /> My Bids
                      </Link>

                      <Link
                        to="/my-listings"
                        onClick={() => setShowUserMenu(false)}
                        className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                      >
                        <Layers className="w-4 h-4 text-indigo-400" /> My Listings
                      </Link>

                      <Link
                        to="/wanted"
                        onClick={() => setShowUserMenu(false)}
                        className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                      >
                        <BookmarkCheck className="w-4 h-4 text-indigo-400" /> Item Alerts
                      </Link>

                      <div className="border-t border-slate-800 mt-1 pt-1">
                        <button
                          onClick={() => {
                            logout();
                            setShowUserMenu(false);
                            navigate('/');
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-rose-950/30 flex items-center gap-2"
                        >
                          <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 text-sm font-medium text-slate-200 hover:text-white transition-colors"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <VerificationBanner />
    </header>
  );
}

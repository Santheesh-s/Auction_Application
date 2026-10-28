import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api.js';
import getSocket from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [browserNotifEnabled, setBrowserNotifEnabled] = useState(false);

  useEffect(() => {
    // Check initial notification permission
    if ('Notification' in window && Notification.permission === 'granted') {
      setBrowserNotifEnabled(true);
    }

    // Check existing auth session via /api/auth/me
    api.get('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Socket listener for live background notifications
  useEffect(() => {
    const socket = getSocket();

    const handleNewNotif = (notif) => {
      // If browser tab is hidden (in background) and permission is granted, show popup
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Campus Auction', {
            body: notif.message,
            icon: '/favicon.ico',
          });
        } catch (e) {
          console.warn('Browser notification error:', e);
        }
      }
    };

    socket.on('notification:new', handleNewNotif);
    return () => socket.off('notification:new', handleNewNotif);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    setUser(res.user);
    const socket = getSocket();
    socket.connect();
    return res.user;
  };

  const register = async (name, email, password, collegeName) => {
    const res = await api.post('/api/auth/register', {
      name,
      email,
      password,
      college_name: collegeName || undefined,
    });
    setUser(res.user);
    const socket = getSocket();
    socket.connect();
    return res.user;
  };

  const refreshUser = async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setBrowserNotifEnabled(true);
      new Notification('Campus Auction Alerts Enabled', {
        body: 'You will receive live auction updates even when in other tabs!',
      });
      return true;
    }
    setBrowserNotifEnabled(false);
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        refreshUser,
        logout,
        browserNotifEnabled,
        requestNotificationPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

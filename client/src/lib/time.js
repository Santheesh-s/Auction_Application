import { useState, useEffect } from 'react';
import api from './api.js';

let serverOffsetMs = 0;
let isSynced = false;

export async function syncServerClock() {
  try {
    const start = Date.now();
    const data = await api.get('/api/time');
    const end = Date.now();
    const roundTrip = (end - start) / 2;

    const serverNow = new Date(data.now).getTime();
    serverOffsetMs = serverNow + roundTrip - end;
    isSynced = true;
  } catch (err) {
    console.warn('Clock sync note:', err.message);
  }
}

// Initial sync immediately
syncServerClock();

export function getServerNow() {
  return Date.now() + serverOffsetMs;
}

export function formatTimeRemaining(closesAtIso) {
  if (!closesAtIso) return { formatted: '00:00:00', totalSeconds: 0, isClosed: true };

  const closesAt = new Date(closesAtIso).getTime();
  const now = getServerNow();
  const diffMs = closesAt - now;

  if (diffMs <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: 'Closed',
      totalSeconds: 0,
      isClosed: true,
      isUrgent: false,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  let formatted = '';
  if (days > 0) {
    formatted = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    formatted = `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  } else {
    formatted = `${pad(minutes)}m ${pad(seconds)}s`;
  }

  return {
    days,
    hours,
    minutes,
    seconds,
    formatted,
    totalSeconds,
    isClosed: false,
    isUrgent: totalSeconds <= 60, // less than 60 seconds is urgent
  };
}

export function useCountdown(closesAtIso) {
  const [timeLeft, setTimeLeft] = useState(() => formatTimeRemaining(closesAtIso));

  useEffect(() => {
    setTimeLeft(formatTimeRemaining(closesAtIso));
    const interval = setInterval(() => {
      setTimeLeft(formatTimeRemaining(closesAtIso));
    }, 1000);

    return () => clearInterval(interval);
  }, [closesAtIso]);

  return timeLeft;
}

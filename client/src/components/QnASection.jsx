import React, { useState } from 'react';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { MessageSquare, Send, CheckCircle2, EyeOff, ShieldAlert } from 'lucide-react';

export default function QnASection({ listingId, sellerId, questions, onRefresh }) {
  const { user } = useAuth();
  const [questionBody, setQuestionBody] = useState('');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isSeller = user?.id === sellerId;

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!questionBody.trim()) return;
    setError(null);
    setSubmitting(true);

    try {
      await api.post(`/api/listings/${listingId}/questions`, { body: questionBody });
      setQuestionBody('');
      onRefresh?.();
    } catch (err) {
      setError(err.message || 'Failed to submit question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswer = async (questionId) => {
    const text = answers[questionId]?.trim();
    if (!text) return;
    setError(null);

    try {
      await api.post(`/api/questions/${questionId}/answer`, { answer: text });
      setAnswers((prev) => ({ ...prev, [questionId]: '' }));
      onRefresh?.();
    } catch (err) {
      setError(err.message || 'Failed to submit answer');
    }
  };

  const handleHide = async (questionId) => {
    try {
      await api.post(`/api/questions/${questionId}/hide`);
      onRefresh?.();
    } catch (err) {
      alert(err.message || 'Failed to hide question');
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-slate-100 font-heading flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          Buyer Questions & Seller Answers
        </h4>
        <span className="text-xs text-slate-500">{questions?.length || 0} questions</span>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Ask Question Form (For non-sellers) */}
      {user && !isSeller && (
        <form onSubmit={handleAsk} className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              maxLength={300}
              placeholder="Ask the seller about item condition, hostel location, or accessories (max 300 chars)..."
              value={questionBody}
              onChange={(e) => setQuestionBody(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              required
            />
            <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-500">
              {300 - questionBody.length} left
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || !questionBody.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Posting...' : 'Ask Question'}
          </button>
        </form>
      )}

      {/* Questions List */}
      <div className="space-y-3 pt-2">
        {!questions || questions.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            No questions yet. Ask anything before placing your bid!
          </p>
        ) : (
          questions.map((q) => (
            <div
              key={q.id}
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                q.hidden
                  ? 'bg-slate-900/40 border-slate-800 opacity-60'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              {/* Question */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-semibold text-indigo-300 mr-2">Q:</span>
                  <span className="text-slate-200">{q.body}</span>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Asked by {q.asker_name} • {new Date(q.created_at).toLocaleDateString()}
                  </div>
                </div>

                {isSeller && !q.hidden && (
                  <button
                    onClick={() => handleHide(q.id)}
                    title="Hide spam question"
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Answer */}
              {q.answer ? (
                <div className="pl-3 border-l-2 border-emerald-500/60 bg-emerald-950/20 py-1.5 px-2.5 rounded-r-lg mt-2">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 mb-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Seller Answer:</span>
                  </div>
                  <p className="text-slate-300 text-xs">{q.answer}</p>
                </div>
              ) : isSeller ? (
                <div className="pt-2 flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={600}
                    placeholder="Type your answer (max 600 chars)..."
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleAnswer(q.id)}
                    disabled={!answers[q.id]?.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
                  >
                    Answer
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">
                  Awaiting seller response...
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

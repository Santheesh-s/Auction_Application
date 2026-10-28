import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Sparkles,
  Send,
  Bot,
  User,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Gavel
} from 'lucide-react';

export default function Assistant() {
  const { user } = useAuth();

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your Campus Auction AI Assistant. I can help you search for textbook, cycle, and calculator auctions across campus, or prepare a safe auto-bid. Try asking:\n- \"Find me a cycle under ₹2000\"\n- \"Show scientific calculators\"\n- \"Bid up to ₹1800 on listing #1\"",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendMessage = async (userText) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const newMsgs = [...messages, { role: 'user', content: textToSend.trim() }];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      const data = await api.post('/api/assistant/chat', { messages: newMsgs });
      setMessages([
        ...newMsgs,
        {
          role: 'assistant',
          content: data.reply,
          proposal: data.proposal,
          listings: data.listings,
        },
      ]);
    } catch (err) {
      setMessages([
        ...newMsgs,
        {
          role: 'assistant',
          content: `Sorry, an error occurred: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmProposal = async (proposalId, msgIndex) => {
    try {
      await api.post(`/api/assistant/proposals/${proposalId}/confirm`);
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]?.proposal) {
          next[msgIndex].proposal.status = 'confirmed';
        }
        return next;
      });
    } catch (err) {
      alert(err.message || 'Failed to confirm proposal');
    }
  };

  const handleCancelProposal = async (proposalId, msgIndex) => {
    try {
      await api.post(`/api/assistant/proposals/${proposalId}/cancel`);
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]?.proposal) {
          next[msgIndex].proposal.status = 'cancelled';
        }
        return next;
      });
    } catch (err) {
      alert(err.message || 'Failed to cancel proposal');
    }
  };

  if (!user) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <Sparkles className="w-12 h-12 text-purple-400 mx-auto" />
        <h2 className="text-2xl font-bold text-white font-heading">AI Assistant</h2>
        <p className="text-sm text-slate-400">
          Sign in to chat with the AI assistant, search campus listings, and set up verified auto-bid proposals.
        </p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs">
          Log in to Chat
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Header & Guardrail Notice */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white font-heading">Campus AI Assistant</h1>
            <p className="text-[11px] text-slate-400">Strictly enforced confirm-before-bid guardrails</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Private details protected</span>
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 glass-panel rounded-3xl p-5 border border-slate-800 overflow-y-auto space-y-4">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : 'bg-purple-950 border border-purple-700/60 text-purple-300'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none whitespace-pre-line'
                }`}
              >
                {m.content}

                {/* Proposal Card Guardrail UI */}
                {m.proposal && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-purple-500/40 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300 uppercase tracking-wider">
                        <Gavel className="w-4 h-4" /> Bid Proposal
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          m.proposal.status === 'confirmed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : m.proposal.status === 'cancelled'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-400 animate-pulse'
                        }`}
                      >
                        {m.proposal.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-white text-sm">
                        {m.proposal.listing_title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Automatic Proxy Bid Cap:{' '}
                        <strong className="text-purple-300 font-mono text-sm">
                          ₹{m.proposal.max_amount}
                        </strong>
                      </p>
                    </div>

                    {m.proposal.status === 'pending' ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleConfirmProposal(m.proposal.id, idx)}
                          className="flex-1 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Confirm & Activate Bid
                        </button>
                        <button
                          onClick={() => handleCancelProposal(m.proposal.id, idx)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : m.proposal.status === 'confirmed' ? (
                      <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Auto-bid is active!</span>
                        <Link
                          to={`/listing/${m.proposal.listing_id}`}
                          className="ml-auto underline flex items-center gap-0.5 text-xs"
                        >
                          View Listing <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">Proposal cancelled.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-purple-400 animate-pulse pl-11">
            <Bot className="w-4 h-4" />
            <span>Thinking and checking verified database...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs px-1">
        {[
          'Find me a cycle under ₹2000',
          'Show scientific calculators',
          'Bid up to ₹500 on listing #1',
          'What engineering textbooks are available?',
        ].map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(prompt)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 shrink-0 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="Ask AI assistant about campus auctions or say 'Bid up to ₹X on listing #ID'..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-2xl text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}

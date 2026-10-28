import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import getSocket from '../lib/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import Countdown from '../components/Countdown.jsx';
import BidForm from '../components/BidForm.jsx';
import BidHistory from '../components/BidHistory.jsx';
import AutoBidsList from '../components/AutoBidsList.jsx';
import SaleWorkflowBanner from '../components/SaleWorkflowBanner.jsx';
import QnASection from '../components/QnASection.jsx';
import EventsTimeline from '../components/EventsTimeline.jsx';
import {
  Tag,
  ShieldCheck,
  User,
  Clock,
  Zap,
  ArrowLeft,
  Share2,
  Edit,
  Trash2,
  AlertCircle
} from 'lucide-react';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [listing, setListing] = useState(null);
  const [images, setImages] = useState([]);
  const [bids, setBids] = useState([]);
  const [autoBids, setAutoBids] = useState([]);
  const [events, setEvents] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [userState, setUserState] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [extensionNotice, setExtensionNotice] = useState(null);

  const fetchListingDetails = async () => {
    try {
      const data = await api.get(`/api/listings/${id}`);
      setListing(data.listing);
      setImages(data.images || []);
      setBids(data.bids || []);
      setAutoBids(data.autoBids || []);
      setEvents(data.events || []);
      setQuestions(data.questions || []);
      setUserState(data.userState || null);
    } catch (err) {
      setError(err.message || 'Failed to load listing details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListingDetails();

    const socket = getSocket();
    socket.emit('join:listing', id);

    const onBidNew = (newBid) => {
      setBids((prev) => [newBid, ...prev.filter((b) => b.id !== newBid.id)]);
      setListing((prev) => prev ? { ...prev, current_price: newBid.amount } : prev);
      fetchListingDetails();
    };

    const onAuctionExtended = (data) => {
      setListing((prev) => prev ? { ...prev, closes_at: data.closes_at } : prev);
      setExtensionNotice('Auction extended by 60s due to last-minute bid!');
      setTimeout(() => setExtensionNotice(null), 5000);
      fetchListingDetails();
    };

    const onAuctionClosed = (data) => {
      setListing((prev) => prev ? { ...prev, status: data.status, winner_id: data.winner_id } : prev);
      fetchListingDetails();
    };

    const onListingUpdated = () => {
      fetchListingDetails();
    };

    socket.on('bid:new', onBidNew);
    socket.on('auction:extended', onAuctionExtended);
    socket.on('auction:closed', onAuctionClosed);
    socket.on('listing:updated', onListingUpdated);

    return () => {
      socket.emit('leave:listing', id);
      socket.off('bid:new', onBidNew);
      socket.off('auction:extended', onAuctionExtended);
      socket.off('auction:closed', onAuctionClosed);
      socket.off('listing:updated', onListingUpdated);
    };
  }, [id]);

  const handleCancelListing = async () => {
    if (!window.confirm('Are you sure you want to cancel this auction? All bidders will be notified.')) return;
    try {
      await api.post(`/api/listings/${id}/cancel`);
      fetchListingDetails();
    } catch (err) {
      alert(err.message || 'Failed to cancel');
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 animate-pulse">
        Loading auction details...
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="py-16 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Listing Not Found</h2>
        <p className="text-sm text-slate-400">{error || 'This listing does not exist or has been removed.'}</p>
        <Link to="/browse" className="inline-block px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">
          ← Back to Browse
        </Link>
      </div>
    );
  }

  const currentPrice = listing.current_price ?? listing.start_price;
  const hasBids = listing.current_price !== null && listing.current_price !== undefined;
  const isSeller = user?.id === listing.seller_id;

  return (
    <div className="space-y-8 py-6 max-w-6xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {isSeller && listing.status === 'open' && (
          <div className="flex items-center gap-2">
            <Link
              to={`/listing/${listing.id}/edit`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1"
            >
              <Edit className="w-3.5 h-3.5 text-indigo-400" /> Edit Listing
            </Link>
            <button
              onClick={handleCancelListing}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Cancel Auction
            </button>
          </div>
        )}
      </div>

      {/* Extension Alert Banner */}
      {extensionNotice && (
        <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-sm font-bold flex items-center gap-2 animate-bounce">
          <Zap className="w-5 h-5 text-amber-400 shrink-0" />
          <span>{extensionNotice}</span>
        </div>
      )}

      {/* Sale State Machine Banner (Approval / Handover / Complete) */}
      <SaleWorkflowBanner
        listing={listing}
        userState={userState}
        onStatusUpdated={fetchListingDetails}
      />

      {/* Main Grid: Left Images & Details, Right Bidding Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column (Images, Overview, QnA, Timeline) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Image Gallery */}
          <div className="rounded-3xl glass-card overflow-hidden p-2 border border-slate-800">
            <div className="relative aspect-4/3 w-full rounded-2xl bg-slate-900 overflow-hidden flex items-center justify-center">
              {images.length > 0 ? (
                <img
                  src={images[activeImageIndex]?.url || images[0]?.url}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-slate-600 flex flex-col items-center gap-2">
                  <Tag className="w-12 h-12" />
                  <span className="text-xs uppercase">No Photo Available</span>
                </div>
              )}

              {/* Status Pill */}
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900/80 backdrop-blur-md text-indigo-400 border border-indigo-500/30">
                  {listing.category}
                </span>
              </div>

              {/* Countdown Pill */}
              <div className="absolute top-4 right-4">
                <Countdown closesAt={listing.closes_at} size="large" />
              </div>
            </div>

            {/* Thumbnail selector */}
            {images.length > 1 && (
              <div className="flex items-center gap-2 mt-3 px-1 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.id || i}
                    onClick={() => setActiveImageIndex(i)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                      activeImageIndex === i ? 'border-indigo-500 scale-105' : 'border-slate-800 opacity-60'
                    }`}
                  >
                    <img src={img.url} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Description & Item Specs */}
          <div className="glass-card rounded-3xl p-6 border border-slate-800 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium capitalize">
                  {listing.condition.replace('_', ' ')}
                </span>
                <span>•</span>
                <span>Listed by <strong>{listing.seller_name}</strong></span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
                {listing.title}
              </h1>
            </div>

            <div className="prose prose-invert text-slate-300 text-sm leading-relaxed whitespace-pre-line">
              {listing.description}
            </div>

            <div className="pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block">Starting Price</span>
                <span className="font-mono font-bold text-white text-sm">
                  ₹{Number(listing.start_price).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 block">Min. Increment</span>
                <span className="font-mono font-bold text-white text-sm">
                  ₹{Number(listing.min_increment).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-slate-500 block">Total Bids</span>
                <span className="font-mono font-bold text-indigo-400 text-sm">
                  {bids.length} placed
                </span>
              </div>
            </div>
          </div>

          {/* Q&A Section */}
          <QnASection
            listingId={listing.id}
            sellerId={listing.seller_id}
            questions={questions}
            onRefresh={fetchListingDetails}
          />

          {/* Events Audit Trail */}
          <EventsTimeline events={events} />
        </div>

        {/* Right Column: Bid Actions, Current Price, Bid History, Public Auto Bids */}
        <div className="lg:col-span-5 space-y-6">
          {/* Primary Bidding Form */}
          <BidForm
            listing={listing}
            userState={userState}
            onBidSuccess={fetchListingDetails}
          />

          {/* Public Bid History */}
          <BidHistory bids={bids} />

          {/* Public Auto Bids */}
          <AutoBidsList autoBids={autoBids} />
        </div>
      </div>
    </div>
  );
}

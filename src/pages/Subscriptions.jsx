import { useState, useEffect } from 'react';
import { CreditCard, Calendar, AlertTriangle, Zap, Play, Pause, XCircle, RefreshCw, DollarSign, Search } from 'lucide-react';
import api from '../services/api';

const Subscriptions = () => {
    const [summary, setSummary] = useState(null);
    const [fees, setFees] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [actionLoading, setActionLoading] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [summaryRes, feesRes] = await Promise.all([
                api.get('/subscriptions/summary'),
                api.get('/subscriptions/fees')
            ]);
            setSummary(summaryRes.data);
            setFees(feesRes.data);
        } catch (err) {
            setError('Failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    };

    const handleResume = async (id) => {
        try {
            setActionLoading(id);
            await api.post(`/subscriptions/${id}/resume`);
            setSuccess('Subscription resumed');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to resume');
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancel = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this subscription? The connected service will be deactivated.')) {
            return;
        }
        try {
            setActionLoading(id);
            await api.post(`/subscriptions/${id}/cancel`);
            setSuccess('Subscription cancelled');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to cancel');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            ACTIVE: { class: 'badge-success', icon: <Play size={12} />, text: 'Active' },
            PAUSED: { class: 'badge-warning', icon: <Pause size={12} />, text: 'Paused' },
            CANCELLED: { class: 'badge-danger', icon: <XCircle size={12} />, text: 'Cancelled' }
        };
        const badge = badges[status] || badges.ACTIVE;
        return (
            <span className={`badge ${badge.class}`}>
                {badge.icon} {badge.text}
            </span>
        );
    };

    const getResourceIcon = (type) => {
        switch (type) {
            case 'DEVICE': return '📱';
            case 'TELEGRAM_BOT': return '🤖';
            case 'SMM_PANEL': return '🌐';
            default: return '📦';
        }
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getDaysUntil = (date) => {
        if (!date) return null;
        const now = new Date();
        const target = new Date(date);
        const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
        return diff;
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading subscriptions...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><CreditCard size={28} /> My Subscriptions</h1>
                    <p className="header-subtitle">Manage your monthly subscriptions for devices, bots, and panels</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><Zap size={20} />{success}</div>}

            {/* Summary Cards */}
            {summary && (
                <div className="summary-grid">
                    <div className="summary-card">
                        <div className="summary-icon"><CreditCard size={24} /></div>
                        <div className="summary-content">
                            <div className="summary-value">{summary.total}</div>
                            <div className="summary-label">Total Subscriptions</div>
                        </div>
                    </div>
                    <div className="summary-card active">
                        <div className="summary-icon"><Play size={24} /></div>
                        <div className="summary-content">
                            <div className="summary-value">{summary.active}</div>
                            <div className="summary-label">Active</div>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-icon"><DollarSign size={24} /></div>
                        <div className="summary-content">
                            <div className="summary-value">${summary.monthlyTotal?.toFixed(2)}</div>
                            <div className="summary-label">Monthly Cost</div>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-icon"><Calendar size={24} /></div>
                        <div className="summary-content">
                            <div className="summary-value">{summary.nextBilling ? formatDate(summary.nextBilling) : 'N/A'}</div>
                            <div className="summary-label">Next Billing</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Subscription Fees Info */}
            {fees && (
                <div className="card fees-info">
                    <h4>Monthly Subscription Fees</h4>
                    <div className="fees-grid">
                        <div className="fee-item">
                            <span>📱 WhatsApp Device</span>
                            <span className="fee-amount">${fees.DEVICE}/month</span>
                        </div>
                        <div className="fee-item">
                            <span>🤖 Telegram Bot</span>
                            <span className="fee-amount">${fees.TELEGRAM_BOT}/month</span>
                        </div>
                        <div className="fee-item">
                            <span>🌐 SMM Panel</span>
                            <span className="fee-amount">${fees.SMM_PANEL}/month</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Subscriptions List */}
            <div className="card">
                <div className="card-header">
                    <h3>Your Subscriptions</h3>
                </div>

                {(!summary?.subscriptions || summary.subscriptions.length === 0) ? (
                    <div className="empty-state">
                        <CreditCard size={48} />
                        <h4>No Subscriptions Yet</h4>
                        <p>Connect a WhatsApp device, Telegram bot, or SMM panel to start a subscription.</p>
                    </div>
                ) : (
                    <div className="subscriptions-list">
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <div className="search-box">
                                <Search size={18} />
                                <input
                                    type="text"
                                    placeholder="Search subscriptions..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        {summary.subscriptions
                            .filter(sub => !searchTerm || (sub.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (sub.type || '').toLowerCase().includes(searchTerm.toLowerCase()))
                            .map(sub => {
                                const daysUntil = getDaysUntil(sub.nextBilling);
                                const isExpiringSoon = daysUntil !== null && daysUntil <= 3 && sub.status === 'ACTIVE';

                                return (
                                    <div key={sub.id} className={`subscription-item ${sub.status.toLowerCase()}`}>
                                        <div className="subscription-info">
                                            <div className="subscription-icon">
                                                {getResourceIcon(sub.type)}
                                            </div>
                                            <div className="subscription-details">
                                                <h4>{sub.name}</h4>
                                                <span className="subscription-type">{sub.type.replace('_', ' ')}</span>
                                            </div>
                                        </div>

                                        <div className="subscription-status">
                                            {getStatusBadge(sub.status)}
                                        </div>

                                        <div className="subscription-billing">
                                            <div className="billing-amount">${sub.fee}/mo</div>
                                            {sub.status === 'ACTIVE' && sub.nextBilling && (
                                                <div className={`billing-date ${isExpiringSoon ? 'warning' : ''}`}>
                                                    {isExpiringSoon && <AlertTriangle size={12} />}
                                                    {daysUntil <= 0 ? 'Due today' : `${daysUntil} days left`}
                                                </div>
                                            )}
                                        </div>

                                        <div className="subscription-actions">
                                            {sub.status === 'PAUSED' && (
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => handleResume(sub.id)}
                                                    disabled={actionLoading === sub.id}
                                                >
                                                    <Play size={14} /> Resume
                                                </button>
                                            )}
                                            {sub.status === 'ACTIVE' && (
                                                <button
                                                    className="btn btn-sm btn-ghost text-danger"
                                                    onClick={() => handleCancel(sub.id)}
                                                    disabled={actionLoading === sub.id}
                                                >
                                                    <XCircle size={14} /> Cancel
                                                </button>
                                            )}
                                            {sub.status === 'CANCELLED' && (
                                                <span className="text-muted">Cancelled</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}
            </div>

            <style>{`
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .summary-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .summary-card.active {
          border-color: var(--success-color);
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.05), transparent);
        }
        .summary-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary-color);
        }
        .summary-value {
          font-size: 1.5rem;
          font-weight: 700;
        }
        .summary-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .fees-info {
          margin-bottom: 1.5rem;
          padding: 1.25rem;
        }
        .fees-info h4 {
          margin: 0 0 1rem 0;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
        .fees-grid {
          display: flex;
          gap: 2rem;
          flex-wrap: wrap;
        }
        .fee-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .fee-amount {
          font-weight: 600;
          color: var(--primary-color);
        }
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: var(--text-secondary);
        }
        .empty-state h4 {
          margin: 1rem 0 0.5rem 0;
          color: var(--text-primary);
        }
        .subscriptions-list {
          display: flex;
          flex-direction: column;
        }
        .subscription-item {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1.25rem;
          border-bottom: 1px solid var(--border-color);
        }
        .subscription-item:last-child {
          border-bottom: none;
        }
        .subscription-item.paused {
          opacity: 0.7;
          background: rgba(245, 158, 11, 0.03);
        }
        .subscription-item.cancelled {
          opacity: 0.5;
        }
        .subscription-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex: 1;
        }
        .subscription-icon {
          font-size: 1.5rem;
        }
        .subscription-details h4 {
          margin: 0;
          font-size: 1rem;
        }
        .subscription-type {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .subscription-status {
          min-width: 100px;
        }
        .subscription-billing {
          min-width: 120px;
          text-align: right;
        }
        .billing-amount {
          font-weight: 600;
          font-size: 1.1rem;
        }
        .billing-date {
          font-size: 0.8rem;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.25rem;
        }
        .billing-date.warning {
          color: var(--warning-color);
        }
        .subscription-actions {
          min-width: 100px;
          text-align: right;
        }
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.85rem;
        }
      `}</style>
        </div>
    );
};

export default Subscriptions;

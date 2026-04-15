import { useState, useEffect } from 'react';
import { CreditCard, Calendar, AlertTriangle, Zap, Play, Pause, XCircle, RefreshCw, DollarSign, Search, ToggleLeft, ToggleRight, Clock, CheckCircle, ArrowUpCircle, History } from 'lucide-react';
import api from '../services/api';

const Subscriptions = () => {
    const [summary, setSummary] = useState(null);
    const [fees, setFees] = useState(null);
    const [billingHistory, setBillingHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [actionLoading, setActionLoading] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [summaryRes, feesRes, historyRes] = await Promise.all([
                api.get('/subscriptions/summary'),
                api.get('/subscriptions/fees'),
                api.get('/subscriptions/history').catch(() => ({ data: [] }))
            ]);
            setSummary(summaryRes.data);
            setFees(feesRes.data);
            setBillingHistory(historyRes.data || []);
        } catch (err) {
            setError('Failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    };


    const handleRenew = async (id) => {
        if (!window.confirm('This will charge your balance and reactivate the service. Continue?')) {
            return;
        }
        try {
            setActionLoading(id);
            setError('');
            await api.post(`/subscriptions/${id}/renew`);
            setSuccess('Subscription renewed and service reactivated!');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to renew. Please check your balance.');
            setTimeout(() => setError(''), 5000);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancel = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this subscription? The connected service will be deactivated immediately.')) {
            return;
        }
        try {
            setActionLoading(id);
            await api.post(`/subscriptions/${id}/cancel`);
            setSuccess('Subscription cancelled and service deactivated');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to cancel');
            setTimeout(() => setError(''), 5000);
        } finally {
            setActionLoading(null);
        }
    };

    const handleToggleAutoRenew = async (id, currentValue) => {
        try {
            setActionLoading(id);
            await api.patch(`/subscriptions/${id}/auto-renew`, { autoRenew: !currentValue });
            setSuccess(`Auto-renew ${!currentValue ? 'enabled' : 'disabled'}`);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to toggle auto-renew');
            setTimeout(() => setError(''), 5000);
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

    const formatDateTime = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
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
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-ghost" onClick={() => setShowHistory(!showHistory)} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <History size={16} /> {showHistory ? 'Hide' : 'Billing'} History
                    </button>
                    <button className="btn btn-secondary" onClick={fetchData}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
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

            {/* Billing History */}
            {showHistory && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <h3><History size={20} /> Billing History</h3>
                    </div>
                    {billingHistory.length === 0 ? (
                        <div className="empty-state" style={{ padding: '2rem' }}>
                            <History size={36} />
                            <h4>No billing history yet</h4>
                            <p>Subscription renewal transactions will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Description</th>
                                        <th>Amount</th>
                                        <th>Balance After</th>
                                        <th>Reference</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {billingHistory.map(tx => (
                                        <tr key={tx.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(tx.createdAt)}</td>
                                            <td>{tx.description}</td>
                                            <td style={{ color: 'var(--danger-color)', fontWeight: 600 }}>
                                                -${tx.amount?.toFixed(2)}
                                            </td>
                                            <td>${tx.balanceAfter?.toFixed(2)}</td>
                                            <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {tx.reference?.replace('SUBSCRIPTION_', '').replace('SUBSCRIPTION_RENEW_', 'RENEW_').slice(0, 12)}...
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
                                const isResourceDeleted = sub.resourceExists === false;

                                return (
                                    <div key={sub.id} className={`subscription-item ${sub.status.toLowerCase()} ${isResourceDeleted ? 'resource-deleted' : ''}`}>
                                        <div className="subscription-info">
                                            <div className="subscription-icon">
                                                {getResourceIcon(sub.type)}
                                            </div>
                                            <div className="subscription-details">
                                                <h4>{sub.name}</h4>
                                                <span className="subscription-type">{sub.type.replace('_', ' ')}</span>
                                                {/* Show resource deleted warning */}
                                                {isResourceDeleted && (
                                                    <div className="sub-resource-deleted">
                                                        <XCircle size={11} /> Resource Deleted
                                                    </div>
                                                )}
                                                {/* Show last billed date */}
                                                {!isResourceDeleted && sub.lastBilledAt && (
                                                    <div className="sub-last-billed">
                                                        <Clock size={11} /> Last charged: {formatDate(sub.lastBilledAt)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="subscription-status">
                                            {getStatusBadge(sub.status)}
                                            {/* Show failure reason for paused */}
                                            {sub.status === 'PAUSED' && sub.failedAttempts > 0 && (
                                                <div className="sub-fail-info">
                                                    <AlertTriangle size={11} /> {sub.failedAttempts} failed attempt{sub.failedAttempts > 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>

                                        <div className="subscription-billing">
                                            <div className="billing-amount">${sub.fee}/mo</div>
                                            {sub.status === 'ACTIVE' && sub.nextBilling && (
                                                <div className={`billing-date ${isExpiringSoon ? 'warning' : ''}`}>
                                                    {isExpiringSoon && <AlertTriangle size={12} />}
                                                    {daysUntil <= 0 ? 'Due today' : `${daysUntil} days left`}
                                                </div>
                                            )}
                                            {sub.status === 'ACTIVE' && (
                                                <div className="sub-auto-renew-indicator">
                                                    {sub.autoRenew ? (
                                                        <span className="auto-renew-on"><CheckCircle size={11} /> Auto-renew ON</span>
                                                    ) : (
                                                        <span className="auto-renew-off"><XCircle size={11} /> Auto-renew OFF</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="subscription-actions">
                                            {/* If resource is deleted — disable all actions */}
                                            {isResourceDeleted ? (
                                                <span className="sub-deleted-label">No actions available</span>
                                            ) : (
                                                <>
                                                    {/* ACTIVE: show auto-renew toggle + cancel */}
                                                    {sub.status === 'ACTIVE' && (
                                                        <>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                onClick={() => handleToggleAutoRenew(sub.id, sub.autoRenew)}
                                                                disabled={actionLoading === sub.id}
                                                                title={sub.autoRenew ? 'Disable auto-renew' : 'Enable auto-renew'}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: sub.autoRenew ? 'var(--success-color)' : 'var(--text-muted)' }}
                                                            >
                                                                {sub.autoRenew ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                                <span style={{ fontSize: '0.75rem' }}>{sub.autoRenew ? 'Auto' : 'Manual'}</span>
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-ghost text-danger"
                                                                onClick={() => handleCancel(sub.id)}
                                                                disabled={actionLoading === sub.id}
                                                            >
                                                                <XCircle size={14} /> Cancel
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* PAUSED: show Renew button prominently */}
                                                    {sub.status === 'PAUSED' && (
                                                        <button
                                                            className="btn btn-sm btn-primary sub-renew-btn"
                                                            onClick={() => handleRenew(sub.id)}
                                                            disabled={actionLoading === sub.id}
                                                        >
                                                            <ArrowUpCircle size={14} /> Renew
                                                        </button>
                                                    )}

                                                    {/* CANCELLED: show only Renew button */}
                                                    {sub.status === 'CANCELLED' && (
                                                        <button
                                                            className="btn btn-sm btn-primary sub-renew-btn"
                                                            onClick={() => handleRenew(sub.id)}
                                                            disabled={actionLoading === sub.id}
                                                        >
                                                            <ArrowUpCircle size={14} /> Renew
                                                        </button>
                                                    )}
                                                </>
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
          transition: background 0.2s;
        }
        .subscription-item:last-child {
          border-bottom: none;
        }
        .subscription-item:hover {
          background: var(--bg-tertiary);
        }
        .subscription-item.paused {
          background: rgba(245, 158, 11, 0.04);
          border-left: 3px solid var(--warning-color);
        }
        .subscription-item.cancelled {
          opacity: 0.65;
          border-left: 3px solid var(--danger-color);
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
        .sub-last-billed {
          font-size: 0.72rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.2rem;
        }
        .sub-fail-info {
          font-size: 0.72rem;
          color: var(--warning-color);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.25rem;
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
        .sub-auto-renew-indicator {
          font-size: 0.7rem;
          margin-top: 0.15rem;
          display: flex;
          justify-content: flex-end;
        }
        .auto-renew-on {
          color: var(--success-color);
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }
        .auto-renew-off {
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }
        .subscription-actions {
          min-width: 130px;
          text-align: right;
          display: flex;
          gap: 0.375rem;
          justify-content: flex-end;
          align-items: center;
          flex-wrap: wrap;
        }
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.85rem;
        }
        .sub-renew-btn {
          animation: subtle-pulse 2s ease-in-out infinite;
        }
        @keyframes subtle-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 99, 102, 241), 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(var(--primary-rgb, 99, 102, 241), 0); }
        }
        .table {
          border-collapse: collapse;
        }
        .table th {
          text-align: left;
          padding: 0.75rem 1rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-color);
          font-size: 0.875rem;
        }
        .table tbody tr:hover {
          background: var(--bg-tertiary);
        }
        .table tbody tr:last-child td {
          border-bottom: none;
        }
        .subscription-item.resource-deleted {
          opacity: 0.45;
          border-left: 3px solid var(--text-muted);
          background: var(--bg-tertiary);
          pointer-events: none;
        }
        .subscription-item.resource-deleted .subscription-actions {
          pointer-events: auto;
        }
        .sub-resource-deleted {
          font-size: 0.72rem;
          color: var(--danger-color);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.2rem;
          font-weight: 600;
        }
        .sub-deleted-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-style: italic;
        }
      `}</style>
        </div>
    );
};

export default Subscriptions;

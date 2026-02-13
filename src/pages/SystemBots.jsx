import { useState, useEffect } from 'react';
import {
    Bot, CreditCard, Zap, AlertTriangle, Users, MessageSquare,
    CheckCircle, XCircle, ArrowRightLeft, Clock, DollarSign,
    Loader2, Shield, RefreshCw, X, Signal, Search
} from 'lucide-react';
import api from '../services/api';

const SystemBots = () => {
    const [bots, setBots] = useState([]);
    const [mySubs, setMySubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showSwitchModal, setShowSwitchModal] = useState(null);
    const [tab, setTab] = useState('available'); // available, my-subscriptions
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [botsRes, subsRes] = await Promise.all([
                api.get('/system-bots'),
                api.get('/system-bots/my-subscriptions')
            ]);
            setBots(botsRes.data.data || []);
            setMySubs(subsRes.data.data || []);
        } catch (err) {
            setError('Failed to load system bots');
        } finally {
            setLoading(false);
        }
    };

    const handleSubscribe = async (botId, botName, price) => {
        if (!window.confirm(`Subscribe to "${botName}" for $${price.toFixed(2)}/month? Amount will be deducted from your wallet.`)) return;
        try {
            setActionLoading(botId);
            const res = await api.post(`/system-bots/${botId}/subscribe`);
            setSuccess(res.data.message || `Subscribed to ${botName}!`);
            fetchData();
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to subscribe');
            setTimeout(() => setError(''), 5000);
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnsubscribe = async (botId, botName) => {
        if (!window.confirm(`Cancel your subscription to "${botName}"? You can still use it until your billing cycle ends.`)) return;
        try {
            setActionLoading(botId);
            await api.post(`/system-bots/${botId}/unsubscribe`);
            setSuccess('Subscription cancelled');
            fetchData();
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to unsubscribe');
            setTimeout(() => setError(''), 5000);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSwitch = async (currentBotId, newBotId) => {
        try {
            setActionLoading(currentBotId);
            const res = await api.post(`/system-bots/${currentBotId}/switch-number`, { newDeviceId: newBotId });
            setSuccess(res.data.message || 'Switched successfully!');
            setShowSwitchModal(null);
            fetchData();
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to switch');
            setTimeout(() => setError(''), 5000);
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'ACTIVE': return 'badge-success';
            case 'SUSPENDED': return 'badge-warning';
            case 'EXPIRED': case 'CANCELLED': return 'badge-error';
            default: return '';
        }
    };

    const activeSubCount = mySubs.filter(s => s.status === 'ACTIVE').length;

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading system bots...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><Bot size={28} /> System Bots</h1>
                    <p className="header-subtitle">Subscribe to platform-managed WhatsApp bots for your groups</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><Zap size={20} />{success}</div>}

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: '1.5rem' }}>
                <button
                    className={`tab ${tab === 'available' ? 'active' : ''}`}
                    onClick={() => setTab('available')}
                >
                    <Bot size={16} /> Available Bots ({bots.length})
                </button>
                <button
                    className={`tab ${tab === 'my-subscriptions' ? 'active' : ''}`}
                    onClick={() => setTab('my-subscriptions')}
                >
                    <CreditCard size={16} /> My Subscriptions ({activeSubCount})
                </button>
            </div>

            {tab === 'available' && (
                <>
                    {/* Info */}
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.04))', borderLeft: '4px solid var(--primary-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Shield size={20} style={{ color: 'var(--primary-color)' }} />
                            <div>
                                <strong>How it works:</strong> Subscribe to a system bot, then add it to your WhatsApp groups.
                                The bot processes commands (status, refill, cancel) for all group members.
                                Monthly fee is auto-deducted from your wallet.
                            </div>
                        </div>
                    </div>

                    {/* Bot Cards */}
                    {bots.length === 0 ? (
                        <div className="empty-state">
                            <Bot size={48} />
                            <h3>No System Bots Available</h3>
                            <p>Check back later for available bots.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <div className="search-box">
                                    <Search size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search bots by name..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="system-bots-grid">
                                {bots
                                    .filter(bot => !searchTerm || bot.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(bot => (
                                        <div key={bot.id} className={`system-bot-card ${bot.isSubscribed ? 'subscribed' : ''} ${bot.isFull ? 'full' : ''}`}>
                                            {bot.isSubscribed && (
                                                <div className="subscribed-badge">
                                                    <CheckCircle size={14} /> Subscribed
                                                </div>
                                            )}
                                            {bot.isFull && !bot.isSubscribed && (
                                                <div className="full-badge">
                                                    <XCircle size={14} /> Full
                                                </div>
                                            )}

                                            <div className="sbot-header">
                                                <div className="sbot-icon">
                                                    <Bot size={24} />
                                                </div>
                                                <div>
                                                    <h3>{bot.name}</h3>
                                                    <div className="sbot-phone">
                                                        <Signal size={12} style={{ color: '#10b981' }} />
                                                        {bot.phone || 'Not connected'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="sbot-price">
                                                <span className="price-currency">$</span>
                                                <span className="price-amount">{(bot.monthlyPrice || 0).toFixed(2)}</span>
                                                <span className="price-period">/month</span>
                                            </div>

                                            <div className="sbot-features">
                                                <div className="sbot-feature">
                                                    <MessageSquare size={14} />
                                                    <span>{bot.usageLimit ? `${bot.usageLimit.toLocaleString()} msgs/mo` : 'Unlimited messages'}</span>
                                                </div>
                                                <div className="sbot-feature">
                                                    <Users size={14} />
                                                    <span>
                                                        {bot.activeSubscribers}{bot.maxSubscribers ? `/${bot.maxSubscribers}` : ''} subscribers
                                                    </span>
                                                </div>
                                                <div className="sbot-feature">
                                                    <Shield size={14} />
                                                    <span>Group-only access</span>
                                                </div>
                                            </div>

                                            {bot.isSubscribed && bot.mySubscription && (
                                                <div className="sbot-my-usage">
                                                    <div className="usage-header">
                                                        <span>My Usage</span>
                                                        <span>{bot.mySubscription.usageCount}{bot.mySubscription.usageLimit ? `/${bot.mySubscription.usageLimit}` : ''}</span>
                                                    </div>
                                                    {bot.mySubscription.usageLimit && (
                                                        <div className="usage-bar">
                                                            <div
                                                                className="usage-fill"
                                                                style={{
                                                                    width: `${Math.min(100, (bot.mySubscription.usageCount / bot.mySubscription.usageLimit) * 100)}%`,
                                                                    background: bot.mySubscription.usageCount / bot.mySubscription.usageLimit > 0.8
                                                                        ? '#ef4444'
                                                                        : 'var(--primary-color)'
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    <small style={{ color: 'var(--text-secondary)' }}>
                                                        <Clock size={12} /> Next billing: {new Date(bot.mySubscription.nextBillingDate).toLocaleDateString()}
                                                    </small>
                                                </div>
                                            )}

                                            <div className="sbot-actions">
                                                {bot.isSubscribed ? (
                                                    <>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            style={{ flex: 1 }}
                                                            onClick={() => setShowSwitchModal(bot)}
                                                            disabled={actionLoading === bot.id}
                                                        >
                                                            <ArrowRightLeft size={14} /> Switch
                                                        </button>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            style={{ flex: 1 }}
                                                            onClick={() => handleUnsubscribe(bot.id, bot.name)}
                                                            disabled={actionLoading === bot.id}
                                                        >
                                                            {actionLoading === bot.id ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ width: '100%' }}
                                                        onClick={() => handleSubscribe(bot.id, bot.name, bot.monthlyPrice || 5)}
                                                        disabled={bot.isFull || actionLoading === bot.id}
                                                    >
                                                        {actionLoading === bot.id ? (
                                                            <><Loader2 size={14} className="spin" /> Processing...</>
                                                        ) : bot.isFull ? (
                                                            'Bot Full'
                                                        ) : (
                                                            <><CreditCard size={14} /> Subscribe — ${(bot.monthlyPrice || 5).toFixed(2)}/mo</>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </>
                    )}
                </>
            )}

            {tab === 'my-subscriptions' && (
                <>
                    {mySubs.length === 0 ? (
                        <div className="empty-state">
                            <CreditCard size={48} />
                            <h3>No Subscriptions</h3>
                            <p>You haven't subscribed to any system bots yet.</p>
                            <button className="btn btn-primary" onClick={() => setTab('available')}>
                                Browse Bots
                            </button>
                        </div>
                    ) : (
                        <div className="card">
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Bot</th>
                                            <th>Status</th>
                                            <th>Fee</th>
                                            <th>Usage</th>
                                            <th>Next Billing</th>
                                            <th>Auto-Renew</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mySubs.map(sub => (
                                            <tr key={sub.id}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Bot size={16} style={{ color: 'var(--primary-color)' }} />
                                                        <div>
                                                            <strong>{sub.device?.name || 'Unknown Bot'}</strong>
                                                            <br />
                                                            <small style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{sub.device?.phone || '—'}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${getStatusBadge(sub.status)}`}>
                                                        {sub.status}
                                                    </span>
                                                </td>
                                                <td><strong>${(sub.monthlyFee || 0).toFixed(2)}</strong></td>
                                                <td>
                                                    {sub.usageCount}{sub.usageLimit ? `/${sub.usageLimit}` : ''} msgs
                                                </td>
                                                <td>
                                                    <small>{new Date(sub.nextBillingDate).toLocaleDateString()}</small>
                                                </td>
                                                <td>
                                                    <span className={`badge ${sub.autoRenew ? 'badge-success' : 'badge-error'}`}>
                                                        {sub.autoRenew ? 'On' : 'Off'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {sub.status === 'ACTIVE' && (
                                                        <button
                                                            className="btn btn-ghost btn-sm text-danger"
                                                            onClick={() => handleUnsubscribe(sub.deviceId, sub.device?.name)}
                                                            disabled={actionLoading === sub.deviceId}
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Switch Modal */}
            {showSwitchModal && (
                <div className="modal-overlay open">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3><ArrowRightLeft size={20} /> Switch to Another Bot</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowSwitchModal(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                Select a new bot to switch to. Your remaining billing period transfers — no extra charge.
                            </p>
                            {bots
                                .filter(b => b.id !== showSwitchModal.id && !b.isSubscribed && !b.isFull)
                                .map(bot => (
                                    <div
                                        key={bot.id}
                                        className="switch-option"
                                        onClick={() => handleSwitch(showSwitchModal.id, bot.id)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <Bot size={20} style={{ color: 'var(--primary-color)' }} />
                                            <div>
                                                <strong>{bot.name}</strong>
                                                <br />
                                                <small style={{ color: 'var(--text-secondary)' }}>{bot.phone || 'Not connected'}</small>
                                            </div>
                                        </div>
                                        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>${(bot.monthlyPrice || 0).toFixed(2)}/mo</span>
                                    </div>
                                ))
                            }
                            {bots.filter(b => b.id !== showSwitchModal.id && !b.isSubscribed && !b.isFull).length === 0 && (
                                <div className="empty-state" style={{ padding: '2rem' }}>
                                    <p>No other bots available to switch to.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .system-bots-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 1.5rem;
                }
                .system-bot-card {
                    background: var(--bg-card);
                    border: 2px solid var(--border-color);
                    border-radius: 16px;
                    padding: 1.5rem;
                    position: relative;
                    transition: all 0.3s ease;
                    display: flex;
                    flex-direction: column;
                }
                .system-bot-card:hover {
                    border-color: var(--primary-color);
                    transform: translateY(-3px);
                    box-shadow: 0 8px 25px rgba(99, 102, 241, 0.15);
                }
                .system-bot-card.subscribed {
                    border-color: #10b981;
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), transparent);
                }
                .system-bot-card.full:not(.subscribed) {
                    opacity: 0.65;
                }
                .subscribed-badge {
                    position: absolute;
                    top: -10px;
                    right: 15px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    padding: 0.2rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .full-badge {
                    position: absolute;
                    top: -10px;
                    right: 15px;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                    padding: 0.2rem 0.75rem;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .sbot-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 1rem;
                }
                .sbot-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-color);
                }
                .sbot-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                }
                .sbot-phone {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    font-family: monospace;
                }
                .sbot-price {
                    display: flex;
                    align-items: flex-end;
                    gap: 0.15rem;
                    margin-bottom: 1rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .price-currency {
                    font-size: 1.25rem;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }
                .price-amount {
                    font-size: 2rem;
                    font-weight: 700;
                    color: var(--primary-color);
                    line-height: 1;
                }
                .price-period {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }
                .sbot-features {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                .sbot-feature {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                }
                .sbot-my-usage {
                    background: rgba(99, 102, 241, 0.06);
                    border-radius: 10px;
                    padding: 0.75rem;
                    margin-bottom: 1rem;
                }
                .usage-header {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.85rem;
                    margin-bottom: 0.5rem;
                }
                .usage-bar {
                    height: 6px;
                    background: var(--border-color);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 0.5rem;
                }
                .usage-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.5s ease;
                }
                .sbot-actions {
                    display: flex;
                    gap: 0.5rem;
                    margin-top: auto;
                }
                .switch-option {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 1rem;
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    margin-bottom: 0.75rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .switch-option:hover {
                    background: rgba(99, 102, 241, 0.06);
                    border-color: var(--primary-color);
                }
                .tabs {
                    display: flex;
                    gap: 0.5rem;
                    border-bottom: 2px solid var(--border-color);
                    padding-bottom: 0;
                }
                .tab {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1.25rem;
                    border: none;
                    background: none;
                    color: var(--text-secondary);
                    font-size: 0.95rem;
                    cursor: pointer;
                    border-bottom: 3px solid transparent;
                    margin-bottom: -2px;
                    transition: all 0.2s ease;
                }
                .tab:hover {
                    color: var(--text-primary);
                }
                .tab.active {
                    color: var(--primary-color);
                    border-bottom-color: var(--primary-color);
                    font-weight: 600;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default SystemBots;

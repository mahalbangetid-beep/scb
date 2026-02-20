import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bot, CreditCard, AlertTriangle, Users, MessageSquare,
    CheckCircle, XCircle, Clock,
    Loader2, Shield, RefreshCw, X, Signal, Search, Plus,
    Trash2, PlayCircle, Radio, Headphones, ArrowRightLeft
} from 'lucide-react';
import api from '../services/api';

const SystemBots = () => {
    const navigate = useNavigate();
    const [bots, setBots] = useState([]);
    const [mySubs, setMySubs] = useState([]);
    const [supportGroups, setSupportGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showSwitchModal, setShowSwitchModal] = useState(null);
    const [showAssignModal, setShowAssignModal] = useState(null); // { sub, deviceId }
    const [tab, setTab] = useState('available'); // available, my-subscriptions
    const [searchTerm, setSearchTerm] = useState('');

    // Auto-dismiss toasts
    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(''), 5000);
            return () => clearTimeout(t);
        }
    }, [error]);
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(''), 4000);
            return () => clearTimeout(t);
        }
    }, [success]);

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
            setBots(botsRes.data || []);
            setMySubs(subsRes.data || []);
        } catch (err) {
            setError('Failed to load system bots');
        } finally {
            setLoading(false);
        }
    };

    const fetchSupportGroups = async () => {
        try {
            const res = await api.get('/support-groups/for/support');
            setSupportGroups(res.data || []);
        } catch (err) {
            console.error('Failed to fetch support groups:', err);
        }
    };

    const handleSubscribe = async (botId, botName, price) => {
        if (!window.confirm(`Subscribe to "${botName}" for $${price.toFixed(2)}/month? Amount will be deducted from your wallet.`)) return;
        try {
            setActionLoading(botId);
            const res = await api.post(`/system-bots/${botId}/subscribe`);
            setSuccess(res.message || `Subscribed to ${botName}!`);
            fetchData();
        } catch (err) {
            const errorMsg = err.error?.message || err.message || 'Failed to subscribe';
            // Per spec 12.2: If System Bot activated → redirect to payment page
            if (errorMsg.toLowerCase().includes('insufficient balance')) {
                setError(`${errorMsg} — Redirecting to Wallet...`);
                setTimeout(() => navigate('/wallet'), 2000);
            } else {
                setError(errorMsg);
            }
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
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to unsubscribe');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSwitch = async (currentBotId, newBotId) => {
        const confirmed = window.confirm(
            '⚠️ WARNING: If you switch this System Bot number, you must add the new number to all linked support groups. Otherwise, the bot will not function in those groups.\n\nAre you sure you want to switch?'
        );
        if (!confirmed) return;
        try {
            setActionLoading(currentBotId);
            const res = await api.post(`/system-bots/${currentBotId}/switch-number`, { newDeviceId: newBotId });
            setSuccess(res.message || 'Switched successfully!');
            setShowSwitchModal(null);
            fetchData();
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to switch');
        } finally {
            setActionLoading(null);
        }
    };

    const handleAssignGroup = async (deviceId, groupJid, groupName) => {
        try {
            setActionLoading(`assign-${groupJid}`);
            await api.post(`/system-bots/${deviceId}/assign-group`, { groupJid, groupName });
            setSuccess(`Group "${groupName}" assigned. Click Test to activate.`);
            setShowAssignModal(null);
            fetchData();
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to assign group');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemoveGroup = async (deviceId, groupId, groupName) => {
        if (!window.confirm(`Remove "${groupName}" from this bot?`)) return;
        try {
            setActionLoading(`remove-${groupId}`);
            await api.delete(`/system-bots/${deviceId}/remove-group/${groupId}`);
            setSuccess('Group removed');
            fetchData();
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to remove group');
        } finally {
            setActionLoading(null);
        }
    };

    const handleTestGroup = async (deviceId, groupId, groupName) => {
        try {
            setActionLoading(`test-${groupId}`);
            const res = await api.post(`/system-bots/${deviceId}/test-group/${groupId}`);
            setSuccess(res.message || `Test successful in "${groupName}"!`);
            fetchData();
        } catch (err) {
            setError(err.error?.message || err.message || 'Test failed — bot may not be in the group');
        } finally {
            setActionLoading(null);
        }
    };

    const openAssignModal = async (sub) => {
        setShowAssignModal(sub);
        await fetchSupportGroups();
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
            {/* Toasts */}
            {error && (
                <div className="toast toast-error" style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
                    <AlertTriangle size={18} /><span>{error}</span>
                    <button onClick={() => setError('')}><X size={14} /></button>
                </div>
            )}
            {success && (
                <div className="toast toast-success" style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
                    <CheckCircle size={18} /><span>{success}</span>
                    <button onClick={() => setSuccess('')}><X size={14} /></button>
                </div>
            )}

            <div className="page-header">
                <div className="header-content">
                    <h1><Bot size={28} /> System Bot Support</h1>
                    <p className="header-subtitle">Subscribe to platform-managed bots for your support groups</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

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
                    <Headphones size={16} /> My Connections ({activeSubCount})
                </button>
            </div>

            {/* ==================== AVAILABLE BOTS TAB ==================== */}
            {tab === 'available' && (
                <>
                    {/* Info Banner */}
                    <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.04))', borderLeft: '4px solid var(--primary-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Shield size={20} style={{ color: 'var(--primary-color)' }} />
                            <div>
                                <strong>How it works:</strong> Subscribe to a system bot → assign your support groups → click <em>Test</em> to verify the bot is in the group → bot starts responding to commands.
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
                                                    <span>Support groups only</span>
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
                                                            <div className="usage-fill" style={{
                                                                width: `${Math.min(100, (bot.mySubscription.usageCount / bot.mySubscription.usageLimit) * 100)}%`,
                                                                background: bot.mySubscription.usageCount / bot.mySubscription.usageLimit > 0.8 ? '#ef4444' : 'var(--primary-color)'
                                                            }} />
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

            {/* ==================== MY CONNECTIONS TAB (Section 11 List View) ==================== */}
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
                        <div className="subs-list">
                            {mySubs.map(sub => (
                                <div key={sub.id} className={`sub-card ${sub.status !== 'ACTIVE' ? 'sub-inactive' : ''}`}>
                                    {/* Sub Header */}
                                    <div className="sub-header">
                                        <div className="sub-bot-info">
                                            <div className="sbot-icon-sm">
                                                <Bot size={20} />
                                            </div>
                                            <div>
                                                <h3>{sub.device?.name || 'Unknown Bot'}</h3>
                                                <div className="sub-meta">
                                                    <span className="sbot-phone-sm">
                                                        <Signal size={11} style={{ color: sub.device?.status === 'connected' ? '#10b981' : '#ef4444' }} />
                                                        {sub.device?.phone || '—'}
                                                    </span>
                                                    <span className={`badge ${getStatusBadge(sub.status)}`}>{sub.status}</span>
                                                    <span className="sub-fee">${(sub.monthlyFee || 0).toFixed(2)}/mo</span>
                                                    <span className="sub-billing">
                                                        <Clock size={12} /> Next: {new Date(sub.nextBillingDate).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="sub-header-actions">
                                            {sub.status === 'ACTIVE' && (
                                                <>
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => openAssignModal(sub)}
                                                    >
                                                        <Plus size={14} /> Add Group
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => setShowSwitchModal({ id: sub.deviceId, name: sub.device?.name })}
                                                    >
                                                        <ArrowRightLeft size={14} /> Switch
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm text-danger"
                                                        onClick={() => handleUnsubscribe(sub.deviceId, sub.device?.name)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Slot Details Panel (Bug 2.2) */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                        gap: '8px',
                                        padding: '12px 16px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '8px',
                                        margin: '8px 0',
                                        fontSize: '0.78rem'
                                    }}>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Slot</div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                🎫 Slot #{mySubs.indexOf(sub) + 1}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Start Date</div>
                                            <div style={{ color: 'var(--text-primary)' }}>
                                                {sub.startDate ? new Date(sub.startDate).toLocaleDateString() : '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Next Billing</div>
                                            <div style={{ color: 'var(--text-primary)' }}>
                                                {sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString() : '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Remaining</div>
                                            <div style={{
                                                fontWeight: 600, color: (() => {
                                                    if (!sub.nextBillingDate) return 'var(--text-primary)';
                                                    const days = Math.max(0, Math.ceil((new Date(sub.nextBillingDate) - new Date()) / (1000 * 60 * 60 * 24)));
                                                    return days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#10b981';
                                                })()
                                            }}>
                                                {sub.nextBillingDate
                                                    ? `${Math.max(0, Math.ceil((new Date(sub.nextBillingDate) - new Date()) / (1000 * 60 * 60 * 24)))} days`
                                                    : '—'
                                                }
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Usage</div>
                                            <div style={{ color: 'var(--text-primary)' }}>
                                                {sub.usageCount || 0}{sub.usageLimit ? ` / ${sub.usageLimit}` : ' / ∞'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Auto-Renew</div>
                                            <div style={{ color: sub.autoRenew ? '#10b981' : '#ef4444' }}>
                                                {sub.autoRenew ? '✅ On' : '❌ Off'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Assigned Groups Table — Section 11 List View */}
                                    <div className="sub-groups">
                                        {(!sub.assignedGroups || sub.assignedGroups.length === 0) ? (
                                            <div className="no-groups-msg">
                                                <Headphones size={20} />
                                                <span>No support groups assigned yet.</span>
                                                {sub.status === 'ACTIVE' && (
                                                    <button className="btn btn-primary btn-sm" onClick={() => openAssignModal(sub)}>
                                                        <Plus size={14} /> Assign Group
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <table className="groups-table">
                                                <thead>
                                                    <tr>
                                                        <th>Group ID (Group Name)</th>
                                                        <th>WhatsApp</th>
                                                        <th>Status</th>
                                                        <th>Tested</th>
                                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sub.assignedGroups.map(group => (
                                                        <tr key={group.id} className={group.isActive ? 'row-active' : 'row-pending'}>
                                                            <td>
                                                                <div className="group-cell">
                                                                    <span className="group-jid">{group.groupJid.replace('@g.us', '')}</span>
                                                                    <span className="group-name">({group.groupName})</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span className="wa-badge">
                                                                    <Signal size={12} />
                                                                    {sub.device?.phone || '—'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {group.isActive ? (
                                                                    <span className="badge badge-success"><Radio size={12} /> Active</span>
                                                                ) : (
                                                                    <span className="badge badge-warning">Pending Test</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                {group.isTested ? (
                                                                    <span className="tested-info">
                                                                        <CheckCircle size={14} style={{ color: '#10b981' }} />
                                                                        {group.testedAt && <small>{new Date(group.testedAt).toLocaleDateString()}</small>}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <div className="group-actions">
                                                                    <button
                                                                        className={`btn btn-sm ${group.isTested ? 'btn-secondary' : 'btn-primary'}`}
                                                                        onClick={() => handleTestGroup(sub.deviceId, group.id, group.groupName)}
                                                                        disabled={actionLoading === `test-${group.id}` || sub.status !== 'ACTIVE'}
                                                                        title={group.isTested ? 'Re-test bot in group' : 'Test bot — required before activation'}
                                                                    >
                                                                        {actionLoading === `test-${group.id}` ? (
                                                                            <Loader2 size={14} className="spin" />
                                                                        ) : (
                                                                            <PlayCircle size={14} />
                                                                        )}
                                                                        {group.isTested ? 'Re-test' : 'Test'}
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-ghost btn-sm text-danger"
                                                                        onClick={() => handleRemoveGroup(sub.deviceId, group.id, group.groupName)}
                                                                        disabled={actionLoading === `remove-${group.id}`}
                                                                        title="Remove group"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ==================== SWITCH MODAL ==================== */}
            {showSwitchModal && (
                <div className="modal-overlay open" onClick={() => setShowSwitchModal(null)}>
                    <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><ArrowRightLeft size={20} /> Switch to Another Bot</h3>
                            <button className="modal-close" onClick={() => setShowSwitchModal(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                marginBottom: '1rem',
                                fontSize: '0.82rem',
                                color: '#b45309',
                                lineHeight: 1.5
                            }}>
                                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <strong>Important:</strong> If you switch this System Bot number, you must add the new number to all linked support groups. Otherwise, the bot will not function in those groups.
                                </div>
                            </div>
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

            {/* ==================== ASSIGN GROUP MODAL ==================== */}
            {showAssignModal && (
                <div className="modal-overlay open" onClick={() => setShowAssignModal(null)}>
                    <div className="modal" style={{ maxWidth: '550px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><Plus size={20} /> Assign Support Group</h3>
                            <button className="modal-close" onClick={() => setShowAssignModal(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                Select a support group to assign to <strong>{showAssignModal.device?.name}</strong>.
                                After assigning, you must <em>Test</em> the bot in the group before it activates.
                            </p>

                            {supportGroups.length === 0 ? (
                                <div className="empty-state" style={{ padding: '2rem' }}>
                                    <Headphones size={32} />
                                    <p>No support groups found. Add groups in the Support Groups page first.</p>
                                </div>
                            ) : (
                                <div className="assign-group-list">
                                    {supportGroups
                                        .filter(g => {
                                            // Hide already assigned groups
                                            const alreadyAssigned = (showAssignModal.assignedGroups || [])
                                                .some(ag => ag.groupJid === g.groupJid);
                                            return !alreadyAssigned;
                                        })
                                        .map(group => (
                                            <div
                                                key={group.id}
                                                className="assign-group-item"
                                                onClick={() => handleAssignGroup(showAssignModal.deviceId, group.groupJid, group.groupName)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                                    <Headphones size={18} style={{ color: '#3b82f6' }} />
                                                    <div>
                                                        <strong>{group.groupName}</strong>
                                                        <br />
                                                        <small style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                                            {group.groupJid}
                                                        </small>
                                                    </div>
                                                </div>
                                                {actionLoading === `assign-${group.groupJid}` ? (
                                                    <Loader2 size={16} className="spin" />
                                                ) : (
                                                    <Plus size={18} style={{ color: 'var(--primary-color)' }} />
                                                )}
                                            </div>
                                        ))
                                    }
                                    {supportGroups.filter(g => !(showAssignModal.assignedGroups || []).some(ag => ag.groupJid === g.groupJid)).length === 0 && (
                                        <div className="empty-state" style={{ padding: '1.5rem' }}>
                                            <p>All support groups are already assigned.</p>
                                        </div>
                                    )}
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
                .system-bot-card.full:not(.subscribed) { opacity: 0.65; }
                .subscribed-badge {
                    position: absolute; top: -10px; right: 15px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white; padding: 0.2rem 0.75rem; border-radius: 20px;
                    font-size: 0.75rem; font-weight: 600;
                    display: flex; align-items: center; gap: 0.25rem;
                }
                .full-badge {
                    position: absolute; top: -10px; right: 15px;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white; padding: 0.2rem 0.75rem; border-radius: 20px;
                    font-size: 0.75rem; font-weight: 600;
                    display: flex; align-items: center; gap: 0.25rem;
                }
                .sbot-header {
                    display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;
                }
                .sbot-icon {
                    width: 48px; height: 48px; border-radius: 12px;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
                    display: flex; align-items: center; justify-content: center;
                    color: var(--primary-color);
                }
                .sbot-icon-sm {
                    width: 40px; height: 40px; border-radius: 10px;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
                    display: flex; align-items: center; justify-content: center;
                    color: var(--primary-color); flex-shrink: 0;
                }
                .sbot-header h3, .sub-header h3 { margin: 0; font-size: 1.1rem; }
                .sbot-phone, .sbot-phone-sm {
                    display: flex; align-items: center; gap: 0.25rem;
                    font-size: 0.85rem; color: var(--text-secondary); font-family: monospace;
                }
                .sbot-price {
                    display: flex; align-items: flex-end; gap: 0.15rem;
                    margin-bottom: 1rem; padding-bottom: 1rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .price-currency { font-size: 1.25rem; color: var(--text-secondary); margin-bottom: 4px; }
                .price-amount { font-size: 2rem; font-weight: 700; color: var(--primary-color); line-height: 1; }
                .price-period { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; }
                .sbot-features { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
                .sbot-feature { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); }
                .sbot-my-usage {
                    background: rgba(99, 102, 241, 0.06); border-radius: 10px;
                    padding: 0.75rem; margin-bottom: 1rem;
                }
                .usage-header { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem; }
                .usage-bar { height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; margin-bottom: 0.5rem; }
                .usage-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
                .sbot-actions { display: flex; gap: 0.5rem; margin-top: auto; }

                /* ==================== MY CONNECTIONS TAB ==================== */
                .subs-list { display: flex; flex-direction: column; gap: 1.5rem; }
                .sub-card {
                    background: var(--bg-card); border: 2px solid var(--border-color);
                    border-radius: 16px; overflow: hidden;
                    transition: all 0.3s ease;
                }
                .sub-card:hover { border-color: rgba(99, 102, 241, 0.3); }
                .sub-card.sub-inactive { opacity: 0.6; }
                .sub-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 1.25rem 1.5rem;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.04), rgba(168, 85, 247, 0.02));
                    border-bottom: 1px solid var(--border-color);
                    flex-wrap: wrap; gap: 1rem;
                }
                .sub-bot-info { display: flex; align-items: center; gap: 0.75rem; }
                .sub-meta {
                    display: flex; align-items: center; gap: 0.75rem;
                    margin-top: 0.25rem; flex-wrap: wrap;
                }
                .sub-fee { font-weight: 600; color: var(--primary-color); font-size: 0.85rem; }
                .sub-billing { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; color: var(--text-secondary); }
                .sub-header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

                /* Groups Table */
                .sub-groups { padding: 0; }
                .no-groups-msg {
                    display: flex; align-items: center; gap: 0.75rem;
                    padding: 1.5rem; color: var(--text-secondary);
                    justify-content: center;
                }
                .groups-table {
                    width: 100%; border-collapse: collapse;
                }
                .groups-table th {
                    text-align: left; padding: 0.75rem 1.5rem;
                    font-size: 0.8rem; text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--text-secondary);
                    background: rgba(99, 102, 241, 0.03);
                    border-bottom: 1px solid var(--border-color);
                    font-weight: 600;
                }
                .groups-table td {
                    padding: 0.75rem 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 0.9rem;
                }
                .groups-table tr:last-child td { border-bottom: none; }
                .groups-table tr.row-active { background: rgba(16, 185, 129, 0.03); }
                .groups-table tr.row-pending { background: rgba(245, 158, 11, 0.03); }
                .groups-table tr:hover { background: rgba(99, 102, 241, 0.04); }

                .group-cell { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
                .group-jid { font-family: monospace; font-size: 0.85rem; color: var(--text-primary); font-weight: 600; }
                .group-name { color: var(--text-secondary); font-size: 0.85rem; }
                .wa-badge {
                    display: inline-flex; align-items: center; gap: 0.35rem;
                    background: rgba(37, 211, 102, 0.1); color: #25d366;
                    padding: 0.2rem 0.6rem; border-radius: 6px;
                    font-family: monospace; font-size: 0.8rem;
                }
                .tested-info { display: flex; align-items: center; gap: 0.35rem; }
                .tested-info small { color: var(--text-secondary); }
                .group-actions { display: flex; gap: 0.35rem; justify-content: flex-end; }

                /* Assign Group Modal */
                .assign-group-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 400px; overflow-y: auto; }
                .assign-group-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0.85rem 1rem; border: 1px solid var(--border-color);
                    border-radius: 10px; cursor: pointer; transition: all 0.2s ease;
                }
                .assign-group-item:hover {
                    background: rgba(99, 102, 241, 0.06);
                    border-color: var(--primary-color);
                }

                /* Switch Modal */
                .switch-option {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 1rem; border: 1px solid var(--border-color);
                    border-radius: 10px; margin-bottom: 0.75rem;
                    cursor: pointer; transition: all 0.2s ease;
                }
                .switch-option:hover {
                    background: rgba(99, 102, 241, 0.06);
                    border-color: var(--primary-color);
                }

                /* Tabs */
                .tabs { display: flex; gap: 0.5rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0; }
                .tab {
                    display: flex; align-items: center; gap: 0.5rem;
                    padding: 0.75rem 1.25rem; border: none; background: none;
                    color: var(--text-secondary); font-size: 0.95rem;
                    cursor: pointer; border-bottom: 3px solid transparent;
                    margin-bottom: -2px; transition: all 0.2s ease;
                }
                .tab:hover { color: var(--text-primary); }
                .tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 600; }

                /* Toast */
                .toast {
                    display: flex; align-items: center; gap: 0.75rem;
                    padding: 0.85rem 1.25rem; border-radius: 10px;
                    font-size: 0.9rem; box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                    animation: slideIn 0.3s ease;
                    max-width: 450px;
                }
                .toast button {
                    background: none; border: none; cursor: pointer;
                    color: inherit; opacity: 0.7; margin-left: auto;
                }
                .toast-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
                .toast-success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }

                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }

                @media (max-width: 768px) {
                    .sub-header { flex-direction: column; align-items: flex-start; }
                    .sub-header-actions { width: 100%; }
                    .groups-table { display: block; overflow-x: auto; }
                }
            `}</style>
        </div>
    );
};

export default SystemBots;

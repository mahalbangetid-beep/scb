import { useState, useEffect } from 'react';
import {
    Bot, Plus, Edit2, Trash2, Users, DollarSign, Signal, SignalZero,
    QrCode, RefreshCw, AlertTriangle, Zap, MessageSquare, Settings,
    X, Shield, Loader2, Eye, Clock, Search
} from 'lucide-react';
import api from '../../services/api';

const SystemBotManagement = () => {
    const [bots, setBots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showSubsModal, setShowSubsModal] = useState(null);
    const [subscribers, setSubscribers] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        monthlyPrice: '5.00',
        usageLimit: '',
        maxSubscribers: ''
    });

    useEffect(() => {
        fetchBots();
    }, []);

    const fetchBots = async () => {
        try {
            setLoading(true);
            const res = await api.get('/system-bots/admin/list');
            setBots(res.data || []);
        } catch (err) {
            setError('Failed to load system bots');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = {
                name: formData.name,
                monthlyPrice: parseFloat(formData.monthlyPrice) || 5.00,
                usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
                maxSubscribers: formData.maxSubscribers ? parseInt(formData.maxSubscribers) : null
            };

            if (editingItem) {
                await api.put(`/system-bots/admin/${editingItem.id}`, data);
                setSuccess('System bot updated');
            } else {
                await api.post('/system-bots/admin/create', data);
                setSuccess('System bot created! Scan QR to connect.');
            }
            setShowModal(false);
            setEditingItem(null);
            resetForm();
            fetchBots();
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save');
            setTimeout(() => setError(''), 5000);
        }
    };

    const handleEdit = (bot) => {
        setEditingItem(bot);
        setFormData({
            name: bot.name,
            monthlyPrice: (bot.systemBotPrice || 5).toString(),
            usageLimit: bot.usageLimit ? bot.usageLimit.toString() : '',
            maxSubscribers: bot.maxSubscribers ? bot.maxSubscribers.toString() : ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete system bot "${name}"? All subscriptions will be cancelled.`)) return;
        try {
            await api.delete(`/system-bots/admin/${id}`);
            setSuccess('System bot deleted');
            fetchBots();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to delete');
            setTimeout(() => setError(''), 3000);
        }
    };

    const handleViewSubscribers = async (botId) => {
        try {
            const res = await api.get(`/system-bots/admin/${botId}/subscribers`);
            setSubscribers(res.data || []);
            setShowSubsModal(botId);
        } catch (err) {
            setError('Failed to load subscribers');
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            monthlyPrice: '5.00',
            usageLimit: '',
            maxSubscribers: ''
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'connected': return 'badge-success';
            case 'connecting': return 'badge-warning';
            default: return 'badge-error';
        }
    };

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
                    <h1><Bot size={28} /> System Bot Management</h1>
                    <p className="header-subtitle">Manage platform-owned shared WhatsApp bots</p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                    <Plus size={16} /> Add System Bot
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><Zap size={20} />{success}</div>}

            {/* Info Banner */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.05))', borderLeft: '4px solid var(--primary-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Shield size={20} style={{ color: 'var(--primary-color)' }} />
                    <div>
                        <strong>System Bots</strong> are platform-owned WhatsApp devices shared across users via subscriptions.
                        They only respond in groups, have usage limits, and auto-renew from user wallets.
                    </div>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                    { label: 'Total Bots', value: bots.length, icon: Bot, color: '#6366f1' },
                    { label: 'Online', value: bots.filter(b => b.status === 'connected').length, icon: Signal, color: '#10b981' },
                    { label: 'Total Subscribers', value: bots.reduce((s, b) => s + (b.subscriberCount || 0), 0), icon: Users, color: '#f59e0b' },
                    { label: 'Revenue/mo', value: `$${bots.reduce((s, b) => s + (b.subscriberCount || 0) * (b.systemBotPrice || 0), 0).toFixed(2)}`, icon: DollarSign, color: '#ec4899' }
                ].map((stat, i) => (
                    <div key={i} className="stat-card" style={{ borderTop: `3px solid ${stat.color}` }}>
                        <div className="stat-info">
                            <span className="stat-label">{stat.label}</span>
                            <span className="stat-value">{stat.value}</span>
                        </div>
                        <div className="stat-icon" style={{ color: stat.color }}>
                            <stat.icon size={24} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Bots Table */}
            {bots.length === 0 ? (
                <div className="empty-state">
                    <Bot size={48} />
                    <h3>No System Bots</h3>
                    <p>Create your first system bot to allow users to subscribe.</p>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                        <Plus size={16} /> Create System Bot
                    </button>
                </div>
            ) : (
                <>
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <div className="search-box">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Search bots by name or phone..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="card">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Bot Name</th>
                                        <th>Phone</th>
                                        <th>Status</th>
                                        <th>Price/mo</th>
                                        <th>Usage Limit</th>
                                        <th>Subscribers</th>
                                        <th>Group Only</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bots
                                        .filter(bot => !searchTerm || bot.name.toLowerCase().includes(searchTerm.toLowerCase()) || (bot.phone && bot.phone.includes(searchTerm)))
                                        .map(bot => (
                                            <tr key={bot.id}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Bot size={16} style={{ color: 'var(--primary-color)' }} />
                                                        <strong>{bot.name}</strong>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ fontFamily: 'monospace' }}>{bot.phone || '—'}</span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${getStatusColor(bot.status)}`}>
                                                        {bot.status === 'connected' ? <Signal size={12} /> : <SignalZero size={12} />}
                                                        {bot.status}
                                                    </span>
                                                </td>
                                                <td><strong>${(bot.systemBotPrice || 0).toFixed(2)}</strong></td>
                                                <td>
                                                    {bot.usageLimit ? (
                                                        <span>{bot.usageLimit.toLocaleString()} msgs</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-secondary)' }}>Unlimited</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => handleViewSubscribers(bot.id)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                    >
                                                        <Users size={14} />
                                                        {bot.subscriberCount || 0}
                                                        {bot.maxSubscribers ? `/${bot.maxSubscribers}` : ''}
                                                    </button>
                                                </td>
                                                <td>
                                                    <span className={`badge ${bot.groupOnly ? 'badge-info' : 'badge-warning'}`}>
                                                        {bot.groupOnly ? 'Yes' : 'No'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleEdit(bot)} title="Edit">
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon btn-sm text-danger" onClick={() => handleDelete(bot.id, bot.name)} title="Delete">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingItem ? 'Edit' : 'Create'} System Bot</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Bot Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Support Bot #1"
                                        required
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Monthly Price ($) *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.monthlyPrice}
                                            onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })}
                                            step="0.01"
                                            min="0"
                                            required
                                        />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Usage Limit (msgs)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.usageLimit}
                                            onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                                            placeholder="Unlimited"
                                            min="1"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Max Subscribers</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.maxSubscribers}
                                        onChange={(e) => setFormData({ ...formData, maxSubscribers: e.target.value })}
                                        placeholder="Unlimited"
                                        min="1"
                                    />
                                    <small style={{ color: 'var(--text-secondary)' }}>Leave empty for unlimited subscribers</small>
                                </div>

                                <div className="card" style={{ padding: '0.75rem 1rem', marginTop: '0.5rem', background: 'rgba(99, 102, 241, 0.08)' }}>
                                    <small style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                                        <Shield size={14} />
                                        System bots are automatically set to <strong>Group-Only</strong> mode.
                                        {!editingItem && ' A QR code will be generated after creation.'}
                                    </small>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingItem ? 'Update Bot' : 'Create Bot'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Subscribers Modal */}
            {showSubsModal && (
                <div className="modal-overlay open" onClick={() => setShowSubsModal(null)}>
                    <div className="modal" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><Users size={20} /> Subscribers</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowSubsModal(null)}><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            {subscribers.length === 0 ? (
                                <div className="empty-state" style={{ padding: '2rem' }}>
                                    <Users size={32} />
                                    <p>No subscribers yet</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>User</th>
                                                <th>Status</th>
                                                <th>Usage</th>
                                                <th>Next Billing</th>
                                                <th>Auto-Renew</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {subscribers.map(sub => (
                                                <tr key={sub.id}>
                                                    <td>
                                                        <div>
                                                            <strong>{sub.user?.username || sub.user?.name}</strong>
                                                            <br />
                                                            <small style={{ color: 'var(--text-secondary)' }}>{sub.user?.email}</small>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${sub.status === 'ACTIVE' ? 'badge-success' : sub.status === 'SUSPENDED' ? 'badge-warning' : 'badge-error'}`}>
                                                            {sub.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {sub.usageCount}{sub.usageLimit ? `/${sub.usageLimit}` : ''} msgs
                                                    </td>
                                                    <td>
                                                        <small>{new Date(sub.nextBillingDate).toLocaleDateString()}</small>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${sub.autoRenew ? 'badge-success' : 'badge-error'}`}>
                                                            {sub.autoRenew ? 'Yes' : 'No'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemBotManagement;

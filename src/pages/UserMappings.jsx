import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, UserCheck, UserX, Phone, Shield, AlertTriangle, Zap, X, RefreshCw, Search, ToggleRight, ToggleLeft, MessageSquare } from 'lucide-react';
import api from '../services/api';

const UserMappings = () => {
    const [mappings, setMappings] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [formData, setFormData] = useState({
        panelUsername: '',
        panelEmail: '',
        panelUserId: '',
        whatsappNumbers: '',
        groupIds: '',
        isBotEnabled: true,
        adminNotes: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [mappingsRes, statsRes] = await Promise.all([
                api.get('/user-mappings'),
                api.get('/user-mappings/stats')
            ]);
            // API might return data directly or wrapped in .data
            const mappingsData = mappingsRes.data?.data || mappingsRes.data || [];
            const statsData = statsRes.data?.data || statsRes.data;
            setMappings(Array.isArray(mappingsData) ? mappingsData : []);
            setStats(statsData);
        } catch (err) {
            setError('Failed to load user mappings');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                whatsappNumbers: formData.whatsappNumbers.split(',').map(n => n.trim()).filter(n => n),
                groupIds: formData.groupIds.split(',').map(g => g.trim()).filter(g => g)
            };

            if (editingItem) {
                await api.put(`/user-mappings/${editingItem.id}`, payload);
                setSuccess('User mapping updated');
            } else {
                await api.post('/user-mappings', payload);
                setSuccess('User mapping created');
            }
            setShowModal(false);
            setEditingItem(null);
            resetForm();
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save');
        }
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            panelUsername: item.panelUsername,
            panelEmail: item.panelEmail || '',
            panelUserId: item.panelUserId || '',
            whatsappNumbers: (item.whatsappNumbers || []).join(', '),
            groupIds: (item.groupIds || []).join(', '),
            isBotEnabled: item.isBotEnabled,
            adminNotes: item.adminNotes || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this user mapping?')) return;
        try {
            await api.delete(`/user-mappings/${id}`);
            setSuccess('User mapping deleted');
            fetchData();
        } catch (err) {
            setError('Failed to delete');
        }
    };

    const handleToggleBot = async (id) => {
        try {
            await api.post(`/user-mappings/${id}/toggle-bot`);
            fetchData();
        } catch (err) {
            setError('Failed to toggle bot');
        }
    };

    const handleSuspend = async (id) => {
        if (!window.confirm('Suspend this user? Bot will stop responding to them.')) return;
        try {
            await api.post(`/user-mappings/${id}/suspend`);
            setSuccess('User suspended');
            fetchData();
        } catch (err) {
            setError('Failed to suspend');
        }
    };

    const handleUnsuspend = async (id) => {
        try {
            await api.post(`/user-mappings/${id}/unsuspend`);
            setSuccess('User unsuspended');
            fetchData();
        } catch (err) {
            setError('Failed to unsuspend');
        }
    };

    const resetForm = () => {
        setFormData({
            panelUsername: '',
            panelEmail: '',
            panelUserId: '',
            whatsappNumbers: '',
            groupIds: '',
            isBotEnabled: true,
            adminNotes: ''
        });
    };

    const filteredMappings = mappings.filter(m => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return m.panelUsername?.toLowerCase().includes(query) ||
            m.panelEmail?.toLowerCase().includes(query) ||
            m.whatsappNumbers?.some(n => n.includes(query));
    });

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading user mappings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="user-mappings-page">
            <div className="page-header">
                <div className="header-content">
                    <h1><Users className="header-icon" /> User Mappings</h1>
                    <p className="header-subtitle">Map panel usernames to WhatsApp numbers for bot validation</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchData}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                        <Plus size={16} /> Add Mapping
                    </button>
                </div>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError('')}><X size={16} /></button>
                </div>
            )}
            {success && (
                <div className="alert alert-success">
                    <Zap size={18} />
                    <span>{success}</span>
                </div>
            )}

            {/* Stats */}
            {stats && (
                <div className="stats-row">
                    <div className="stat-card">
                        <div className="stat-icon"><Users size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.total}</span>
                            <span className="stat-label">Total Users</span>
                        </div>
                    </div>
                    <div className="stat-card success">
                        <div className="stat-icon"><UserCheck size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.verified}</span>
                            <span className="stat-label">Verified</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon"><MessageSquare size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.botEnabled}</span>
                            <span className="stat-label">Bot Enabled</span>
                        </div>
                    </div>
                    <div className="stat-card danger">
                        <div className="stat-icon"><UserX size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.suspended}</span>
                            <span className="stat-label">Suspended</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Search by username, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Users Grid */}
            <div className="users-grid">
                {filteredMappings.length === 0 ? (
                    <div className="empty-state">
                        <Users size={48} />
                        <h3>No User Mappings</h3>
                        <p>Add user mappings to validate WhatsApp users</p>
                        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                            <Plus size={16} /> Add Mapping
                        </button>
                    </div>
                ) : (
                    filteredMappings.map(user => (
                        <div key={user.id} className={`user-card ${user.isAutoSuspended ? 'suspended' : ''} ${!user.isBotEnabled ? 'bot-disabled' : ''}`}>
                            <div className="user-header">
                                <div className="user-avatar">
                                    {(user.panelUsername || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="user-info">
                                    <h4>{user.panelUsername}</h4>
                                    {user.panelEmail && <span className="user-email">{user.panelEmail}</span>}
                                </div>
                                <div className="user-status">
                                    {user.isVerified && (
                                        <span className="status-badge verified">
                                            <UserCheck size={12} /> Verified
                                        </span>
                                    )}
                                    {user.isAutoSuspended && (
                                        <span className="status-badge suspended">
                                            <UserX size={12} /> Suspended
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="user-phones">
                                <div className="section-label"><Phone size={14} /> WhatsApp Numbers</div>
                                <div className="phone-list">
                                    {(user.whatsappNumbers || []).length === 0 ? (
                                        <span className="no-data">No numbers added</span>
                                    ) : (
                                        (user.whatsappNumbers || []).map((num, i) => (
                                            <span key={i} className="phone-tag">{num}</span>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="user-meta">
                                <div className="meta-row">
                                    <span className="meta-label">Bot Status:</span>
                                    <button
                                        className={`toggle-btn ${user.isBotEnabled ? 'on' : 'off'}`}
                                        onClick={() => handleToggleBot(user.id)}
                                    >
                                        {user.isBotEnabled ? <><ToggleRight size={18} /> Enabled</> : <><ToggleLeft size={18} /> Disabled</>}
                                    </button>
                                </div>
                                {user.spamCount > 0 && (
                                    <div className="meta-row warn">
                                        <span className="meta-label">Spam Count:</span>
                                        <span className="spam-count">{user.spamCount}</span>
                                    </div>
                                )}
                            </div>

                            {user.adminNotes && (
                                <div className="user-notes">
                                    <div className="section-label"><Shield size={14} /> Admin Notes</div>
                                    <p>{user.adminNotes}</p>
                                </div>
                            )}

                            <div className="user-actions">
                                <button className="btn btn-ghost" onClick={() => handleEdit(user)}>
                                    <Edit2 size={16} /> Edit
                                </button>
                                {user.isAutoSuspended ? (
                                    <button className="btn btn-ghost text-success" onClick={() => handleUnsuspend(user.id)}>
                                        <UserCheck size={16} /> Unsuspend
                                    </button>
                                ) : (
                                    <button className="btn btn-ghost text-warning" onClick={() => handleSuspend(user.id)}>
                                        <UserX size={16} /> Suspend
                                    </button>
                                )}
                                <button className="btn btn-ghost text-danger" onClick={() => handleDelete(user.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingItem ? 'Edit' : 'Add'} User Mapping</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Panel Username *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.panelUsername}
                                        onChange={(e) => setFormData({ ...formData, panelUsername: e.target.value })}
                                        placeholder="e.g. johndoe"
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            value={formData.panelEmail}
                                            onChange={(e) => setFormData({ ...formData, panelEmail: e.target.value })}
                                            placeholder="user@example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Panel User ID</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.panelUserId}
                                            onChange={(e) => setFormData({ ...formData, panelUserId: e.target.value })}
                                            placeholder="12345"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">WhatsApp Numbers</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.whatsappNumbers}
                                        onChange={(e) => setFormData({ ...formData, whatsappNumbers: e.target.value })}
                                        placeholder="628123456789, 628987654321 (comma separated)"
                                    />
                                    <span className="form-hint">Multiple numbers separated by comma</span>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Group IDs</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.groupIds}
                                        onChange={(e) => setFormData({ ...formData, groupIds: e.target.value })}
                                        placeholder="group-id-1, group-id-2"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Admin Notes</label>
                                    <textarea
                                        className="form-textarea"
                                        rows="3"
                                        value={formData.adminNotes}
                                        onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                                        placeholder="Internal notes (only visible to admin)"
                                    />
                                </div>

                                <label className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        checked={formData.isBotEnabled}
                                        onChange={(e) => setFormData({ ...formData, isBotEnabled: e.target.checked })}
                                    />
                                    <span>Enable bot responses for this user</span>
                                </label>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingItem ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .user-mappings-page {
                    padding: 1.5rem;
                }
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1.5rem;
                }
                .header-content h1 {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin: 0;
                    font-size: 1.75rem;
                }
                .header-icon {
                    color: var(--primary-color);
                }
                .header-subtitle {
                    margin: 0.25rem 0 0 0;
                    color: var(--text-secondary);
                }
                .header-actions {
                    display: flex;
                    gap: 0.75rem;
                }
                .stats-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .stat-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }
                .stat-card.success {
                    border-color: rgba(34, 197, 94, 0.3);
                }
                .stat-card.danger {
                    border-color: rgba(239, 68, 68, 0.3);
                }
                .stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    background: var(--bg-tertiary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-color);
                }
                .stat-card.danger .stat-icon {
                    color: #ef4444;
                }
                .stat-info {
                    display: flex;
                    flex-direction: column;
                }
                .stat-value {
                    font-size: 1.75rem;
                    font-weight: 700;
                }
                .stat-label {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .search-bar {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 0.75rem 1rem;
                    margin-bottom: 1.5rem;
                }
                .search-bar input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                }
                .search-bar input:focus {
                    outline: none;
                }
                .users-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
                    gap: 1rem;
                }
                .user-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1.25rem;
                    transition: all 0.2s;
                }
                .user-card:hover {
                    border-color: var(--primary-color);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                .user-card.suspended {
                    border-color: rgba(239, 68, 68, 0.3);
                    background: rgba(239, 68, 68, 0.02);
                }
                .user-card.bot-disabled {
                    opacity: 0.7;
                }
                .user-header {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .user-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, var(--primary-color), #1eb854);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 1.25rem;
                }
                .user-info {
                    flex: 1;
                }
                .user-info h4 {
                    margin: 0;
                    font-size: 1.1rem;
                }
                .user-email {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .user-status {
                    display: flex;
                    gap: 0.5rem;
                }
                .status-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 500;
                }
                .status-badge.verified {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }
                .status-badge.suspended {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }
                .section-label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.5rem;
                }
                .user-phones {
                    margin-bottom: 1rem;
                }
                .phone-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                .phone-tag {
                    background: var(--bg-tertiary);
                    padding: 0.35rem 0.75rem;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    font-family: monospace;
                }
                .no-data {
                    color: var(--text-muted);
                    font-style: italic;
                    font-size: 0.85rem;
                }
                .user-meta {
                    margin-bottom: 1rem;
                }
                .meta-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 0.5rem;
                }
                .meta-row.warn {
                    color: #f59e0b;
                }
                .meta-label {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }
                .toggle-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 0.85rem;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                }
                .toggle-btn.on {
                    color: #22c55e;
                    background: rgba(34, 197, 94, 0.1);
                }
                .toggle-btn.off {
                    color: var(--text-muted);
                    background: var(--bg-tertiary);
                }
                .spam-count {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                    font-weight: 600;
                }
                .user-notes {
                    background: var(--bg-tertiary);
                    padding: 0.75rem;
                    border-radius: 8px;
                    margin-bottom: 1rem;
                }
                .user-notes p {
                    margin: 0;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .user-actions {
                    display: flex;
                    gap: 0.5rem;
                    border-top: 1px solid var(--border-color);
                    padding-top: 0.75rem;
                }
                .empty-state {
                    grid-column: 1 / -1;
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--text-secondary);
                }
                .empty-state h3 {
                    margin: 1rem 0 0.5rem 0;
                    color: var(--text-primary);
                }
                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }
                .checkbox-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    margin-top: 0.5rem;
                }
                .checkbox-item input {
                    width: 18px;
                    height: 18px;
                    accent-color: var(--primary-color);
                }
            `}</style>
        </div>
    );
};

export default UserMappings;

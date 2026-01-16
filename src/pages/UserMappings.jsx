import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Phone, Users, Shield, Search, AlertTriangle, Zap, CheckCircle, XCircle, Ban, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
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
            setMappings(mappingsRes.data.data || []);
            setStats(statsRes.data.data);
        } catch (err) {
            setError('Failed to load user mappings');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        try {
            const res = await api.get(`/user-mappings?search=${encodeURIComponent(searchQuery)}`);
            setMappings(res.data.data || []);
        } catch (err) {
            setError('Search failed');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = {
                ...formData,
                whatsappNumbers: formData.whatsappNumbers.split(',').map(n => n.trim()).filter(n => n),
                groupIds: formData.groupIds.split(',').map(g => g.trim()).filter(g => g)
            };

            if (editingItem) {
                await api.put(`/user-mappings/${editingItem.id}`, data);
                setSuccess('Mapping updated');
            } else {
                await api.post('/user-mappings', data);
                setSuccess('Mapping created');
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
            whatsappNumbers: (item.whatsappNumbers || []).join(', '),
            groupIds: (item.groupIds || []).join(', '),
            isBotEnabled: item.isBotEnabled,
            adminNotes: item.adminNotes || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this mapping?')) return;
        try {
            await api.delete(`/user-mappings/${id}`);
            setSuccess('Mapping deleted');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
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

    const handleVerify = async (id) => {
        try {
            await api.post(`/user-mappings/${id}/verify`);
            setSuccess('User verified');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to verify');
        }
    };

    const handleSuspend = async (id) => {
        const reason = window.prompt('Enter suspend reason (optional):');
        try {
            await api.post(`/user-mappings/${id}/suspend`, { reason });
            setSuccess('User suspended');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to suspend');
        }
    };

    const handleUnsuspend = async (id) => {
        try {
            await api.post(`/user-mappings/${id}/unsuspend`);
            setSuccess('User unsuspended');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to unsuspend');
        }
    };

    const resetForm = () => {
        setFormData({
            panelUsername: '',
            panelEmail: '',
            whatsappNumbers: '',
            groupIds: '',
            isBotEnabled: true,
            adminNotes: ''
        });
    };

    const filteredMappings = mappings.filter(m =>
        !searchQuery ||
        m.panelUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.panelEmail && m.panelEmail.toLowerCase().includes(searchQuery.toLowerCase()))
    );

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
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><Users size={28} /> User Mappings</h1>
                    <p className="header-subtitle">Map panel usernames to WhatsApp numbers for validation</p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                    <Plus size={16} /> Add Mapping
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><Zap size={20} />{success}</div>}

            {/* Stats */}
            {stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{stats.total}</div>
                        <div className="stat-label">Total Users</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value text-success">{stats.verified}</div>
                        <div className="stat-label">Verified</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.botEnabled}</div>
                        <div className="stat-label">Bot Enabled</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value text-danger">{stats.suspended}</div>
                        <div className="stat-label">Suspended</div>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by username, email, or phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <button className="btn btn-secondary" onClick={handleSearch}><Search size={16} /> Search</button>
                    <button className="btn btn-ghost" onClick={() => { setSearchQuery(''); fetchData(); }}>Clear</button>
                </div>
            </div>

            {/* Table */}
            <div className="card">
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Panel Username</th>
                                <th>WhatsApp Numbers</th>
                                <th>Groups</th>
                                <th>Bot</th>
                                <th>Activity</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMappings.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-state">No user mappings found</td>
                                </tr>
                            ) : (
                                filteredMappings.map(item => (
                                    <tr key={item.id} className={item.isAutoSuspended ? 'row-suspended' : ''}>
                                        <td>
                                            <div className="status-badges">
                                                {item.isVerified ? (
                                                    <span className="badge badge-success" title="Verified"><CheckCircle size={14} /></span>
                                                ) : (
                                                    <span className="badge badge-warning" title="Unverified"><XCircle size={14} /></span>
                                                )}
                                                {item.isAutoSuspended && (
                                                    <span className="badge badge-danger" title="Suspended"><Ban size={14} /></span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="user-info">
                                                <strong>{item.panelUsername}</strong>
                                                {item.panelEmail && <small>{item.panelEmail}</small>}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="phone-list">
                                                {(item.whatsappNumbers || []).slice(0, 2).map((phone, i) => (
                                                    <span key={i} className="phone-badge">
                                                        <Phone size={12} /> {phone}
                                                    </span>
                                                ))}
                                                {(item.whatsappNumbers || []).length > 2 && (
                                                    <span className="more-badge">+{item.whatsappNumbers.length - 2}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>{(item.groupIds || []).length || '-'}</td>
                                        <td>
                                            <button
                                                className={`btn btn-ghost btn-icon ${item.isBotEnabled ? 'text-success' : 'text-muted'}`}
                                                onClick={() => handleToggleBot(item.id)}
                                                title={item.isBotEnabled ? 'Bot Enabled' : 'Bot Disabled'}
                                            >
                                                {item.isBotEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                            </button>
                                        </td>
                                        <td>
                                            <small>{item.totalMessages || 0} msgs</small>
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                <button className="btn btn-ghost btn-icon" onClick={() => handleEdit(item)} title="Edit">
                                                    <Edit2 size={16} />
                                                </button>
                                                {!item.isVerified && (
                                                    <button className="btn btn-ghost btn-icon text-success" onClick={() => handleVerify(item.id)} title="Verify">
                                                        <Shield size={16} />
                                                    </button>
                                                )}
                                                {!item.isAutoSuspended ? (
                                                    <button className="btn btn-ghost btn-icon text-warning" onClick={() => handleSuspend(item.id)} title="Suspend">
                                                        <Ban size={16} />
                                                    </button>
                                                ) : (
                                                    <button className="btn btn-ghost btn-icon text-info" onClick={() => handleUnsuspend(item.id)} title="Unsuspend">
                                                        <CheckCircle size={16} />
                                                    </button>
                                                )}
                                                <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDelete(item.id)} title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay open">
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h3>{editingItem ? 'Edit' : 'Add'} User Mapping</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Panel Username *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.panelUsername}
                                        onChange={(e) => setFormData({ ...formData, panelUsername: e.target.value })}
                                        placeholder="Username on SMM panel"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Panel Email</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={formData.panelEmail}
                                        onChange={(e) => setFormData({ ...formData, panelEmail: e.target.value })}
                                        placeholder="Email on SMM panel (optional)"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>WhatsApp Numbers</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.whatsappNumbers}
                                        onChange={(e) => setFormData({ ...formData, whatsappNumbers: e.target.value })}
                                        placeholder="Comma-separated: 628123456789, 628987654321"
                                    />
                                    <small className="form-hint">Enter phone numbers without + or leading 0</small>
                                </div>

                                <div className="form-group">
                                    <label>WhatsApp Group IDs</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.groupIds}
                                        onChange={(e) => setFormData({ ...formData, groupIds: e.target.value })}
                                        placeholder="Comma-separated group JIDs"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Admin Notes</label>
                                    <textarea
                                        className="form-textarea"
                                        rows="2"
                                        value={formData.adminNotes}
                                        onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                                        placeholder="Internal notes (not visible to user)"
                                    />
                                </div>

                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.isBotEnabled}
                                        onChange={(e) => setFormData({ ...formData, isBotEnabled: e.target.checked })}
                                    />
                                    Bot Enabled for this user
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

            <style jsx>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1rem;
          text-align: center;
        }
        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--primary-color);
        }
        .stat-value.text-success { color: var(--success-color); }
        .stat-value.text-danger { color: var(--danger-color); }
        .stat-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .status-badges {
          display: flex;
          gap: 0.25rem;
        }
        .user-info {
          display: flex;
          flex-direction: column;
        }
        .user-info small {
          color: var(--text-secondary);
          font-size: 0.75rem;
        }
        .phone-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }
        .phone-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: var(--bg-tertiary);
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .more-badge {
          background: var(--primary-color);
          color: white;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-size: 0.7rem;
        }
        .row-suspended {
          background: rgba(239, 68, 68, 0.05);
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
      `}</style>
        </div>
    );
};

export default UserMappings;

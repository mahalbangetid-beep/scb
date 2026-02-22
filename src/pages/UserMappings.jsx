import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Plus, Edit2, Trash2, UserCheck, Phone, AlertTriangle, Zap, X, RefreshCw, Search, ToggleRight, ToggleLeft, MessageSquare, StickyNote, Ban, CheckCircle, Hash, Send, CheckSquare, Square, Globe } from 'lucide-react';
import api from '../services/api';

const UserMappings = () => {
    const [mappings, setMappings] = useState([]);
    const [panels, setPanels] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPanel, setSelectedPanel] = useState('all');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Bulk select
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // Notes modal
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [notesItem, setNotesItem] = useState(null);
    const [notesText, setNotesText] = useState('');
    const [notesLoading, setNotesLoading] = useState(false);

    const [formData, setFormData] = useState({
        panelUsername: '',
        panelEmail: '',
        panelUserId: '',
        panelId: '',
        whatsappNumbers: '',
        telegramId: '',
        groupIds: '',
        isBotEnabled: true,
        adminNotes: ''
    });

    // Auto-dismiss toasts
    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(''), 5000);
            return () => clearTimeout(t);
        }
    }, [error]);
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(''), 3000);
            return () => clearTimeout(t);
        }
    }, [success]);

    const isFirstMount = useRef(true);

    useEffect(() => {
        fetchData();
        fetchPanels();
    }, []);

    // Refetch when panel filter changes (skip first mount to avoid double-fetch)
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        fetchData();
    }, [selectedPanel]);

    const fetchPanels = async () => {
        try {
            const res = await api.get('/panels');
            setPanels(res.data || []);
        } catch (err) {
            console.error('Failed to fetch panels:', err);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = {};
            if (selectedPanel && selectedPanel !== 'all') {
                params.panelId = selectedPanel;
            }
            const [mappingsRes, statsRes] = await Promise.all([
                api.get('/user-mappings', { params }),
                api.get('/user-mappings/stats')
            ]);
            const mappingsData = mappingsRes.data || [];
            const statsData = statsRes.data;
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
                groupIds: formData.groupIds.split(',').map(g => g.trim()).filter(g => g),
                panelId: formData.panelId || null,
                telegramId: formData.telegramId || null
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
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save');
        }
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            panelUsername: item.panelUsername,
            panelEmail: item.panelEmail || '',
            panelUserId: item.panelUserId || '',
            panelId: item.panelId || '',
            whatsappNumbers: (item.whatsappNumbers || []).join(', '),
            telegramId: item.telegramId || '',
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

    const handleSelectAll = () => {
        if (selectedIds.size === filteredMappings.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredMappings.map(m => m.id)));
        }
    };

    const handleSelectOne = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Delete ${selectedIds.size} selected mapping(s)?`)) return;
        setBulkDeleting(true);
        try {
            await api.post('/user-mappings/bulk-delete', { ids: Array.from(selectedIds) });
            setSuccess(`Deleted ${selectedIds.size} mappings`);
            setSelectedIds(new Set());
            fetchData();
        } catch (err) {
            setError('Failed to delete selected mappings');
        } finally {
            setBulkDeleting(false);
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

    const handleBlock = async (id) => {
        if (!window.confirm('Block this user? Bot will stop responding to them.')) return;
        try {
            await api.post(`/user-mappings/${id}/suspend`, { reason: 'Manually blocked by admin' });
            setSuccess('User blocked');
            fetchData();
        } catch (err) {
            setError('Failed to block user');
        }
    };

    const handleUnblock = async (id) => {
        try {
            await api.post(`/user-mappings/${id}/unsuspend`);
            setSuccess('User unblocked');
            fetchData();
        } catch (err) {
            setError('Failed to unblock');
        }
    };

    const openNotesModal = (item) => {
        setNotesItem(item);
        setNotesText(item.adminNotes || '');
        setShowNotesModal(true);
    };

    const handleSaveNotes = async () => {
        if (!notesItem) return;
        setNotesLoading(true);
        try {
            await api.put(`/user-mappings/${notesItem.id}`, { adminNotes: notesText });
            setSuccess('Notes saved');
            setShowNotesModal(false);
            fetchData();
        } catch (err) {
            setError('Failed to save notes');
        } finally {
            setNotesLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            panelUsername: '',
            panelEmail: '',
            panelUserId: '',
            panelId: '',
            whatsappNumbers: '',
            telegramId: '',
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
            m.whatsappName?.toLowerCase().includes(query) ||
            m.telegramId?.toLowerCase().includes(query) ||
            m.whatsappNumbers?.some(n => n.includes(query)) ||
            m.groupIds?.some(g => g.toLowerCase().includes(query));
    });

    const getPanelName = (panelId) => {
        if (!panelId) return null;
        const panel = panels.find(p => p.id === panelId);
        return panel ? (panel.alias || panel.name) : null;
    };

    if (loading && mappings.length === 0) {
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
            {/* Toast Notifications */}
            <div className="toast-container">
                {error && (
                    <div className="toast toast-error" onClick={() => setError('')}>
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                        <button onClick={(e) => { e.stopPropagation(); setError(''); }}><X size={14} /></button>
                    </div>
                )}
                {success && (
                    <div className="toast toast-success" onClick={() => setSuccess('')}>
                        <Zap size={16} />
                        <span>{success}</span>
                    </div>
                )}
            </div>

            <div className="page-header">
                <div className="header-content">
                    <h1><Users className="header-icon" /> User Mappings</h1>
                    <p className="header-subtitle">Map panel usernames to WhatsApp numbers for bot validation</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => { fetchData(); fetchPanels(); }}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                        <Plus size={16} /> Add Mapping
                    </button>
                </div>
            </div>

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
                        <div className="stat-icon"><Ban size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.suspended}</span>
                            <span className="stat-label">Blocked</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 2-Column Layout: Panel Sidebar + Table */}
            <div className="mappings-layout">
                {/* Sidebar - Panel List */}
                <div className="um-panels-sidebar">
                    <div className="um-sidebar-header">
                        <h3>SMM Panels</h3>
                        <span className="um-panel-count">{panels.length}</span>
                    </div>
                    <div className="um-panel-list">
                        <div
                            className={`um-panel-item ${selectedPanel === 'all' ? 'selected' : ''}`}
                            onClick={() => setSelectedPanel('all')}
                        >
                            <div className="um-panel-icon all-icon">
                                <Users size={16} />
                            </div>
                            <div className="um-panel-info">
                                <span className="um-panel-name">All Panels</span>
                                <span className="um-panel-count-text">{mappings.length} users</span>
                            </div>
                        </div>
                        {panels.map(panel => {
                            const count = mappings.filter(m => m.panelId === panel.id).length;
                            return (
                                <div
                                    key={panel.id}
                                    className={`um-panel-item ${selectedPanel === panel.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedPanel(panel.id)}
                                >
                                    <div className="um-panel-icon">
                                        <Globe size={16} />
                                    </div>
                                    <div className="um-panel-info">
                                        <span className="um-panel-name">{panel.alias || panel.name}</span>
                                        <span className="um-panel-count-text">{count} users</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Main Content - Search + Table */}
                <div className="um-main-content">
                    {/* Search Bar */}
                    <div className="search-bar" style={{ marginBottom: '1rem' }}>
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Search username, phone, telegram, group..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>
                        )}
                    </div>

                    {/* Bulk Actions Bar */}
                    {selectedIds.size > 0 && (
                        <div className="bulk-actions-bar">
                            <span className="bulk-count">
                                <CheckSquare size={16} />
                                {selectedIds.size} selected
                            </span>
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                            >
                                <Trash2 size={14} />
                                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSelectedIds(new Set())}
                            >
                                Clear
                            </button>
                        </div>
                    )}

                    {/* User List (Table Format) */}
                    <div className="mapping-table-wrap">
                        {filteredMappings.length === 0 ? (
                            <div className="empty-state">
                                <Users size={48} />
                                <h3>No User Mappings</h3>
                                <p>{searchQuery ? 'No results match your search' : 'Add user mappings to validate WhatsApp users'}</p>
                                {!searchQuery && (
                                    <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                                        <Plus size={16} /> Add Mapping
                                    </button>
                                )}
                            </div>
                        ) : (
                            <table className="mapping-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                className="row-checkbox"
                                                checked={filteredMappings.length > 0 && selectedIds.size === filteredMappings.length}
                                                onChange={handleSelectAll}
                                                title="Select all"
                                            />
                                        </th>
                                        <th>Username</th>
                                        <th>WhatsApp</th>
                                        <th>Telegram ID</th>
                                        <th>Group ID</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Notes</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMappings.map(user => (
                                        <tr key={user.id} className={`${user.isAutoSuspended ? 'row-blocked' : ''} ${!user.isBotEnabled ? 'row-disabled' : ''} ${selectedIds.has(user.id) ? 'row-selected' : ''}`}>
                                            {/* Checkbox */}
                                            <td style={{ textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    className="row-checkbox"
                                                    checked={selectedIds.has(user.id)}
                                                    onChange={() => handleSelectOne(user.id)}
                                                />
                                            </td>
                                            {/* Username */}
                                            <td>
                                                <div className="user-cell">
                                                    <div className="user-avatar-sm">
                                                        {(user.panelUsername || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="username-text">{user.panelUsername}</div>
                                                        {user.whatsappName && (
                                                            <div className="wa-name-text">{user.whatsappName}</div>
                                                        )}
                                                        {user.panelEmail && (
                                                            <div className="email-text">{user.panelEmail}</div>
                                                        )}
                                                        {user.panelId && (
                                                            <div className="panel-badge-sm">{getPanelName(user.panelId) || 'Panel'}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* WhatsApp Numbers */}
                                            <td>
                                                <div className="phone-list">
                                                    {(user.whatsappNumbers || []).length === 0 ? (
                                                        <span className="no-data">—</span>
                                                    ) : (
                                                        (user.whatsappNumbers || []).map((num, i) => (
                                                            <span key={i} className="phone-tag">{num}</span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>

                                            {/* Telegram ID */}
                                            <td>
                                                {user.telegramId ? (
                                                    <span className="telegram-tag">{user.telegramId}</span>
                                                ) : (
                                                    <span className="no-data">—</span>
                                                )}
                                            </td>

                                            {/* Group ID */}
                                            <td>
                                                <div className="group-list">
                                                    {(user.groupIds || []).length === 0 ? (
                                                        <span className="no-data">—</span>
                                                    ) : (
                                                        (user.groupIds || []).map((gid, i) => (
                                                            <span key={i} className="group-tag">{gid}</span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td>
                                                <div className="status-badges">
                                                    {user.isVerified && (
                                                        <span className="badge badge-verified"><CheckCircle size={12} /> Verified</span>
                                                    )}
                                                    {user.isAutoSuspended && (
                                                        <span className="badge badge-blocked"><Ban size={12} /> Blocked</span>
                                                    )}
                                                    <button
                                                        className={`toggle-btn-sm ${user.isBotEnabled ? 'on' : 'off'}`}
                                                        onClick={() => handleToggleBot(user.id)}
                                                        title={user.isBotEnabled ? 'Bot: ON' : 'Bot: OFF'}
                                                    >
                                                        {user.isBotEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Date Created */}
                                            <td>
                                                <span className="date-text" title={user.createdAt ? new Date(user.createdAt).toLocaleString() : ''}>
                                                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                                                </span>
                                            </td>

                                            {/* Notes */}
                                            <td>
                                                <button
                                                    className={`btn btn-ghost btn-xs ${user.adminNotes ? 'has-notes' : ''}`}
                                                    onClick={() => openNotesModal(user)}
                                                    title={user.adminNotes || 'Add notes'}
                                                >
                                                    <StickyNote size={14} />
                                                    {user.adminNotes ? '📝' : ''}
                                                </button>
                                            </td>

                                            {/* Actions */}
                                            <td>
                                                <div className="action-btns">
                                                    <button className="btn btn-ghost btn-xs" onClick={() => handleEdit(user)} title="Edit">
                                                        <Edit2 size={14} />
                                                    </button>
                                                    {user.isAutoSuspended ? (
                                                        <button className="btn btn-ghost btn-xs text-success" onClick={() => handleUnblock(user.id)} title="Unblock">
                                                            <UserCheck size={14} />
                                                        </button>
                                                    ) : (
                                                        <button className="btn btn-ghost btn-xs text-warning" onClick={() => handleBlock(user.id)} title="Block">
                                                            <Ban size={14} />
                                                        </button>
                                                    )}
                                                    <button className="btn btn-ghost btn-xs text-danger" onClick={() => handleDelete(user.id)} title="Delete">
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
            </div>

            {/* Add/Edit Modal */}
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
                                <div className="form-row">
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
                                    <div className="form-group">
                                        <label className="form-label">Panel</label>
                                        <select
                                            className="form-select"
                                            value={formData.panelId}
                                            onChange={(e) => setFormData({ ...formData, panelId: e.target.value })}
                                        >
                                            <option value="">No specific panel</option>
                                            {panels.map(panel => (
                                                <option key={panel.id} value={panel.id}>
                                                    {panel.alias || panel.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
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
                                    <label className="form-label"><Phone size={14} /> WhatsApp Numbers</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.whatsappNumbers}
                                        onChange={(e) => setFormData({ ...formData, whatsappNumbers: e.target.value })}
                                        placeholder="628123456789, 628987654321 (comma separated)"
                                    />
                                    <span className="form-hint">Multiple numbers separated by comma</span>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label"><Send size={14} /> Telegram ID</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.telegramId}
                                            onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
                                            placeholder="e.g. @username or 123456789"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label"><Hash size={14} /> Group IDs</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.groupIds}
                                            onChange={(e) => setFormData({ ...formData, groupIds: e.target.value })}
                                            placeholder="group-id-1, group-id-2"
                                        />
                                    </div>
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

            {/* Notes Modal */}
            {showNotesModal && notesItem && (
                <div className="modal-overlay open" onClick={() => setShowNotesModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2><StickyNote size={20} /> Notes — {notesItem.panelUsername}</h2>
                            <button className="modal-close" onClick={() => setShowNotesModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <textarea
                                className="form-textarea"
                                rows="6"
                                value={notesText}
                                onChange={(e) => setNotesText(e.target.value)}
                                placeholder="Add admin notes about this user..."
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                            <p className="form-hint" style={{ marginTop: '8px' }}>
                                Notes are only visible to admins. Auto-notes (e.g. WhatsApp validation) are appended automatically.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowNotesModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSaveNotes} disabled={notesLoading}>
                                {notesLoading ? 'Saving...' : 'Save Notes'}
                            </button>
                        </div>
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

                /* Toast Notifications */
                .toast-container {
                    position: fixed;
                    top: 1.5rem;
                    right: 1.5rem;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    max-width: min(400px, calc(100vw - 3rem));
                }
                .toast {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem 1rem;
                    border-radius: 10px;
                    cursor: pointer;
                    animation: toastSlideIn 0.3s ease-out;
                    backdrop-filter: blur(8px);
                    font-size: 0.9rem;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                }
                .toast button {
                    background: none;
                    border: none;
                    color: inherit;
                    cursor: pointer;
                    opacity: 0.7;
                    margin-left: auto;
                    flex-shrink: 0;
                }
                .toast-error {
                    background: linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(185, 28, 28, 0.95));
                    color: white;
                }
                .toast-success {
                    background: linear-gradient(135deg, rgba(22, 163, 74, 0.95), rgba(21, 128, 61, 0.95));
                    color: white;
                }
                @keyframes toastSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                /* Stats */
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

                /* 2-Column Layout */
                .mappings-layout {
                    display: grid;
                    grid-template-columns: 240px 1fr;
                    gap: 1.25rem;
                    min-height: calc(100vh - 340px);
                }
                .um-panels-sidebar {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    overflow: hidden;
                    align-self: start;
                    position: sticky;
                    top: 1.5rem;
                }
                .um-sidebar-header {
                    padding: 0.875rem 1rem;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .um-sidebar-header h3 {
                    font-size: 0.8rem;
                    font-weight: 600;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-secondary);
                }
                .um-panel-count {
                    background: var(--primary-color);
                    color: white;
                    padding: 2px 8px;
                    border-radius: 999px;
                    font-size: 0.7rem;
                    font-weight: 600;
                }
                .um-panel-list {
                    max-height: calc(100vh - 380px);
                    overflow-y: auto;
                }
                .um-panel-item {
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    padding: 0.75rem 1rem;
                    cursor: pointer;
                    border-bottom: 1px solid var(--border-color);
                    transition: all 0.15s ease;
                }
                .um-panel-item:last-child {
                    border-bottom: none;
                }
                .um-panel-item:hover {
                    background: var(--bg-tertiary);
                }
                .um-panel-item.selected {
                    background: rgba(59, 130, 246, 0.08);
                    border-left: 3px solid var(--primary-color);
                }
                .um-panel-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    background: var(--bg-tertiary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-secondary);
                    flex-shrink: 0;
                }
                .um-panel-icon.all-icon {
                    background: rgba(59, 130, 246, 0.1);
                    color: var(--primary-color);
                }
                .um-panel-item.selected .um-panel-icon {
                    background: rgba(59, 130, 246, 0.15);
                    color: var(--primary-color);
                }
                .um-panel-info {
                    flex: 1;
                    min-width: 0;
                }
                .um-panel-name {
                    display: block;
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .um-panel-count-text {
                    display: block;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .um-main-content {
                    min-width: 0;
                }
                .search-bar {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 0.5rem 1rem;
                    flex: 1;
                    min-width: 200px;
                }
                .search-bar input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    color: var(--text-primary);
                    font-size: 0.9rem;
                }
                .search-bar input:focus { outline: none; }
                .search-clear {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 2px;
                }

                /* Table */
                .mapping-table-wrap {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    overflow: hidden;
                }
                .mapping-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .mapping-table thead th {
                    background: var(--bg-tertiary);
                    padding: 0.75rem 1rem;
                    text-align: left;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 1px solid var(--border-color);
                    white-space: nowrap;
                }
                .mapping-table tbody tr {
                    border-bottom: 1px solid var(--border-color);
                    transition: background 0.15s;
                }
                .mapping-table tbody tr:last-child {
                    border-bottom: none;
                }
                .mapping-table tbody tr:hover {
                    background: rgba(59, 130, 246, 0.03);
                }
                .mapping-table tbody tr.row-blocked {
                    background: rgba(239, 68, 68, 0.03);
                }
                .mapping-table tbody tr.row-disabled {
                    opacity: 0.6;
                }
                .mapping-table td {
                    padding: 0.75rem 1rem;
                    font-size: 0.9rem;
                    vertical-align: middle;
                }

                /* User Cell */
                .user-cell {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .user-avatar-sm {
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, var(--primary-color), #1eb854);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 0.9rem;
                    flex-shrink: 0;
                }
                .username-text {
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .wa-name-text {
                    font-size: 0.8rem;
                    color: var(--primary-color);
                }
                .email-text {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .panel-badge-sm {
                    display: inline-block;
                    margin-top: 2px;
                    padding: 1px 6px;
                    border-radius: 4px;
                    font-size: 0.65rem;
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                    font-weight: 500;
                }

                /* Tags */
                .phone-list, .group-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }
                .phone-tag {
                    background: var(--bg-tertiary);
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-family: 'SF Mono', 'Consolas', monospace;
                    white-space: nowrap;
                }
                .telegram-tag {
                    background: rgba(0, 136, 204, 0.1);
                    color: #0088cc;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-family: monospace;
                }
                .group-tag {
                    background: rgba(139, 92, 246, 0.1);
                    color: #8b5cf6;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-family: monospace;
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .no-data {
                    color: var(--text-muted);
                    font-size: 0.85rem;
                }

                /* Status Badges */
                .status-badges {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    flex-wrap: wrap;
                }
                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 500;
                    white-space: nowrap;
                }
                .badge-verified {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }
                .badge-blocked {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }
                .toggle-btn-sm {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 2px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                }
                .toggle-btn-sm.on { color: #22c55e; }
                .toggle-btn-sm.off { color: var(--text-muted); }

                /* Notes Button */
                .btn-xs {
                    padding: 4px 6px !important;
                    font-size: 0.8rem !important;
                }
                .has-notes {
                    color: var(--primary-color) !important;
                }

                /* Actions */
                .action-btns {
                    display: flex;
                    gap: 2px;
                    justify-content: flex-end;
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--text-secondary);
                }
                .empty-state h3 {
                    margin: 1rem 0 0.5rem 0;
                    color: var(--text-primary);
                }

                /* Form */
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
                .text-success { color: #22c55e !important; }
                .text-warning { color: #f59e0b !important; }
                .text-danger { color: #ef4444 !important; }

                /* Bulk Select */
                .row-checkbox {
                    width: 16px;
                    height: 16px;
                    accent-color: var(--primary-color);
                    cursor: pointer;
                }
                .mapping-table tbody tr.row-selected {
                    background: rgba(59, 130, 246, 0.08);
                }
                .bulk-actions-bar {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem 1rem;
                    margin-bottom: 0.75rem;
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.08));
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 10px;
                    animation: toastSlideIn 0.2s ease-out;
                }
                .bulk-count {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 600;
                    font-size: 0.9rem;
                    color: var(--primary-color);
                }
                .btn-sm {
                    padding: 0.4rem 0.75rem !important;
                    font-size: 0.8rem !important;
                }
                .btn-danger {
                    background: linear-gradient(135deg, #ef4444, #dc2626) !important;
                    color: white !important;
                    border: none !important;
                }
                .btn-danger:hover {
                    background: linear-gradient(135deg, #dc2626, #b91c1c) !important;
                }

                /* Responsive */
                @media (max-width: 1100px) {
                    .mappings-layout {
                        grid-template-columns: 1fr;
                    }
                    .um-panels-sidebar {
                        position: static;
                    }
                    .um-panel-list {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 0;
                        max-height: 200px;
                    }
                    .um-panel-item {
                        flex: 1;
                        min-width: 140px;
                    }
                }
                @media (max-width: 900px) {
                    .mapping-table-wrap {
                        overflow-x: auto;
                    }
                    .mapping-table {
                        min-width: 800px;
                    }
                    .search-bar {
                        width: 100%;
                    }
                    .form-row {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
};

export default UserMappings;

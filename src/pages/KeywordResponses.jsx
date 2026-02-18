import { useState, useEffect, useRef } from 'react';
import {
    Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, Zap,
    MessageSquare, AlertTriangle, X, RefreshCw, CheckSquare, Square,
    Power, PowerOff, Filter, ChevronDown, Loader2, Smartphone,
    Copy, ArrowRightLeft
} from 'lucide-react';
import api from '../services/api';

const KeywordResponses = () => {
    const [responses, setResponses] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [testMessage, setTestMessage] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [devices, setDevices] = useState([]);
    const [devicesLoaded, setDevicesLoaded] = useState(false);

    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    // Copy/Move modal state
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyTargetDevice, setCopyTargetDevice] = useState('');
    const [copyMode, setCopyMode] = useState('copy'); // copy or move
    const [copyLoading, setCopyLoading] = useState(false);
    const [copyIds, setCopyIds] = useState([]);

    // Search & filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
    const [deviceFilter, setDeviceFilter] = useState('all'); // all, global, or device ID
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const filterRef = useRef(null);

    // Clear selection when search/filter changes to avoid stale selections
    useEffect(() => {
        setSelectedIds(new Set());
    }, [searchQuery, statusFilter, deviceFilter]);

    // Auto-dismiss error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(''), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Close filter dropdown on outside click
    useEffect(() => {
        if (!showFilterMenu) return;
        const handleClickOutside = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setShowFilterMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showFilterMenu]);

    const [formData, setFormData] = useState({
        keyword: '',
        matchType: 'CONTAINS',
        caseSensitive: false,
        responseText: '',
        triggerAction: 'NONE',
        platform: 'ALL',
        applyToGroups: true,
        applyToDMs: true,
        priority: 0,
        isActive: true,
        deviceId: ''
    });

    useEffect(() => {
        fetchData();
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices');
            setDevices(res.data || []);
        } catch (err) {
            console.error('[KeywordResponses] Failed to fetch devices:', err);
        } finally {
            setDevicesLoaded(true);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [responsesRes, statsRes] = await Promise.all([
                api.get('/keyword-responses'),
                api.get('/keyword-responses/stats')
            ]);
            const responseData = responsesRes.data || [];
            const statsData = statsRes.data;
            setResponses(Array.isArray(responseData) ? responseData : []);
            setStats(statsData);
            // Clear selection on refresh
            setSelectedIds(new Set());
        } catch (err) {
            console.error('[KeywordResponses] Fetch error:', err);
            setError('Failed to load keyword responses');
        } finally {
            setLoading(false);
        }
    };

    // Filtered responses based on search and status filter
    const filteredResponses = responses.filter(item => {
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchKeyword = (item.keyword || '').toLowerCase().includes(q);
            const matchResponse = (item.responseText || '').toLowerCase().includes(q);
            if (!matchKeyword && !matchResponse) return false;
        }
        // Status filter
        if (statusFilter === 'active' && !item.isActive) return false;
        if (statusFilter === 'inactive' && item.isActive) return false;
        // Device filter
        if (deviceFilter === 'global' && item.deviceId) return false;
        if (deviceFilter !== 'all' && deviceFilter !== 'global' && item.deviceId !== deviceFilter) return false;
        return true;
    });

    // Bulk selection handlers
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredResponses.length && filteredResponses.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredResponses.map(r => r.id)));
        }
    };

    const clearSelection = () => setSelectedIds(new Set());

    const handleBulkAction = async (action) => {
        if (selectedIds.size === 0) return;

        const labels = { enable: 'enable', disable: 'disable', delete: 'delete' };
        if (action === 'delete') {
            if (!window.confirm(`Delete ${selectedIds.size} keyword response(s)? This cannot be undone.`)) return;
        }

        setBulkLoading(true);
        setError('');
        try {
            const res = await api.post('/keyword-responses/bulk-action', {
                ids: Array.from(selectedIds),
                action
            });
            const msg = res.message || `${selectedIds.size} keyword(s) ${labels[action]}d`;
            setSuccess(msg);
            setSelectedIds(new Set());
            fetchData();
            setTimeout(() => setSuccess(''), 4000);
        } catch (err) {
            setError(err.error?.message || err.message || `Failed to ${labels[action]} keywords`);
        } finally {
            setBulkLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                deviceId: formData.deviceId || null  // Send null instead of empty string
            };
            if (editingItem) {
                await api.put(`/keyword-responses/${editingItem.id}`, payload);
                setSuccess('Keyword response updated');
            } else {
                await api.post('/keyword-responses', payload);
                setSuccess('Keyword response created');
            }
            setShowModal(false);
            setEditingItem(null);
            resetForm();
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save');
        }
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            keyword: item.keyword,
            matchType: item.matchType,
            caseSensitive: item.caseSensitive,
            responseText: item.responseText,
            triggerAction: item.triggerAction || 'NONE',
            platform: item.platform,
            applyToGroups: item.applyToGroups,
            applyToDMs: item.applyToDMs,
            priority: item.priority,
            isActive: item.isActive,
            deviceId: item.deviceId || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this keyword response?')) return;
        try {
            await api.delete(`/keyword-responses/${id}`);
            setSuccess('Keyword response deleted');
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to delete');
        }
    };

    const handleToggle = async (id) => {
        try {
            await api.post(`/keyword-responses/${id}/toggle`);
            fetchData();
        } catch (err) {
            setError('Failed to toggle status');
        }
    };

    const handleTest = async () => {
        if (!testMessage.trim()) return;
        try {
            const res = await api.post('/keyword-responses/test', { message: testMessage });
            setTestResult(res.data);
        } catch (err) {
            setError('Test failed');
        }
    };

    const resetForm = () => {
        setFormData({
            keyword: '',
            matchType: 'CONTAINS',
            caseSensitive: false,
            responseText: '',
            triggerAction: 'NONE',
            platform: 'ALL',
            applyToGroups: true,
            applyToDMs: true,
            priority: 0,
            isActive: true,
            deviceId: ''
        });
    };

    const openCopyModal = (singleId = null) => {
        // singleId = specific item, null = use selectedIds (bulk)
        const idsToUse = singleId ? [singleId] : Array.from(selectedIds);
        if (idsToUse.length === 0) return;
        setCopyIds(idsToUse);
        setCopyTargetDevice('');
        setCopyMode('copy');
        setShowCopyModal(true);
    };

    const handleCopyToDevice = async () => {
        if (copyIds.length === 0) return;
        try {
            setCopyLoading(true);
            await api.post('/keyword-responses/copy-to-device', {
                ids: copyIds,
                targetDeviceId: copyTargetDevice || null,
                mode: copyMode
            });
            const modeLabel = copyMode === 'copy' ? 'copied' : 'moved';
            setSuccess(`${copyIds.length} keyword(s) ${modeLabel} successfully`);
            setShowCopyModal(false);
            setCopyIds([]);
            setSelectedIds(new Set());
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to copy/move keywords');
        } finally {
            setCopyLoading(false);
        }
    };

    const getMatchTypeLabel = (type) => {
        const labels = {
            EXACT: 'Exact',
            CONTAINS: 'Contains',
            STARTS_WITH: 'Starts',
            ENDS_WITH: 'Ends',
            REGEX: 'Regex'
        };
        return labels[type] || type;
    };

    const allFilteredSelected = filteredResponses.length > 0 && selectedIds.size === filteredResponses.length;
    const someSelected = selectedIds.size > 0;

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading keyword responses...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="keyword-responses-page">
            <div className="page-header">
                <div className="header-content">
                    <h1><MessageSquare className="header-icon" /> Keyword Responses</h1>
                    <p className="header-subtitle">Configure automatic replies based on keywords</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchData}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                        <Plus size={16} /> Add Keyword
                    </button>
                </div>
            </div>

            {/* Toast Notifications */}
            <div className="toast-container">
                {error && (
                    <div className="toast toast-error" onClick={() => setError('')}>
                        <AlertTriangle size={18} />
                        <span>{error}</span>
                        <button onClick={(e) => { e.stopPropagation(); setError(''); }}><X size={14} /></button>
                    </div>
                )}
                {success && (
                    <div className="toast toast-success" onClick={() => setSuccess('')}>
                        <Zap size={18} />
                        <span>{success}</span>
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="stats-row">
                    <div className="stat-card">
                        <div className="stat-icon"><MessageSquare size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.total}</span>
                            <span className="stat-label">Total Keywords</span>
                        </div>
                    </div>
                    <div className="stat-card success">
                        <div className="stat-icon"><ToggleRight size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.active}</span>
                            <span className="stat-label">Active</span>
                        </div>
                    </div>
                    <div className="stat-card muted">
                        <div className="stat-icon"><ToggleLeft size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.inactive}</span>
                            <span className="stat-label">Inactive</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Search & Filter Bar */}
            <div className="search-filter-bar">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="form-input search-input"
                        placeholder="Search keywords or responses..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="search-clear" onClick={() => setSearchQuery('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div className="filter-dropdown-wrapper" ref={filterRef}>
                    <button
                        className={`btn btn-secondary filter-btn ${statusFilter !== 'all' ? 'filter-active' : ''}`}
                        onClick={() => setShowFilterMenu(!showFilterMenu)}
                    >
                        <Filter size={16} />
                        {statusFilter === 'all' ? 'All Status' : statusFilter === 'active' ? 'Active' : 'Inactive'}
                        <ChevronDown size={14} />
                    </button>
                    {showFilterMenu && (
                        <div className="filter-menu">
                            {['all', 'active', 'inactive'].map(f => (
                                <button
                                    key={f}
                                    className={`filter-option ${statusFilter === f ? 'selected' : ''}`}
                                    onClick={() => { setStatusFilter(f); setShowFilterMenu(false); }}
                                >
                                    {f === 'all' ? 'All Status' : f === 'active' ? 'Active Only' : 'Inactive Only'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="device-filter-wrapper">
                    <select
                        className={`form-select device-filter-select ${deviceFilter !== 'all' ? 'filter-active' : ''}`}
                        value={deviceFilter}
                        onChange={(e) => setDeviceFilter(e.target.value)}
                    >
                        <option value="all">All Devices</option>
                        <option value="global">Global Only</option>
                        {devices.map(d => (
                            <option key={d.id} value={d.id}>
                                📱 {d.name}{d.phone ? ` (${d.phone})` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                {filteredResponses.length > 0 && (
                    <button
                        className={`btn btn-ghost select-all-btn ${allFilteredSelected ? 'all-selected' : ''}`}
                        onClick={toggleSelectAll}
                    >
                        {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>

            {/* Test Section */}
            <div className="test-section">
                <div className="test-header">
                    <Search size={18} />
                    <span>Test Keywords</span>
                </div>
                <div className="test-input-row">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Enter a test message to see which keyword matches..."
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleTest()}
                    />
                    <button className="btn btn-primary" onClick={handleTest}>Test</button>
                </div>
                {testResult && (
                    <div className={`test-result ${testResult.matched ? 'matched' : 'not-matched'}`}>
                        {testResult.matched ? (
                            <>
                                <strong>✅ Match Found:</strong> <code>{testResult.keyword}</code> ({testResult.matchType})
                                <div className="test-response">Response: {testResult.responseText?.substring(0, 150)}...</div>
                            </>
                        ) : (
                            <span>❌ No matching keyword found</span>
                        )}
                    </div>
                )}
            </div>

            {/* Results Count */}
            {(searchQuery || statusFilter !== 'all' || deviceFilter !== 'all') && (
                <div className="results-count">
                    Showing {filteredResponses.length} of {responses.length} keywords
                    {searchQuery && <span> matching "<strong>{searchQuery}</strong>"</span>}
                    {deviceFilter !== 'all' && <span> • {deviceFilter === 'global' ? 'Global only' : `Device: ${devices.find(d => d.id === deviceFilter)?.name || deviceFilter}`}</span>}
                </div>
            )}

            {/* Keywords List */}
            <div className="keywords-list">
                {filteredResponses.length === 0 ? (
                    <div className="empty-state">
                        <MessageSquare size={48} />
                        <h3>{searchQuery || statusFilter !== 'all' ? 'No Keywords Match' : 'No Keywords Configured'}</h3>
                        <p>
                            {searchQuery || statusFilter !== 'all'
                                ? 'Try adjusting your search or filter'
                                : 'Add your first keyword to start auto-replying'}
                        </p>
                        {!searchQuery && statusFilter === 'all' && (
                            <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                                <Plus size={16} /> Add Keyword
                            </button>
                        )}
                    </div>
                ) : (
                    filteredResponses.map(item => (
                        <div
                            key={item.id}
                            className={`keyword-card ${item.isActive ? 'active' : 'inactive'} ${selectedIds.has(item.id) ? 'selected' : ''}`}
                        >
                            {/* Selection checkbox */}
                            <div className="keyword-select" onClick={() => toggleSelect(item.id)}>
                                {selectedIds.has(item.id)
                                    ? <CheckSquare size={20} className="check-icon checked" />
                                    : <Square size={20} className="check-icon" />
                                }
                            </div>

                            <div className="keyword-content">
                                <div className="keyword-header">
                                    <div className="keyword-name">
                                        <code>{item.keyword || 'N/A'}</code>
                                        <span className={`badge badge-${(item.matchType || 'CONTAINS').toLowerCase()}`}>
                                            {getMatchTypeLabel(item.matchType || 'CONTAINS')}
                                        </span>
                                    </div>
                                    <button
                                        className={`toggle-btn ${item.isActive ? 'on' : 'off'}`}
                                        onClick={() => handleToggle(item.id)}
                                    >
                                        {item.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                    </button>
                                </div>

                                <div className="keyword-response">
                                    {(item.responseText || '').substring(0, 120)}{item.responseText?.length > 120 ? '...' : ''}
                                </div>

                                <div className="keyword-meta">
                                    <span className="meta-item">
                                        <span className="meta-label">Platform:</span> {item.platform}
                                    </span>
                                    <span className="meta-item">
                                        <span className="meta-label">Priority:</span> {item.priority}
                                    </span>
                                    <span className="meta-item">
                                        <span className="meta-label">Triggered:</span> {item.triggerCount || 0}x
                                    </span>
                                </div>

                                <div className="keyword-tags">
                                    {item.applyToGroups && <span className="tag">Groups</span>}
                                    {item.applyToDMs && <span className="tag">DMs</span>}
                                    {item.caseSensitive && <span className="tag warn">Case Sensitive</span>}
                                    {item.deviceId ? (() => {
                                        const linkedDevice = devices.find(d => d.id === item.deviceId);
                                        if (!linkedDevice) {
                                            if (devicesLoaded) {
                                                return <span className="tag danger" title="This device has been removed. Keyword won't trigger.">⚠️ Device Removed</span>;
                                            }
                                            return <span className="tag device">📱 ...</span>;
                                        }
                                        if (linkedDevice.status !== 'connected' || linkedDevice.isActive === false) {
                                            return (
                                                <>
                                                    <span className="tag device">📱 {linkedDevice.name}</span>
                                                    <span className="tag warning" title={`Device is ${linkedDevice.status}${!linkedDevice.isActive ? ' (disabled)' : ''}. Keyword may not trigger.`}>
                                                        ⚠️ {!linkedDevice.isActive ? 'Disabled' : 'Disconnected'}
                                                    </span>
                                                </>
                                            );
                                        }
                                        return <span className="tag device">📱 {linkedDevice.name}</span>;
                                    })() : (
                                        <span className="tag global">🌐 Global</span>
                                    )}
                                </div>

                                <div className="keyword-actions">
                                    <button className="btn btn-ghost" onClick={() => handleEdit(item)}>
                                        <Edit2 size={16} /> Edit
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => openCopyModal(item.id)}>
                                        <Copy size={16} /> Copy
                                    </button>
                                    <button className="btn btn-ghost text-danger" onClick={() => handleDelete(item.id)}>
                                        <Trash2 size={16} /> Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Bulk Action Bar */}
            {someSelected && (
                <div className="bulk-action-bar">
                    <div className="bulk-info">
                        <CheckSquare size={18} />
                        <span><strong>{selectedIds.size}</strong> keyword{selectedIds.size > 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="bulk-actions">
                        <button
                            className="btn btn-bulk btn-enable"
                            onClick={() => handleBulkAction('enable')}
                            disabled={bulkLoading}
                        >
                            {bulkLoading ? <Loader2 size={16} className="spin" /> : <Power size={16} />}
                            Enable
                        </button>
                        <button
                            className="btn btn-bulk btn-disable"
                            onClick={() => handleBulkAction('disable')}
                            disabled={bulkLoading}
                        >
                            {bulkLoading ? <Loader2 size={16} className="spin" /> : <PowerOff size={16} />}
                            Disable
                        </button>
                        <button
                            className="btn btn-bulk btn-delete"
                            onClick={() => handleBulkAction('delete')}
                            disabled={bulkLoading}
                        >
                            {bulkLoading ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                            Delete
                        </button>
                        <div className="bulk-divider" />
                        <button
                            className="btn btn-bulk btn-copy"
                            onClick={() => openCopyModal()}
                            disabled={bulkLoading}
                        >
                            <Copy size={16} /> Copy/Move
                        </button>
                        <div className="bulk-divider" />
                        <button className="btn btn-ghost btn-cancel" onClick={clearSelection}>
                            <X size={16} /> Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingItem ? 'Edit' : 'Add'} Keyword Response</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Keyword *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.keyword}
                                        onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                                        placeholder="e.g. price, help, order"
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Match Type</label>
                                        <select
                                            className="form-select"
                                            value={formData.matchType}
                                            onChange={(e) => setFormData({ ...formData, matchType: e.target.value })}
                                        >
                                            <option value="CONTAINS">Contains</option>
                                            <option value="EXACT">Exact Match</option>
                                            <option value="STARTS_WITH">Starts With</option>
                                            <option value="ENDS_WITH">Ends With</option>
                                            <option value="REGEX">Regex</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Platform</label>
                                        <select
                                            className="form-select"
                                            value={formData.platform}
                                            onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                                        >
                                            <option value="ALL">All Platforms</option>
                                            <option value="WHATSAPP">WhatsApp Only</option>
                                            <option value="TELEGRAM">Telegram Only</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Response Text *</label>
                                    <textarea
                                        className="form-textarea"
                                        rows="4"
                                        value={formData.responseText}
                                        onChange={(e) => setFormData({ ...formData, responseText: e.target.value })}
                                        placeholder="Enter the automatic reply message..."
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Priority</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.priority}
                                            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                            min="0"
                                        />
                                        <span className="form-hint">Higher = checked first</span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Action</label>
                                        <select
                                            className="form-select"
                                            value={formData.triggerAction}
                                            onChange={(e) => setFormData({ ...formData, triggerAction: e.target.value })}
                                        >
                                            <option value="NONE">None</option>
                                            <option value="FORWARD_TO_ADMIN">Forward to Admin</option>
                                            <option value="TRIGGER_WEBHOOK">Trigger Webhook</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label"><Smartphone size={14} style={{ marginRight: '4px', verticalAlign: '-2px' }} />Assigned Device</label>
                                    <select
                                        className="form-select"
                                        value={formData.deviceId}
                                        onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                                    >
                                        <option value="">All Devices (Global)</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}{d.phone ? ` (${d.phone})` : ''} — {d.status}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="form-hint">Assign to specific device or leave as global for all devices</span>
                                </div>

                                <div className="checkbox-group">
                                    <label className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={formData.applyToGroups}
                                            onChange={(e) => setFormData({ ...formData, applyToGroups: e.target.checked })}
                                        />
                                        <span>Apply to Groups</span>
                                    </label>
                                    <label className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={formData.applyToDMs}
                                            onChange={(e) => setFormData({ ...formData, applyToDMs: e.target.checked })}
                                        />
                                        <span>Apply to DMs</span>
                                    </label>
                                    <label className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={formData.caseSensitive}
                                            onChange={(e) => setFormData({ ...formData, caseSensitive: e.target.checked })}
                                        />
                                        <span>Case Sensitive</span>
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingItem ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Copy/Move Modal */}
            {showCopyModal && (
                <div className="modal-overlay open" onClick={() => setShowCopyModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2><ArrowRightLeft size={20} /> Copy / Move Keywords</h2>
                            <button className="modal-close" onClick={() => setShowCopyModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="copy-info">
                                <strong>{copyIds.length}</strong> keyword{copyIds.length > 1 ? 's' : ''} selected
                            </div>

                            <div className="form-group">
                                <label className="form-label">Mode</label>
                                <div className="copy-mode-toggle">
                                    <button
                                        type="button"
                                        className={`copy-mode-btn ${copyMode === 'copy' ? 'active' : ''}`}
                                        onClick={() => setCopyMode('copy')}
                                    >
                                        <Copy size={16} /> Copy
                                        <span className="copy-mode-desc">Duplicate to target</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`copy-mode-btn ${copyMode === 'move' ? 'active' : ''}`}
                                        onClick={() => setCopyMode('move')}
                                    >
                                        <ArrowRightLeft size={16} /> Move
                                        <span className="copy-mode-desc">Transfer to target</span>
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Target Device</label>
                                <select
                                    className="form-select"
                                    value={copyTargetDevice}
                                    onChange={(e) => setCopyTargetDevice(e.target.value)}
                                >
                                    <option value="">Global (No Device)</option>
                                    {devices.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}{d.phone ? ` (${d.phone})` : ''} — {d.status}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowCopyModal(false)}>Cancel</button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleCopyToDevice}
                                disabled={copyLoading}
                            >
                                {copyLoading ? <Loader2 size={16} className="spin" /> : (copyMode === 'copy' ? <Copy size={16} /> : <ArrowRightLeft size={16} />)}
                                {copyMode === 'copy' ? 'Copy' : 'Move'} {copyIds.length} Keyword{copyIds.length > 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .keyword-responses-page {
                    padding: 1.5rem;
                    padding-bottom: 5rem;
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
                    width: 420px;
                    max-width: calc(100vw - 3rem);
                    pointer-events: none;
                }
                .toast {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    padding: 0.85rem 1.1rem;
                    border-radius: 12px;
                    font-size: 0.88rem;
                    font-weight: 500;
                    pointer-events: all;
                    cursor: pointer;
                    animation: toastSlideIn 0.3s ease-out;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(12px);
                }
                .toast span {
                    flex: 1;
                }
                .toast button {
                    width: 22px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.15);
                    border: none;
                    border-radius: 6px;
                    color: inherit;
                    cursor: pointer;
                    opacity: 0.7;
                    transition: opacity 0.15s;
                }
                .toast button:hover {
                    opacity: 1;
                    background: rgba(255, 255, 255, 0.25);
                }
                .toast-error {
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95));
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
                .toast-success {
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 163, 74, 0.95));
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
                @keyframes toastSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(100px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
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
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.05), transparent);
                }
                .stat-card.muted {
                    opacity: 0.7;
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

                /* Search & Filter Bar */
                .search-filter-bar {
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                    margin-bottom: 1rem;
                    flex-wrap: wrap;
                }
                .search-box {
                    position: relative;
                    flex: 1;
                    min-width: 250px;
                }
                .search-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted);
                    pointer-events: none;
                }
                .search-input {
                    padding-left: 40px !important;
                    padding-right: 36px !important;
                }
                .search-clear {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: var(--bg-tertiary);
                    border: none;
                    border-radius: 50%;
                    width: 22px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: var(--text-secondary);
                }
                .search-clear:hover {
                    background: var(--border-color);
                }
                .filter-dropdown-wrapper {
                    position: relative;
                }
                .filter-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    white-space: nowrap;
                }
                .filter-btn.filter-active {
                    border-color: var(--primary-color);
                    color: var(--primary-color);
                    background: rgba(37, 211, 102, 0.08);
                }
                .filter-menu {
                    position: absolute;
                    top: calc(100% + 4px);
                    right: 0;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                    z-index: 50;
                    min-width: 160px;
                    overflow: hidden;
                }
                .filter-option {
                    display: block;
                    width: 100%;
                    padding: 0.7rem 1rem;
                    text-align: left;
                    border: none;
                    background: none;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    transition: background 0.15s;
                }
                .filter-option:hover {
                    background: var(--bg-tertiary);
                }
                .filter-option.selected {
                    color: var(--primary-color);
                    font-weight: 600;
                    background: rgba(37, 211, 102, 0.06);
                }
                .select-all-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    white-space: nowrap;
                    font-size: 0.85rem;
                }
                .select-all-btn.all-selected {
                    color: var(--primary-color);
                }
                .results-count {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.75rem;
                    padding: 0 0.25rem;
                }

                .test-section {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1.25rem;
                    margin-bottom: 1.5rem;
                }
                .test-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 600;
                    margin-bottom: 1rem;
                    color: var(--text-secondary);
                }
                .test-input-row {
                    display: flex;
                    gap: 0.75rem;
                }
                .test-input-row .form-input {
                    flex: 1;
                }
                .test-result {
                    margin-top: 1rem;
                    padding: 1rem;
                    border-radius: 8px;
                    font-size: 0.9rem;
                }
                .test-result.matched {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                }
                .test-result.not-matched {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                .test-response {
                    margin-top: 0.5rem;
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }
                .keywords-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .keyword-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1rem 1.25rem;
                    transition: all 0.2s;
                    display: flex;
                    gap: 0.75rem;
                    position: relative;
                }
                .keyword-card:hover {
                    border-color: var(--primary-color);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                .keyword-card.inactive {
                    opacity: 0.6;
                }
                .keyword-card.selected {
                    border-color: var(--primary-color);
                    background: rgba(37, 211, 102, 0.04);
                    box-shadow: 0 0 0 1px var(--primary-color);
                }
                .keyword-select {
                    padding-top: 2px;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .check-icon {
                    color: var(--text-muted);
                    transition: color 0.15s;
                }
                .check-icon.checked {
                    color: var(--primary-color);
                }
                .keyword-select:hover .check-icon {
                    color: var(--primary-color);
                }
                .keyword-content {
                    flex: 1;
                    min-width: 0;
                }
                .keyword-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 0.75rem;
                }
                .keyword-name {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .keyword-name code {
                    background: var(--bg-tertiary);
                    padding: 0.35rem 0.75rem;
                    border-radius: 6px;
                    font-family: 'Monaco', monospace;
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--primary-color);
                }
                .toggle-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                }
                .toggle-btn.on { color: var(--success-color); }
                .toggle-btn.off { color: var(--text-muted); }
                .keyword-response {
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    line-height: 1.5;
                    margin-bottom: 0.75rem;
                    padding: 0.75rem;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                }
                .keyword-meta {
                    display: flex;
                    gap: 1rem;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.75rem;
                }
                .meta-label {
                    color: var(--text-muted);
                }
                .keyword-tags {
                    display: flex;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                    flex-wrap: wrap;
                }
                .tag {
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-color);
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 500;
                }
                .tag.warn {
                    background: rgba(245, 158, 11, 0.1);
                    color: #f59e0b;
                }
                .tag.device {
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }
                .tag.global {
                    background: rgba(156, 163, 175, 0.1);
                    color: #9ca3af;
                }
                .tag.danger {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    font-weight: 600;
                }
                .tag.warning {
                    background: rgba(245, 158, 11, 0.1);
                    color: #f59e0b;
                    font-weight: 600;
                }
                .device-filter-wrapper {
                    min-width: 160px;
                }
                .device-filter-select {
                    font-size: 0.85rem;
                    padding: 0.5rem 0.75rem;
                    border-radius: 8px;
                }
                .device-filter-select.filter-active {
                    border-color: var(--primary-color);
                    color: var(--primary-color);
                }

                /* Copy/Move Modal */
                .copy-info {
                    background: var(--bg-tertiary);
                    padding: 0.75rem 1rem;
                    border-radius: 8px;
                    margin-bottom: 1rem;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                }
                .copy-mode-toggle {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.5rem;
                }
                .copy-mode-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.25rem;
                    padding: 0.75rem;
                    border: 2px solid var(--border-color);
                    border-radius: 10px;
                    background: var(--bg-card);
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    transition: all 0.15s;
                }
                .copy-mode-btn:hover {
                    border-color: var(--primary-color);
                }
                .copy-mode-btn.active {
                    border-color: var(--primary-color);
                    background: rgba(37, 211, 102, 0.06);
                    color: var(--primary-color);
                }
                .copy-mode-desc {
                    font-size: 0.7rem;
                    font-weight: 400;
                    color: var(--text-muted);
                }
                .btn-copy {
                    color: #3b82f6 !important;
                    border-color: rgba(59, 130, 246, 0.3) !important;
                }
                .btn-copy:hover {
                    background: rgba(59, 130, 246, 0.1) !important;
                }

                .keyword-actions {
                    display: flex;
                    gap: 0.5rem;
                    border-top: 1px solid var(--border-color);
                    padding-top: 0.75rem;
                    margin-top: 0.75rem;
                }
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--text-secondary);
                }
                .empty-state h3 {
                    margin: 1rem 0 0.5rem 0;
                    color: var(--text-primary);
                }

                /* Bulk Action Bar — floating at bottom */
                .bulk-action-bar {
                    position: fixed;
                    bottom: 1.5rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--bg-card);
                    border: 1px solid var(--primary-color);
                    border-radius: 16px;
                    padding: 0.75rem 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 1.25rem;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(37, 211, 102, 0.2);
                    z-index: 100;
                    animation: slideUp 0.25s ease-out;
                    backdrop-filter: blur(16px);
                    max-width: 95vw;
                }
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(120%); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                .bulk-info {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--primary-color);
                    font-size: 0.9rem;
                    white-space: nowrap;
                }
                .bulk-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .btn-bulk {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.5rem 0.9rem;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    transition: all 0.15s;
                    white-space: nowrap;
                }
                .btn-enable {
                    background: rgba(34, 197, 94, 0.12);
                    color: #22c55e;
                }
                .btn-enable:hover:not(:disabled) {
                    background: rgba(34, 197, 94, 0.22);
                }
                .btn-disable {
                    background: rgba(245, 158, 11, 0.12);
                    color: #f59e0b;
                }
                .btn-disable:hover:not(:disabled) {
                    background: rgba(245, 158, 11, 0.22);
                }
                .btn-delete {
                    background: rgba(239, 68, 68, 0.12);
                    color: #ef4444;
                }
                .btn-delete:hover:not(:disabled) {
                    background: rgba(239, 68, 68, 0.22);
                }
                .btn-bulk:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .bulk-divider {
                    width: 1px;
                    height: 24px;
                    background: var(--border-color);
                }
                .btn-cancel {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .btn-cancel:hover {
                    color: var(--text-primary);
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }

                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }
                .checkbox-group {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1.5rem;
                    margin-top: 0.5rem;
                }
                .checkbox-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }
                .checkbox-item input {
                    width: 18px;
                    height: 18px;
                    accent-color: var(--primary-color);
                }
                .badge {
                    padding: 0.2rem 0.5rem;
                    border-radius: 4px;
                    font-size: 0.7rem;
                    font-weight: 500;
                    background: var(--bg-tertiary);
                }
                .badge-contains { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
                .badge-exact { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
                .badge-starts_with { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                .badge-ends_with { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
                .badge-regex { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

                @media (max-width: 768px) {
                    .search-filter-bar { flex-direction: column; }
                    .search-box { min-width: 100%; }
                    .keywords-grid { grid-template-columns: 1fr; }
                    .bulk-action-bar {
                        bottom: 1rem;
                        flex-direction: column;
                        gap: 0.75rem;
                        padding: 1rem;
                    }
                    .bulk-actions { flex-wrap: wrap; justify-content: center; }
                }
            `}</style>
        </div>
    );
};

export default KeywordResponses;

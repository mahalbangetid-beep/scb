import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, Zap, MessageSquare, AlertTriangle, X, RefreshCw } from 'lucide-react';
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
        isActive: true
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [responsesRes, statsRes] = await Promise.all([
                api.get('/keyword-responses'),
                api.get('/keyword-responses/stats')
            ]);
            // API might return data directly or wrapped in .data
            const responseData = responsesRes.data?.data || responsesRes.data || [];
            const statsData = statsRes.data?.data || statsRes.data;
            console.log('[KeywordResponses] Parsed responses:', responseData);
            setResponses(Array.isArray(responseData) ? responseData : []);
            setStats(statsData);
        } catch (err) {
            console.error('[KeywordResponses] Fetch error:', err);
            setError('Failed to load keyword responses');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await api.put(`/keyword-responses/${editingItem.id}`, formData);
                setSuccess('Keyword response updated');
            } else {
                await api.post('/keyword-responses', formData);
                setSuccess('Keyword response created');
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
            keyword: item.keyword,
            matchType: item.matchType,
            caseSensitive: item.caseSensitive,
            responseText: item.responseText,
            triggerAction: item.triggerAction || 'NONE',
            platform: item.platform,
            applyToGroups: item.applyToGroups,
            applyToDMs: item.applyToDMs,
            priority: item.priority,
            isActive: item.isActive
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
            setTestResult(res.data.data);
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
            isActive: true
        });
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

            {/* Keywords Grid */}
            <div className="keywords-grid">
                {responses.length === 0 ? (
                    <div className="empty-state">
                        <MessageSquare size={48} />
                        <h3>No Keywords Configured</h3>
                        <p>Add your first keyword to start auto-replying</p>
                        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                            <Plus size={16} /> Add Keyword
                        </button>
                    </div>
                ) : (
                    responses.map(item => (
                        <div key={item.id} className={`keyword-card ${item.isActive ? 'active' : 'inactive'}`}>
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
                            </div>

                            <div className="keyword-actions">
                                <button className="btn btn-ghost" onClick={() => handleEdit(item)}>
                                    <Edit2 size={16} /> Edit
                                </button>
                                <button className="btn btn-ghost text-danger" onClick={() => handleDelete(item.id)}>
                                    <Trash2 size={16} /> Delete
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

            <style jsx>{`
                .keyword-responses-page {
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
                .keywords-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: 1rem;
                }
                .keyword-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1.25rem;
                    transition: all 0.2s;
                }
                .keyword-card:hover {
                    border-color: var(--primary-color);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                .keyword-card.inactive {
                    opacity: 0.6;
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
                .keyword-actions {
                    display: flex;
                    gap: 0.5rem;
                    border-top: 1px solid var(--border-color);
                    padding-top: 0.75rem;
                    margin-top: 0.75rem;
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
            `}</style>
        </div>
    );
};

export default KeywordResponses;

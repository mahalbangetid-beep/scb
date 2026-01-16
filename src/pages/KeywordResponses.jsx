import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, BarChart2, Zap, MessageSquare, AlertTriangle } from 'lucide-react';
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
            setResponses(responsesRes.data.data || []);
            setStats(statsRes.data.data);
        } catch (err) {
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
            EXACT: 'Exact Match',
            CONTAINS: 'Contains',
            STARTS_WITH: 'Starts With',
            ENDS_WITH: 'Ends With',
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
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><MessageSquare size={28} /> Keyword Responses</h1>
                    <p className="header-subtitle">Configure automatic replies based on keywords</p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setEditingItem(null); setShowModal(true); }}>
                    <Plus size={16} /> Add Keyword
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><Zap size={20} />{success}</div>}

            {/* Stats */}
            {stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{stats.total}</div>
                        <div className="stat-label">Total Keywords</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.active}</div>
                        <div className="stat-label">Active</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{stats.inactive}</div>
                        <div className="stat-label">Inactive</div>
                    </div>
                </div>
            )}

            {/* Test Section */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                    <h3><Search size={18} /> Test Keywords</h3>
                </div>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Enter a test message..."
                            value={testMessage}
                            onChange={(e) => setTestMessage(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-secondary" onClick={handleTest}>Test</button>
                </div>
                {testResult && (
                    <div className={`test-result ${testResult.matched ? 'matched' : 'not-matched'}`}>
                        {testResult.matched ? (
                            <>
                                <strong>✅ Match Found:</strong> {testResult.keyword} ({testResult.matchType})
                                <br />
                                <span>Response: {testResult.responseText.substring(0, 100)}...</span>
                            </>
                        ) : (
                            <span>❌ No matching keyword found</span>
                        )}
                    </div>
                )}
            </div>

            {/* Responses Table */}
            <div className="card">
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Keyword</th>
                                <th>Match Type</th>
                                <th>Response</th>
                                <th>Platform</th>
                                <th>Priority</th>
                                <th>Triggered</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {responses.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="empty-state">No keyword responses configured</td>
                                </tr>
                            ) : (
                                responses.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            <button
                                                className={`btn btn-ghost btn-icon ${item.isActive ? 'text-success' : 'text-muted'}`}
                                                onClick={() => handleToggle(item.id)}
                                                title={item.isActive ? 'Active' : 'Inactive'}
                                            >
                                                {item.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                            </button>
                                        </td>
                                        <td><code>{item.keyword}</code></td>
                                        <td><span className="badge">{getMatchTypeLabel(item.matchType)}</span></td>
                                        <td className="truncate" style={{ maxWidth: '200px' }}>{item.responseText}</td>
                                        <td><span className="badge badge-info">{item.platform}</span></td>
                                        <td>{item.priority}</td>
                                        <td>{item.triggerCount || 0}</td>
                                        <td>
                                            <div className="action-buttons">
                                                <button className="btn btn-ghost btn-icon" onClick={() => handleEdit(item)}><Edit2 size={16} /></button>
                                                <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDelete(item.id)}><Trash2 size={16} /></button>
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
                            <h3>{editingItem ? 'Edit' : 'Add'} Keyword Response</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Keyword *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.keyword}
                                        onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                                        placeholder="Enter keyword or pattern"
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Match Type</label>
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
                                        <label>Platform</label>
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
                                    <label>Response Text *</label>
                                    <textarea
                                        className="form-textarea"
                                        rows="4"
                                        value={formData.responseText}
                                        onChange={(e) => setFormData({ ...formData, responseText: e.target.value })}
                                        placeholder="Enter the automatic reply..."
                                        required
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Priority</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.priority}
                                            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                            min="0"
                                        />
                                        <small className="form-hint">Higher = checked first</small>
                                    </div>
                                    <div className="form-group">
                                        <label>Trigger Action</label>
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

                                <div className="form-row">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.applyToGroups}
                                            onChange={(e) => setFormData({ ...formData, applyToGroups: e.target.checked })}
                                        />
                                        Apply to Groups
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.applyToDMs}
                                            onChange={(e) => setFormData({ ...formData, applyToDMs: e.target.checked })}
                                        />
                                        Apply to DMs
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.caseSensitive}
                                            onChange={(e) => setFormData({ ...formData, caseSensitive: e.target.checked })}
                                        />
                                        Case Sensitive
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
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.25rem;
          text-align: center;
        }
        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--primary-color);
        }
        .stat-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .test-result {
          padding: 1rem;
          margin-top: 1rem;
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
        .truncate {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        code {
          background: var(--bg-tertiary);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-family: monospace;
        }
        .form-row {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .form-row .form-group {
          flex: 1;
          min-width: 150px;
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

export default KeywordResponses;

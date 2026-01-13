import { useState, useEffect } from 'react'
import {
    Users, Plus, Edit3, Trash2, X, Globe, Smartphone,
    MessageSquare, Loader2, AlertCircle, CheckCircle2,
    Send, RefreshCw, Filter, Download, Link2
} from 'lucide-react'
import api from '../services/api'

export default function ProviderGroups() {
    const [groups, setGroups] = useState([])
    const [panels, setPanels] = useState([])
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editGroup, setEditGroup] = useState(null)
    const [formData, setFormData] = useState({
        name: '',
        panelId: '',
        providerName: '', // Provider name from Admin API
        deviceId: '',
        groupType: 'GROUP',
        groupJid: '',
        targetNumber: '',
        refillTemplate: '',
        cancelTemplate: '',
        speedUpTemplate: '',
        isActive: true
    })
    const [formLoading, setFormLoading] = useState(false)
    const [error, setError] = useState(null)
    const [testLoading, setTestLoading] = useState(null)
    const [testResult, setTestResult] = useState(null)

    // Provider-related state
    const [providers, setProviders] = useState([])
    const [loadingProviders, setLoadingProviders] = useState(false)
    const [providerFilter, setProviderFilter] = useState('')
    const [syncingProviders, setSyncingProviders] = useState(false)

    useEffect(() => {
        fetchGroups()
        fetchPanels()
        fetchDevices()
    }, [])

    const fetchGroups = async () => {
        try {
            setLoading(true)
            const res = await api.get('/provider-groups')
            setGroups(res.data || [])
        } catch (err) {
            setError(err.message || 'Failed to fetch groups')
        } finally {
            setLoading(false)
        }
    }

    const fetchPanels = async () => {
        try {
            const res = await api.get('/panels?limit=100')
            setPanels(res.data || [])
        } catch (err) {
            console.error('Failed to fetch panels:', err)
        }
    }

    const fetchProviders = async (panelId) => {
        if (!panelId) {
            setProviders([])
            return
        }
        try {
            setLoadingProviders(true)
            const res = await api.get(`/panels/${panelId}/providers`)
            setProviders(res.data || [])
        } catch (err) {
            console.error('Failed to fetch providers:', err)
            setProviders([])
        } finally {
            setLoadingProviders(false)
        }
    }

    const handleSyncProviders = async () => {
        if (!formData.panelId) {
            setError('Please select a panel first')
            return
        }
        try {
            setSyncingProviders(true)
            const res = await api.post(`/panels/${formData.panelId}/sync-providers`)
            setProviders(res.data?.providers || [])
            setTestResult({ groupId: 'sync', success: true, message: `Synced ${res.data?.providers?.length || 0} providers` })
        } catch (err) {
            setError(err.error?.message || 'Failed to sync providers')
        } finally {
            setSyncingProviders(false)
        }
    }

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data?.devices || res.data || [])
        } catch (err) {
            console.error('Failed to fetch devices:', err)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setFormLoading(true)
        setError(null)

        try {
            if (editGroup) {
                await api.put(`/provider-groups/${editGroup.id}`, formData)
            } else {
                await api.post('/provider-groups', formData)
            }
            setShowModal(false)
            setEditGroup(null)
            resetForm()
            fetchGroups()
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save group')
        } finally {
            setFormLoading(false)
        }
    }

    const handleEdit = (group) => {
        setEditGroup(group)
        setFormData({
            name: group.name,
            panelId: group.panelId,
            providerName: group.providerName || '',
            deviceId: group.deviceId || '',
            groupType: group.groupType || 'GROUP',
            groupJid: group.groupJid || '',
            targetNumber: group.targetNumber || '',
            refillTemplate: group.refillTemplate || '',
            cancelTemplate: group.cancelTemplate || '',
            speedUpTemplate: group.speedUpTemplate || '',
            isActive: group.isActive
        })
        // Fetch providers for the panel
        if (group.panelId) {
            fetchProviders(group.panelId)
        }
        setShowModal(true)
    }

    const handleDelete = async (groupId) => {
        if (!confirm('Are you sure you want to delete this provider group?')) return

        try {
            await api.delete(`/provider-groups/${groupId}`)
            fetchGroups()
        } catch (err) {
            setError(err.message || 'Failed to delete group')
        }
    }

    const handleTest = async (groupId) => {
        setTestLoading(groupId)
        setTestResult(null)

        try {
            const res = await api.post(`/provider-groups/${groupId}/test`)
            setTestResult({ groupId, success: true, message: res.message || 'Test message sent!' })
        } catch (err) {
            setTestResult({ groupId, success: false, message: err.error?.message || err.message })
        } finally {
            setTestLoading(null)
        }
    }

    const resetForm = () => {
        setFormData({
            name: '',
            panelId: '',
            providerName: '',
            deviceId: '',
            groupType: 'GROUP',
            groupJid: '',
            targetNumber: '',
            refillTemplate: '',
            cancelTemplate: '',
            speedUpTemplate: '',
            isActive: true
        })
        setProviders([])
        setTestResult(null)
    }

    const getConnectedDevices = () => {
        return devices.filter(d => d.status === 'connected')
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Provider Groups</h1>
                    <p className="page-subtitle">Manage provider groups for forwarding commands</p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setEditGroup(null); setShowModal(true); }}>
                    <Plus size={18} />
                    Add Provider Group
                </button>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="filter-group">
                    <Filter size={18} />
                    <select
                        className="form-select"
                        value={providerFilter}
                        onChange={(e) => setProviderFilter(e.target.value)}
                    >
                        <option value="">All Providers</option>
                        {/* Get unique provider names from groups */}
                        {[...new Set(groups.filter(g => g.providerName).map(g => g.providerName))].map(pn => (
                            <option key={pn} value={pn}>{pn}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-stats">
                    <span>{groups.filter(g => !providerFilter || g.providerName === providerFilter).length} groups</span>
                    {providerFilter && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setProviderFilter('')}>
                            <X size={14} /> Clear
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading provider groups...</p>
                </div>
            ) : groups.length === 0 ? (
                <div className="empty-state">
                    <Users size={64} className="text-secondary" />
                    <h3>No Provider Groups</h3>
                    <p>Create provider groups to forward commands to your SMM panel providers</p>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={18} />
                        Add Your First Group
                    </button>
                </div>
            ) : (
                <div className="groups-grid">
                    {groups
                        .filter(g => !providerFilter || g.providerName === providerFilter)
                        .map(group => (
                            <div key={group.id} className={`group-card ${group.isActive ? '' : 'inactive'}`}>
                                <div className="group-card-header">
                                    <div className="group-icon">
                                        {group.groupType === 'DIRECT' ? (
                                            <MessageSquare size={24} />
                                        ) : (
                                            <Users size={24} />
                                        )}
                                    </div>
                                    <div className="group-info">
                                        <h3>{group.name}</h3>
                                        <p>{group.panel?.alias || 'No panel linked'}</p>
                                        {group.providerName && (
                                            <span className="provider-badge">
                                                <Link2 size={12} />
                                                {group.providerName}
                                            </span>
                                        )}
                                    </div>
                                    <div className="group-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(group)}>
                                            <Edit3 size={16} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(group.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="group-card-body">
                                    <div className="group-details">
                                        <div className="detail-item">
                                            <span className="detail-label">Type</span>
                                            <span className={`badge badge-${group.groupType === 'GROUP' ? 'primary' : 'secondary'}`}>
                                                {group.groupType === 'GROUP' ? 'WhatsApp Group' : 'Direct Message'}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Device</span>
                                            <span>{group.device?.name || 'Not linked'}</span>
                                        </div>
                                        {group.groupType === 'DIRECT' && group.targetNumber && (
                                            <div className="detail-item">
                                                <span className="detail-label">Target</span>
                                                <span>{group.targetNumber}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="group-status">
                                        <span className={`status-badge ${group.isActive ? 'active' : 'inactive'}`}>
                                            {group.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                        {group.device?.status === 'connected' ? (
                                            <span className="status-badge connected">Device Connected</span>
                                        ) : (
                                            <span className="status-badge disconnected">Device Offline</span>
                                        )}
                                    </div>

                                    {testResult && testResult.groupId === group.id && (
                                        <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                                            {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                            <span>{testResult.message}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="group-card-footer">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleTest(group.id)}
                                        disabled={testLoading === group.id || group.device?.status !== 'connected'}
                                    >
                                        {testLoading === group.id ? (
                                            <Loader2 className="animate-spin" size={14} />
                                        ) : (
                                            <Send size={14} />
                                        )}
                                        Test Message
                                    </button>
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editGroup ? 'Edit Provider Group' : 'Add Provider Group'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {error && (
                                    <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <AlertCircle size={16} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Group Name *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g., SMM Panel Support"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">SMM Panel *</label>
                                        <select
                                            className="form-select"
                                            value={formData.panelId}
                                            onChange={(e) => {
                                                setFormData({ ...formData, panelId: e.target.value, providerName: '' })
                                                fetchProviders(e.target.value)
                                            }}
                                            required
                                        >
                                            <option value="">Select Panel</option>
                                            {panels.map(p => (
                                                <option key={p.id} value={p.id}>{p.alias} - {p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Provider Selection */}
                                {formData.panelId && (
                                    <div className="form-group provider-selection">
                                        <label className="form-label">
                                            <Link2 size={14} /> Provider Name (from Admin API)
                                        </label>
                                        <div className="provider-input-group">
                                            <select
                                                className="form-select"
                                                value={formData.providerName}
                                                onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                                            >
                                                <option value="">Select Provider (Optional)</option>
                                                {loadingProviders ? (
                                                    <option disabled>Loading providers...</option>
                                                ) : providers.length > 0 ? (
                                                    providers.map(p => (
                                                        <option key={p.name} value={p.name}>{p.name}</option>
                                                    ))
                                                ) : (
                                                    <option disabled>No providers found - Click Sync</option>
                                                )}
                                            </select>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={handleSyncProviders}
                                                disabled={syncingProviders}
                                                title="Sync providers from panel"
                                            >
                                                {syncingProviders ? (
                                                    <Loader2 className="animate-spin" size={16} />
                                                ) : (
                                                    <Download size={16} />
                                                )}
                                                Sync
                                            </button>
                                        </div>
                                        <p className="form-hint">
                                            Link this group to a specific provider. Requires Admin API access on the panel.
                                        </p>
                                    </div>
                                )}

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">WhatsApp Device</label>
                                        <select
                                            className="form-select"
                                            value={formData.deviceId}
                                            onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                                        >
                                            <option value="">Select Device</option>
                                            {devices.map(d => (
                                                <option key={d.id} value={d.id}>
                                                    {d.name} ({d.status})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Message Type *</label>
                                        <select
                                            className="form-select"
                                            value={formData.groupType}
                                            onChange={(e) => setFormData({ ...formData, groupType: e.target.value })}
                                        >
                                            <option value="GROUP">WhatsApp Group</option>
                                            <option value="DIRECT">Direct Message</option>
                                        </select>
                                    </div>
                                </div>

                                {formData.groupType === 'GROUP' ? (
                                    <div className="form-group">
                                        <label className="form-label">Group JID *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g., 1234567890@g.us"
                                            value={formData.groupJid}
                                            onChange={(e) => setFormData({ ...formData, groupJid: e.target.value })}
                                            required={formData.groupType === 'GROUP'}
                                        />
                                        <p className="form-hint">WhatsApp Group ID (ends with @g.us)</p>
                                    </div>
                                ) : (
                                    <div className="form-group">
                                        <label className="form-label">Target Phone Number *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g., 6281234567890"
                                            value={formData.targetNumber}
                                            onChange={(e) => setFormData({ ...formData, targetNumber: e.target.value })}
                                            required={formData.groupType === 'DIRECT'}
                                        />
                                        <p className="form-hint">Provider's WhatsApp number (with country code)</p>
                                    </div>
                                )}

                                <hr style={{ margin: 'var(--spacing-lg) 0', borderColor: 'var(--border-color)' }} />
                                <h4 style={{ marginBottom: 'var(--spacing-md)' }}>Message Templates (Optional)</h4>

                                <div className="form-group">
                                    <label className="form-label">Refill Template</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Custom refill message template..."
                                        value={formData.refillTemplate}
                                        onChange={(e) => setFormData({ ...formData, refillTemplate: e.target.value })}
                                        rows={3}
                                    />
                                    <p className="form-hint">
                                        Variables: {'{externalOrderId}'}, {'{panelAlias}'}, {'{serviceName}'}, {'{link}'}, {'{quantity}'}, {'{timestamp}'}
                                    </p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Cancel Template</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Custom cancel message template..."
                                        value={formData.cancelTemplate}
                                        onChange={(e) => setFormData({ ...formData, cancelTemplate: e.target.value })}
                                        rows={3}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Speed-up Template</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Custom speed-up message template..."
                                        value={formData.speedUpTemplate}
                                        onChange={(e) => setFormData({ ...formData, speedUpTemplate: e.target.value })}
                                        rows={3}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        />
                                        <span>Active</span>
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : editGroup ? (
                                        'Update Group'
                                    ) : (
                                        'Add Group'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .groups-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                    gap: var(--spacing-lg);
                }

                .group-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                    transition: all 0.2s ease;
                }

                .group-card:hover {
                    border-color: var(--primary-500);
                }

                .group-card.inactive {
                    opacity: 0.7;
                }

                .group-card-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                }

                .group-icon {
                    width: 48px;
                    height: 48px;
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }

                .group-info {
                    flex: 1;
                }

                .group-info h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .group-info p {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    margin: 0;
                }

                .group-actions {
                    display: flex;
                    gap: var(--spacing-xs);
                }

                .group-card-body {
                    padding: var(--spacing-lg);
                }

                .group-details {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-md);
                }

                .detail-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .detail-label {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .group-status {
                    display: flex;
                    gap: var(--spacing-sm);
                    flex-wrap: wrap;
                }

                .status-badge {
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .status-badge.active {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .status-badge.inactive {
                    background: rgba(107, 114, 128, 0.1);
                    color: #6b7280;
                }

                .status-badge.connected {
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }

                .status-badge.disconnected {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .test-result {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-top: var(--spacing-md);
                    font-size: 0.875rem;
                }

                .test-result.success {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .test-result.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .group-card-footer {
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                }

                .group-card-footer .btn {
                    width: 100%;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    text-align: center;
                }

                .empty-state h3 {
                    margin-top: var(--spacing-lg);
                    margin-bottom: var(--spacing-sm);
                }

                .empty-state p {
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-lg);
                }

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .loading-container p {
                    margin-top: var(--spacing-md);
                }

                .form-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-md);
                }

                @media (max-width: 768px) {
                    .form-row {
                        grid-template-columns: 1fr;
                    }
                }

                .form-textarea {
                    width: 100%;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-family: inherit;
                    resize: vertical;
                }

                .form-textarea:focus {
                    outline: none;
                    border-color: var(--primary-500);
                }

                .modal-lg {
                    max-width: 700px;
                }

                .badge-primary {
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                }

                .badge-secondary {
                    background: rgba(107, 114, 128, 0.1);
                    color: #6b7280;
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    cursor: pointer;
                }

                .checkbox-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    accent-color: var(--primary-500);
                }

                .alert {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .alert-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                }

                /* Filter Bar */
                .filter-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    margin-bottom: var(--spacing-lg);
                }

                .filter-group {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    color: var(--text-secondary);
                }

                .filter-group .form-select {
                    min-width: 200px;
                }

                .filter-stats {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                /* Provider Badge */
                .provider-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.15), rgba(37, 211, 102, 0.05));
                    border: 1px solid rgba(37, 211, 102, 0.3);
                    color: var(--primary-500);
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.7rem;
                    font-weight: 500;
                    margin-top: 4px;
                }

                /* Provider Selection in Form */
                .provider-selection {
                    padding: var(--spacing-md);
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.05), transparent);
                    border: 1px solid rgba(37, 211, 102, 0.2);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                }

                .provider-selection .form-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--primary-500);
                }

                .provider-input-group {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .provider-input-group .form-select {
                    flex: 1;
                }

                .provider-input-group .btn {
                    white-space: nowrap;
                }
            `}</style>
        </div>
    )
}

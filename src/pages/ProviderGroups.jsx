import { useState, useEffect } from 'react'
import {
    Users, Plus, Edit3, Trash2, X, Globe, Smartphone,
    MessageSquare, Loader2, AlertCircle, CheckCircle2,
    Send, RefreshCw, Filter, Download, Link2, Settings, Hash, ArrowRight
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
        newOrderTemplate: '',
        refillTemplate: '',
        cancelTemplate: '',
        speedUpTemplate: '',
        isActive: true,
        isManualServiceGroup: false  // For manual services (no provider)
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

    // Service ID Rules state
    const [showRulesModal, setShowRulesModal] = useState(false)
    const [rulesGroup, setRulesGroup] = useState(null)
    const [serviceIdRules, setServiceIdRules] = useState({})
    const [rulesLoading, setRulesLoading] = useState(false)
    const [newRule, setNewRule] = useState({ serviceId: '', targetJid: '' })
    const [rulesSaving, setRulesSaving] = useState(false)
    const [rulesError, setRulesError] = useState(null)

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
            setError(err.response?.data?.message || err.message || 'Failed to save group')
        } finally {
            setFormLoading(false)
        }
    }

    const handleEdit = (group) => {
        setEditGroup(group)
        setFormData({
            name: group.groupName || group.name || '',
            panelId: group.panelId,
            providerName: group.providerName || '',
            deviceId: group.deviceId || '',
            groupType: group.groupType || 'GROUP',
            groupJid: group.groupId || group.groupJid || '',
            targetNumber: group.targetNumber || '',
            newOrderTemplate: group.newOrderTemplate || '',
            refillTemplate: group.refillTemplate || '',
            cancelTemplate: group.cancelTemplate || '',
            speedUpTemplate: group.speedUpTemplate || '',
            isActive: group.isActive,
            isManualServiceGroup: group.isManualServiceGroup || false
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
            setError(err.response?.data?.message || err.message || 'Failed to delete group')
        }
    }

    const handleToggle = async (groupId) => {
        try {
            await api.patch(`/provider-groups/${groupId}/toggle`)
            fetchGroups()
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to toggle group')
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
            newOrderTemplate: '',
            refillTemplate: '',
            cancelTemplate: '',
            speedUpTemplate: '',
            isActive: true,
            isManualServiceGroup: false
        })
        setProviders([])
        setTestResult(null)
    }

    const getConnectedDevices = () => {
        return devices.filter(d => d.status === 'connected')
    }

    // ==================== SERVICE ID RULES FUNCTIONS ====================
    const openRulesModal = async (group) => {
        setRulesGroup(group)
        setRulesError(null)
        setNewRule({ serviceId: '', targetJid: '' })
        setShowRulesModal(true)
        await fetchServiceIdRules(group.id)
    }

    const fetchServiceIdRules = async (groupId) => {
        try {
            setRulesLoading(true)
            const res = await api.get(`/provider-groups/${groupId}/service-id-rules`)
            setServiceIdRules(res.data?.rules || {})
        } catch (err) {
            console.error('Failed to fetch service ID rules:', err)
            setRulesError(err.error?.message || 'Failed to fetch rules')
            setServiceIdRules({})
        } finally {
            setRulesLoading(false)
        }
    }

    const handleAddRule = async () => {
        if (!newRule.serviceId || !newRule.targetJid) {
            setRulesError('Both Service ID and Target JID are required')
            return
        }

        try {
            setRulesSaving(true)
            setRulesError(null)
            await api.post(`/provider-groups/${rulesGroup.id}/service-id-rules/add`, {
                serviceId: newRule.serviceId,
                targetJid: newRule.targetJid
            })
            setNewRule({ serviceId: '', targetJid: '' })
            await fetchServiceIdRules(rulesGroup.id)
        } catch (err) {
            setRulesError(err.error?.message || 'Failed to add rule')
        } finally {
            setRulesSaving(false)
        }
    }

    const handleDeleteRule = async (serviceId) => {
        if (!confirm(`Delete routing rule for Service ID ${serviceId}?`)) return

        try {
            setRulesSaving(true)
            await api.delete(`/provider-groups/${rulesGroup.id}/service-id-rules/${serviceId}`)
            await fetchServiceIdRules(rulesGroup.id)
        } catch (err) {
            setRulesError(err.error?.message || 'Failed to delete rule')
        } finally {
            setRulesSaving(false)
        }
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
                                        <h3>{group.groupName || group.name}</h3>
                                        <p>{group.panel?.alias || 'No panel linked'}</p>
                                        {group.providerName && (
                                            <span className="provider-badge">
                                                <Link2 size={12} />
                                                {group.providerName}
                                            </span>
                                        )}
                                        {group.isManualServiceGroup && (
                                            <span className="manual-badge">
                                                <Settings size={12} />
                                                Manual Services
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
                                        <button
                                            className={`status-toggle ${group.isActive ? 'active' : 'inactive'}`}
                                            onClick={() => handleToggle(group.id)}
                                            title={`Click to ${group.isActive ? 'deactivate' : 'activate'}`}
                                        >
                                            {group.isActive ? 'Active' : 'Inactive'}
                                        </button>
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
                                    <div className="footer-buttons">
                                        <button
                                            className="btn btn-outline btn-sm"
                                            onClick={() => openRulesModal(group)}
                                            title="Configure Service ID Routing Rules"
                                        >
                                            <Hash size={14} />
                                            Service Rules
                                        </button>
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
                                            Test
                                        </button>
                                    </div>
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

                                {/* Manual Service Group Toggle */}
                                <div className={`manual-service-section ${formData.isManualServiceGroup ? 'active' : ''}`}>
                                    <label className="checkbox-label manual-service-toggle">
                                        <input
                                            type="checkbox"
                                            checked={formData.isManualServiceGroup}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                isManualServiceGroup: e.target.checked,
                                                providerName: e.target.checked ? '' : formData.providerName  // Clear provider if manual
                                            })}
                                        />
                                        <div className="toggle-content">
                                            <span className="toggle-title">
                                                <Settings size={14} />
                                                Manual Services Group
                                            </span>
                                            <span className="toggle-hint">
                                                Enable this for orders without provider info (custom/manual services)
                                            </span>
                                        </div>
                                    </label>
                                </div>
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
                                    <label className="form-label">New Order Template</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Custom new order message template..."
                                        value={formData.newOrderTemplate}
                                        onChange={(e) => setFormData({ ...formData, newOrderTemplate: e.target.value })}
                                        rows={3}
                                    />
                                    <p className="form-hint">
                                        Sent when a new order is placed. Variables: {'{orderDisplayId}'}, {'{panelAlias}'}, {'{providerName}'}, {'{serviceName}'}, {'{serviceId}'}, {'{link}'}, {'{quantity}'}, {'{timestamp}'}
                                    </p>
                                </div>

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

            {/* Service ID Rules Modal */}
            {showRulesModal && rulesGroup && (
                <div className="modal-overlay open" onClick={() => setShowRulesModal(false)}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title-section">
                                <h2>
                                    <Hash size={20} />
                                    Service ID Routing Rules
                                </h2>
                                <p className="modal-subtitle">
                                    {rulesGroup.name} • Route specific services to different destinations
                                </p>
                            </div>
                            <button className="modal-close" onClick={() => setShowRulesModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {rulesError && (
                                <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <AlertCircle size={16} />
                                    <span>{rulesError}</span>
                                    <button onClick={() => setRulesError(null)}><X size={14} /></button>
                                </div>
                            )}

                            {/* Add New Rule Form */}
                            <div className="add-rule-section">
                                <h4>
                                    <Plus size={16} />
                                    Add Routing Rule
                                </h4>
                                <div className="add-rule-form">
                                    <div className="form-group">
                                        <label className="form-label">Service ID</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g., 1234"
                                            value={newRule.serviceId}
                                            onChange={(e) => setNewRule({ ...newRule, serviceId: e.target.value })}
                                        />
                                    </div>
                                    <div className="rule-arrow">
                                        <ArrowRight size={20} />
                                    </div>
                                    <div className="form-group" style={{ flex: 2 }}>
                                        <label className="form-label">Target JID / Phone</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="e.g., 120363xxx@g.us or 6281xxx"
                                            value={newRule.targetJid}
                                            onChange={(e) => setNewRule({ ...newRule, targetJid: e.target.value })}
                                        />
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleAddRule}
                                        disabled={rulesSaving || !newRule.serviceId || !newRule.targetJid}
                                    >
                                        {rulesSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                        Add
                                    </button>
                                </div>
                                <p className="form-hint">
                                    When an order with this Service ID is processed, it will be forwarded to the specified destination instead of the default group.
                                </p>
                            </div>

                            {/* Existing Rules Table */}
                            <div className="rules-section">
                                <h4>
                                    <Settings size={16} />
                                    Current Rules ({Object.keys(serviceIdRules).length})
                                </h4>

                                {rulesLoading ? (
                                    <div className="rules-loading">
                                        <Loader2 className="animate-spin" size={24} />
                                        <span>Loading rules...</span>
                                    </div>
                                ) : Object.keys(serviceIdRules).length === 0 ? (
                                    <div className="rules-empty">
                                        <Hash size={32} />
                                        <p>No routing rules configured</p>
                                        <span>Add a rule above to route specific services to different destinations</span>
                                    </div>
                                ) : (
                                    <div className="rules-table">
                                        <div className="rules-header">
                                            <div className="rules-col service-col">Service ID</div>
                                            <div className="rules-col arrow-col"></div>
                                            <div className="rules-col target-col">Target Destination</div>
                                            <div className="rules-col action-col">Action</div>
                                        </div>
                                        {Object.entries(serviceIdRules).map(([serviceId, targetJid]) => (
                                            <div key={serviceId} className="rules-row">
                                                <div className="rules-col service-col">
                                                    <span className="service-id-badge">
                                                        <Hash size={12} />
                                                        {serviceId}
                                                    </span>
                                                </div>
                                                <div className="rules-col arrow-col">
                                                    <ArrowRight size={16} className="arrow-icon" />
                                                </div>
                                                <div className="rules-col target-col">
                                                    <span className="target-jid" title={targetJid}>
                                                        {targetJid.includes('@g.us') ? (
                                                            <><Users size={12} /> {targetJid}</>
                                                        ) : (
                                                            <><Smartphone size={12} /> {targetJid}</>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="rules-col action-col">
                                                    <button
                                                        className="btn btn-ghost btn-sm btn-danger"
                                                        onClick={() => handleDeleteRule(serviceId)}
                                                        disabled={rulesSaving}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowRulesModal(false)}>
                                Close
                            </button>
                        </div>
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

                .status-toggle {
                    padding: 4px 12px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .status-toggle.active {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .status-toggle.active:hover {
                    background: rgba(34, 197, 94, 0.2);
                }

                .status-toggle.inactive {
                    background: rgba(107, 114, 128, 0.1);
                    color: #6b7280;
                }

                .status-toggle.inactive:hover {
                    background: rgba(107, 114, 128, 0.2);
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
                    max-height: 85vh;
                    overflow-y: auto;
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

                /* Footer Buttons */
                .footer-buttons {
                    display: flex;
                    gap: var(--spacing-sm);
                    width: 100%;
                }

                .footer-buttons .btn {
                    flex: 1;
                }

                .btn-outline {
                    background: transparent;
                    border: 1px solid var(--border-color);
                    color: var(--text-primary);
                }

                .btn-outline:hover {
                    background: var(--bg-tertiary);
                    border-color: var(--primary-500);
                    color: var(--primary-500);
                }

                /* Service ID Rules Modal Styles */
                .modal-title-section {
                    flex: 1;
                }

                .modal-title-section h2 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin: 0;
                }

                .modal-subtitle {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    margin: var(--spacing-xs) 0 0 0;
                }

                .add-rule-section {
                    background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), transparent);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    margin-bottom: var(--spacing-lg);
                }

                .add-rule-section h4 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin: 0 0 var(--spacing-md) 0;
                    color: #3b82f6;
                    font-size: 0.9rem;
                }

                .add-rule-form {
                    display: flex;
                    align-items: flex-end;
                    gap: var(--spacing-md);
                }

                .add-rule-form .form-group {
                    flex: 1;
                    margin: 0;
                }

                .add-rule-form .form-label {
                    font-size: 0.75rem;
                    margin-bottom: var(--spacing-xs);
                }

                .rule-arrow {
                    padding-bottom: 10px;
                    color: var(--text-secondary);
                }

                .rules-section {
                    margin-top: var(--spacing-lg);
                }

                .rules-section h4 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin: 0 0 var(--spacing-md) 0;
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                }

                .rules-loading,
                .rules-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-xl);
                    color: var(--text-secondary);
                    text-align: center;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .rules-loading span,
                .rules-empty p {
                    margin-top: var(--spacing-sm);
                    font-weight: 500;
                }

                .rules-empty span {
                    font-size: 0.875rem;
                    opacity: 0.7;
                }

                .rules-table {
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                }

                .rules-header {
                    display: flex;
                    background: var(--bg-tertiary);
                    padding: var(--spacing-sm) var(--spacing-md);
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .rules-row {
                    display: flex;
                    padding: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    align-items: center;
                    transition: background 0.15s;
                }

                .rules-row:last-child {
                    border-bottom: none;
                }

                .rules-row:hover {
                    background: rgba(37, 211, 102, 0.03);
                }

                .rules-col {
                    display: flex;
                    align-items: center;
                }

                .service-col {
                    width: 120px;
                }

                .arrow-col {
                    width: 40px;
                    justify-content: center;
                }

                .target-col {
                    flex: 1;
                }

                .action-col {
                    width: 60px;
                    justify-content: flex-end;
                }

                .service-id-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05));
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    color: #8b5cf6;
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    font-size: 0.875rem;
                    font-weight: 600;
                    font-family: 'Monaco', 'Consolas', monospace;
                }

                .arrow-icon {
                    color: var(--text-secondary);
                    opacity: 0.5;
                }

                .target-jid {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.875rem;
                    color: var(--text-primary);
                    font-family: 'Monaco', 'Consolas', monospace;
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .btn-danger {
                    color: #ef4444 !important;
                }

                .btn-danger:hover {
                    background: rgba(239, 68, 68, 0.1) !important;
                }

                @media (max-width: 768px) {
                    .add-rule-form {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .add-rule-form .form-group {
                        flex: none !important;
                    }

                    .rule-arrow {
                        display: none;
                    }

                    .rules-header {
                        display: none;
                    }

                    .rules-row {
                        flex-wrap: wrap;
                        gap: var(--spacing-sm);
                    }

                    .service-col,
                    .arrow-col,
                    .target-col,
                    .action-col {
                        width: auto;
                    }

                    .arrow-col {
                        display: none;
                    }
                }

                /* Manual Service Badge */
                .manual-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05));
                    border: 1px solid rgba(245, 158, 11, 0.3);
                    color: #f59e0b;
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.7rem;
                    font-weight: 500;
                    margin-top: 4px;
                    margin-left: 4px;
                }

                /* Manual Service Section in Form */
                .manual-service-section {
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px dashed var(--border-color);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                    transition: all 0.2s ease;
                }

                .manual-service-section.active {
                    background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), transparent);
                    border: 1px solid rgba(245, 158, 11, 0.4);
                }

                .manual-service-toggle {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                }

                .manual-service-toggle input[type="checkbox"] {
                    margin-top: 4px;
                }

                .toggle-content {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .toggle-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .manual-service-section.active .toggle-title {
                    color: #f59e0b;
                }

                .toggle-hint {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }
            `}</style>
        </div>
    )
}

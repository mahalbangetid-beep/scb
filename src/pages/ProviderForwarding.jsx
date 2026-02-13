import { useState, useEffect } from 'react'
import {
    Send,
    Plus,
    Edit3,
    Trash2,
    Save,
    TestTube,
    AlertCircle,
    CheckCircle,
    Loader2,
    MessageSquare,
    PhoneCall,
    Bell,
    Settings2,
    RefreshCw,
    Eye,
    EyeOff,
    Copy,
    ChevronDown,
    ChevronRight,
    Search
} from 'lucide-react'
import api from '../services/api'

export default function ProviderForwarding() {
    const [loading, setLoading] = useState(true)
    const [configs, setConfigs] = useState([])
    const [logs, setLogs] = useState([])
    const [showModal, setShowModal] = useState(false)
    const [editingConfig, setEditingConfig] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(null)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('mapping') // Changed default to mapping
    const [expandedLogs, setExpandedLogs] = useState(null)

    // NEW: Quick Mapping State
    const [panels, setPanels] = useState([])
    const [providers, setProviders] = useState([])
    const [supportGroups, setSupportGroups] = useState([])
    const [selectedPanel, setSelectedPanel] = useState('')
    const [loadingProviders, setLoadingProviders] = useState(false)
    const [mappings, setMappings] = useState([]) // { providerName, supportGroupId }

    const [formData, setFormData] = useState({
        providerName: '',
        alias: '',
        providerDomain: '',
        forwardRefill: true,
        forwardCancel: true,
        forwardSpeedup: true,
        forwardStatus: false,
        whatsappGroupJid: '',
        whatsappNumber: '',
        telegramChatId: '',
        errorGroupJid: '',
        errorNotifyEnabled: true,
        refillTemplate: '',
        cancelTemplate: '',
        speedupTemplate: '',
        priority: 0,
        isActive: true
    })

    useEffect(() => {
        fetchConfigs()
        fetchLogs()
        fetchPanels()
        fetchSupportGroups()
    }, [])

    // NEW: Fetch panels
    const fetchPanels = async () => {
        try {
            const res = await api.get('/panels')
            setPanels(res.data.data || res.data || [])
        } catch (err) {
            console.error('Failed to fetch panels:', err)
        }
    }

    // NEW: Fetch support groups
    const fetchSupportGroups = async () => {
        try {
            const res = await api.get('/provider-groups')
            setSupportGroups(res.data.data || res.data || [])
        } catch (err) {
            console.error('Failed to fetch support groups:', err)
        }
    }

    // NEW: Fetch providers from selected panel
    const fetchProvidersForPanel = async (panelId) => {
        if (!panelId) {
            setProviders([])
            return
        }
        try {
            setLoadingProviders(true)
            const res = await api.post(`/panels/${panelId}/sync-providers`)
            const providersList = res.data.data?.providers || res.data?.providers || []
            setProviders(providersList)
        } catch (err) {
            console.error('Failed to fetch providers:', err)
            setProviders([])
        } finally {
            setLoadingProviders(false)
        }
    }

    // NEW: Handle panel selection
    const handlePanelSelect = (panelId) => {
        setSelectedPanel(panelId)
        fetchProvidersForPanel(panelId)
    }

    // NEW: Save mapping (provider -> support group)
    const saveMapping = async (providerName, supportGroupId) => {
        try {
            setSaving(true)
            // Update or create config with the support group mapping
            const existingConfig = configs.find(c => c.providerName === providerName)
            const supportGroup = supportGroups.find(g => g.id === supportGroupId)

            const mappingData = {
                providerName,
                alias: providerName,
                whatsappGroupJid: supportGroup?.groupId || '',
                forwardRefill: true,
                forwardCancel: true,
                forwardSpeedup: true,
                isActive: true
            }

            if (existingConfig) {
                await api.put(`/provider-config/${existingConfig.id}`, mappingData)
            } else {
                await api.post('/provider-config', mappingData)
            }

            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            fetchConfigs()
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save mapping')
        } finally {
            setSaving(false)
        }
    }

    const fetchConfigs = async () => {
        try {
            setLoading(true)
            const res = await api.get('/provider-config')
            setConfigs(res.data.data || res.data || [])
        } catch (err) {
            console.error('Failed to fetch configs:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchLogs = async () => {
        try {
            const res = await api.get('/provider-config/logs?limit=50')
            setLogs(res.data.data?.logs || res.data?.logs || [])
        } catch (err) {
            console.error('Failed to fetch logs:', err)
        }
    }

    const handleAdd = () => {
        setEditingConfig(null)
        setFormData({
            providerName: '',
            alias: '',
            providerDomain: '',
            forwardRefill: true,
            forwardCancel: true,
            forwardSpeedup: true,
            forwardStatus: false,
            whatsappGroupJid: '',
            whatsappNumber: '',
            telegramChatId: '',
            errorGroupJid: '',
            errorNotifyEnabled: true,
            refillTemplate: '',
            cancelTemplate: '',
            speedupTemplate: '',
            priority: 0,
            isActive: true
        })
        setShowModal(true)
    }

    const handleEdit = (config) => {
        setEditingConfig(config)
        setFormData({
            providerName: config.providerName || '',
            alias: config.alias || '',
            providerDomain: config.providerDomain || '',
            forwardRefill: config.forwardRefill ?? true,
            forwardCancel: config.forwardCancel ?? true,
            forwardSpeedup: config.forwardSpeedup ?? true,
            forwardStatus: config.forwardStatus ?? false,
            whatsappGroupJid: config.whatsappGroupJid || '',
            whatsappNumber: config.whatsappNumber || '',
            telegramChatId: config.telegramChatId || '',
            errorGroupJid: config.errorGroupJid || '',
            errorNotifyEnabled: config.errorNotifyEnabled ?? true,
            refillTemplate: config.refillTemplate || '',
            cancelTemplate: config.cancelTemplate || '',
            speedupTemplate: config.speedupTemplate || '',
            priority: config.priority || 0,
            isActive: config.isActive ?? true
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!formData.providerName) {
            setError('Provider name is required')
            return
        }

        try {
            setSaving(true)
            setError(null)

            if (editingConfig) {
                await api.put(`/provider-config/${editingConfig.id}`, formData)
            } else {
                await api.post('/provider-config', formData)
            }

            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            setShowModal(false)
            fetchConfigs()
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save configuration')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (config) => {
        if (!confirm(`Delete provider configuration "${config.providerName}"?`)) return

        try {
            await api.delete(`/provider-config/${config.id}`)
            fetchConfigs()
        } catch (err) {
            setError('Failed to delete configuration')
        }
    }

    const handleTest = async (config, platform) => {
        try {
            setTesting(`${config.id}-${platform}`)
            const res = await api.post(`/provider-config/${config.id}/test`, {
                platform,
                deviceId: null // Will use first available device
            })

            if (res.data.data?.success || res.data?.success) {
                alert('Test message sent successfully!')
            } else {
                alert(`Test failed: ${res.data.data?.error || res.data?.error || 'Unknown error'}`)
            }
        } catch (err) {
            alert(`Test failed: ${err.response?.data?.message || err.message}`)
        } finally {
            setTesting(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin" size={48} style={{ color: 'var(--primary-500)' }} />
            </div>
        )
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Provider Forwarding</h1>
                    <p className="page-subtitle">Configure automatic forwarding of requests to providers</p>
                </div>
                <button className="btn btn-primary" onClick={handleAdd}>
                    <Plus size={16} />
                    Add Provider
                </button>
            </div>

            {saved && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--success-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                    <span style={{ color: 'var(--success)' }}>Configuration saved successfully!</span>
                </div>
            )}

            {error && (
                <div style={{ padding: 'var(--spacing-md)', background: 'var(--error-light)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <AlertCircle size={20} style={{ color: 'var(--error)' }} />
                    <span style={{ color: 'var(--error)' }}>{error}</span>
                    <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                <button
                    className={`btn ${activeTab === 'mapping' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveTab('mapping')}
                >
                    <Send size={16} />
                    Quick Mapping
                </button>
                <button
                    className={`btn ${activeTab === 'configs' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveTab('configs')}
                >
                    <Settings2 size={16} />
                    Configurations ({configs.length})
                </button>
                <button
                    className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setActiveTab('logs'); fetchLogs(); }}
                >
                    <Bell size={16} />
                    Forwarding Logs
                </button>
            </div>

            {/* Quick Mapping Tab - NEW */}
            {activeTab === 'mapping' && (
                <div className="card" style={{ padding: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <Send size={20} style={{ marginRight: 'var(--spacing-sm)' }} />
                        Provider to Support Group Mapping
                    </h3>

                    <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
                        Map each provider to a support group. When order action happens,
                        the system will automatically forward the external order ID to the mapped group.
                    </p>

                    {/* Step 1: Select Panel */}
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <label className="form-label" style={{ fontSize: '1rem', fontWeight: 600 }}>
                            1️⃣ Select Panel
                        </label>
                        <select
                            className="form-select"
                            value={selectedPanel}
                            onChange={(e) => handlePanelSelect(e.target.value)}
                            style={{ maxWidth: '400px' }}
                        >
                            <option value="">-- Select a Panel --</option>
                            {panels.map(p => (
                                <option key={p.id} value={p.id}>{p.alias} - {p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Step 2: Provider List */}
                    {selectedPanel && (
                        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                            <label className="form-label" style={{ fontSize: '1rem', fontWeight: 600 }}>
                                2️⃣ Provider Aliases (from Admin API)
                            </label>

                            {loadingProviders ? (
                                <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
                                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
                                    <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--text-muted)' }}>Loading providers...</p>
                                </div>
                            ) : providers.length === 0 ? (
                                <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                    <AlertCircle size={32} style={{ color: 'var(--warning)', marginBottom: 'var(--spacing-sm)' }} />
                                    <p style={{ color: 'var(--text-secondary)' }}>No providers found. Make sure Admin API is configured.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
                                    {providers.map(provider => {
                                        const existingConfig = configs.find(c => c.providerName === provider.name)
                                        const mappedGroup = supportGroups.find(g => g.groupId === existingConfig?.whatsappGroupJid)

                                        return (
                                            <div key={provider.name} style={{
                                                padding: 'var(--spacing-md)',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr auto',
                                                gap: 'var(--spacing-md)',
                                                alignItems: 'center'
                                            }}>
                                                <div>
                                                    <strong>{provider.name}</strong>
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                                        {provider.orderCount || 0} orders
                                                    </p>
                                                </div>

                                                <select
                                                    className="form-select"
                                                    value={mappedGroup?.id || ''}
                                                    onChange={(e) => saveMapping(provider.name, e.target.value)}
                                                    disabled={saving}
                                                >
                                                    <option value="">-- Select Support Group --</option>
                                                    {supportGroups.map(g => (
                                                        <option key={g.id} value={g.id}>
                                                            {g.groupName || g.name} {g.panel?.alias ? `(${g.panel.alias})` : ''}
                                                        </option>
                                                    ))}
                                                </select>

                                                {existingConfig && (
                                                    <span className="badge badge-success" style={{ whiteSpace: 'nowrap' }}>
                                                        <CheckCircle size={12} /> Mapped
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Summary */}
                    {configs.length > 0 && (
                        <div style={{
                            marginTop: 'var(--spacing-xl)',
                            padding: 'var(--spacing-md)',
                            background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.1), rgba(var(--success-rgb), 0.1))',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <h4 style={{ marginBottom: 'var(--spacing-sm)' }}>
                                ✅ Active Mappings ({configs.filter(c => c.isActive).length})
                            </h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                Order actions (refill/cancel/speed up) will be automatically forwarded to the mapped support groups.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Configurations Tab */}
            {activeTab === 'configs' && (
                <>
                    {configs.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-2xl)' }}>
                            <Send size={48} style={{ color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }} />
                            <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>No Provider Configurations</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
                                Add a provider to start forwarding refill, cancel, and speedup requests.
                            </p>
                            <button className="btn btn-primary" onClick={handleAdd}>
                                <Plus size={16} />
                                Add Your First Provider
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
                            <div className="search-box">
                                <Search size={18} />
                                <input
                                    type="text"
                                    placeholder="Search configs by provider name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            {configs
                                .filter(c => !searchTerm || c.providerName.toLowerCase().includes(searchTerm.toLowerCase()) || (c.alias && c.alias.toLowerCase().includes(searchTerm.toLowerCase())))
                                .map(config => (
                                    <div key={config.id} className="card" style={{ padding: 'var(--spacing-lg)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xs)' }}>
                                                    <h3 style={{ margin: 0 }}>{config.providerName}</h3>
                                                    {config.alias && <span style={{ color: 'var(--primary-500)', fontWeight: 500 }}>({config.alias})</span>}
                                                    <span className={`badge ${config.isActive ? 'badge-success' : 'badge-warning'}`}>
                                                        {config.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                                {/* Show alias as primary, only show domain hint if no alias */}
                                                {!config.alias && config.providerDomain && (
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 var(--spacing-sm)', fontStyle: 'italic' }}>
                                                        Auto-match: {config.providerDomain.replace(/https?:\/\//, '')}
                                                    </p>
                                                )}

                                                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', marginTop: 'var(--spacing-sm)' }}>
                                                    {config.forwardRefill && <span className="badge badge-info">Refill</span>}
                                                    {config.forwardCancel && <span className="badge badge-error">Cancel</span>}
                                                    {config.forwardSpeedup && <span className="badge badge-warning">Speedup</span>}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(config)}>
                                                    <Edit3 size={14} />
                                                </button>
                                                <button className="btn btn-sm btn-secondary" onClick={() => handleDelete(config)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Destinations */}
                                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                            <h4 style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)' }}>Destinations</h4>
                                            <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                                                {config.whatsappGroupJid && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                                        <MessageSquare size={16} style={{ color: '#25D366' }} />
                                                        <span style={{ fontSize: '0.85rem' }}>WA Group: {config.whatsappGroupJid.substring(0, 15)}...</span>
                                                        <button
                                                            className="btn btn-xs"
                                                            onClick={() => handleTest(config, 'whatsapp_group')}
                                                            disabled={testing === `${config.id}-whatsapp_group`}
                                                            style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                                                        >
                                                            {testing === `${config.id}-whatsapp_group` ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                                                        </button>
                                                    </div>
                                                )}
                                                {config.whatsappNumber && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                                        <PhoneCall size={16} style={{ color: '#25D366' }} />
                                                        <span style={{ fontSize: '0.85rem' }}>WA: {config.whatsappNumber}</span>
                                                        <button
                                                            className="btn btn-xs"
                                                            onClick={() => handleTest(config, 'whatsapp_number')}
                                                            disabled={testing === `${config.id}-whatsapp_number`}
                                                            style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                                                        >
                                                            {testing === `${config.id}-whatsapp_number` ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                                                        </button>
                                                    </div>
                                                )}
                                                {config.telegramChatId && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                                        <Send size={16} style={{ color: '#0088cc' }} />
                                                        <span style={{ fontSize: '0.85rem' }}>Telegram: {config.telegramChatId}</span>
                                                        <button
                                                            className="btn btn-xs"
                                                            onClick={() => handleTest(config, 'telegram')}
                                                            disabled={testing === `${config.id}-telegram`}
                                                            style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                                                        >
                                                            {testing === `${config.id}-telegram` ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                                                        </button>
                                                    </div>
                                                )}
                                                {!config.whatsappGroupJid && !config.whatsappNumber && !config.telegramChatId && (
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No destinations configured</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Recent Forwarding Logs</h3>
                        <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
                            <RefreshCw size={14} />
                            Refresh
                        </button>
                    </div>

                    {logs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                            No forwarding logs yet
                        </div>
                    ) : (
                        <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                            {logs.map(log => (
                                <div key={log.id} style={{
                                    padding: 'var(--spacing-md)',
                                    borderBottom: '1px solid var(--border-color)',
                                    cursor: 'pointer'
                                }} onClick={() => setExpandedLogs(expandedLogs === log.id ? null : log.id)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                            <span className={`badge ${log.status === 'SENT' ? 'badge-success' : 'badge-error'}`}>
                                                {log.status}
                                            </span>
                                            <span className="badge">{log.requestType}</span>
                                            <span style={{ fontSize: '0.85rem' }}>{log.platform}</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {new Date(log.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    {expandedLogs === log.id && (
                                        <div style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                                            <p><strong>Order:</strong> {log.orderId}</p>
                                            <p><strong>Destination:</strong> {log.destination}</p>
                                            <p><strong>Response Time:</strong> {log.responseTime}ms</p>
                                            {log.errorMessage && <p style={{ color: 'var(--error)' }}><strong>Error:</strong> {log.errorMessage}</p>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3>{editingConfig ? 'Edit Provider' : 'Add Provider'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">Provider Name *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.providerName}
                                        onChange={e => setFormData({ ...formData, providerName: e.target.value })}
                                        placeholder="e.g., smmnepal"
                                        disabled={!!editingConfig}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Alias</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.alias}
                                        onChange={e => setFormData({ ...formData, alias: e.target.value })}
                                        placeholder="Display name"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Provider Domain (for auto-match)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.providerDomain}
                                    onChange={e => setFormData({ ...formData, providerDomain: e.target.value })}
                                    placeholder="e.g., smmnepal.com"
                                />
                                <p className="form-hint">Orders from this provider will automatically use this config</p>
                            </div>

                            <div style={{ marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
                                <h4 style={{ marginBottom: 'var(--spacing-sm)' }}>Forward Request Types</h4>
                                <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.forwardRefill} onChange={e => setFormData({ ...formData, forwardRefill: e.target.checked })} />
                                        Refill
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.forwardCancel} onChange={e => setFormData({ ...formData, forwardCancel: e.target.checked })} />
                                        Cancel
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.forwardSpeedup} onChange={e => setFormData({ ...formData, forwardSpeedup: e.target.checked })} />
                                        Speedup
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.forwardStatus} onChange={e => setFormData({ ...formData, forwardStatus: e.target.checked })} />
                                        Status
                                    </label>
                                </div>
                            </div>

                            <h4 style={{ marginBottom: 'var(--spacing-sm)' }}>WhatsApp Destinations</h4>
                            <div style={{
                                marginBottom: 'var(--spacing-md)',
                                padding: 'var(--spacing-md)',
                                background: 'rgba(37, 211, 102, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(37, 211, 102, 0.2)'
                            }}>
                                <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-secondary)' }}>
                                    <strong>💡 How to get WhatsApp Group JID:</strong><br />
                                    1. Add the bot number to your provider group<br />
                                    2. Send <code>.groupid</code> in the group<br />
                                    3. Copy the Group JID from the bot's response<br />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Format: <code>120363xxxxxxxxxx@g.us</code>
                                    </span>
                                </p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                                <div className="form-group">
                                    <label className="form-label">WhatsApp Group JID</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.whatsappGroupJid}
                                        onChange={e => setFormData({ ...formData, whatsappGroupJid: e.target.value })}
                                        placeholder="120363xxx@g.us"
                                    />
                                    <p className="form-hint">Paste the Group JID from .groupid command</p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">WhatsApp Number (Direct)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.whatsappNumber}
                                        onChange={e => setFormData({ ...formData, whatsappNumber: e.target.value })}
                                        placeholder="628xxx"
                                    />
                                    <p className="form-hint">For direct message to provider's number</p>
                                </div>
                            </div>

                            <h4 style={{ marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-sm)' }}>Telegram Destination</h4>
                            <div style={{
                                marginBottom: 'var(--spacing-md)',
                                padding: 'var(--spacing-md)',
                                background: 'rgba(0, 136, 204, 0.1)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(0, 136, 204, 0.2)'
                            }}>
                                <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-secondary)' }}>
                                    <strong>💡 How to get Telegram Chat ID:</strong><br />
                                    1. Add <code>@userinfobot</code> or <code>@getidsbot</code> to your group<br />
                                    2. The bot will reply with the Chat ID<br />
                                    3. For groups, ID starts with <code>-100</code> (e.g., <code>-1001234567890</code>)<br />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Private chats use your user ID (positive number)
                                    </span>
                                </p>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Telegram Chat ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.telegramChatId}
                                    onChange={e => setFormData({ ...formData, telegramChatId: e.target.value })}
                                    placeholder="-1001234567890"
                                />
                                <p className="form-hint">Paste the Chat ID from @getidsbot</p>
                            </div>

                            <h4 style={{ marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-sm)' }}>Error Notifications</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--spacing-md)', alignItems: 'end' }}>
                                <div className="form-group">
                                    <label className="form-label">Error Group JID</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.errorGroupJid}
                                        onChange={e => setFormData({ ...formData, errorGroupJid: e.target.value })}
                                        placeholder="Error notification group"
                                    />
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer', paddingBottom: '12px' }}>
                                    <input type="checkbox" checked={formData.errorNotifyEnabled} onChange={e => setFormData({ ...formData, errorNotifyEnabled: e.target.checked })} />
                                    Enable Error Notifications
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
                                <div className="form-group">
                                    <label className="form-label">Priority (lower = higher)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                        min="0"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select
                                        className="form-select"
                                        value={formData.isActive ? 'active' : 'inactive'}
                                        onChange={e => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {editingConfig ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .btn-sm {
                    padding: 6px 10px;
                    font-size: 0.75rem;
                }
                .btn-xs {
                    padding: 2px 6px;
                    font-size: 0.7rem;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                }
                .btn-xs:hover {
                    background: var(--bg-secondary);
                }
            `}</style>
        </div>
    )
}

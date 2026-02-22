import { useState, useEffect } from 'react'
import {
    Globe, RefreshCw, Loader2, AlertCircle, CheckCircle, X,
    ArrowRight, Save, Search, Eye, EyeOff, Trash2,
    Smartphone, Send, MessageSquare, TestTube, ChevronDown,
    ChevronRight, Settings2, Layers, Zap, Shield, Plus, UserPlus
} from 'lucide-react'
import api from '../services/api'

export default function ProviderAliases() {
    // Panel & provider state
    const [panels, setPanels] = useState([])
    const [selectedPanel, setSelectedPanel] = useState('')
    const [providers, setProviders] = useState([])
    const [loadingPanels, setLoadingPanels] = useState(true)
    const [loadingProviders, setLoadingProviders] = useState(false)
    const [syncing, setSyncing] = useState(false)

    // Config state
    const [configs, setConfigs] = useState([])
    const [devices, setDevices] = useState([])


    // UI state
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [expandedProvider, setExpandedProvider] = useState(null)
    const [savingProvider, setSavingProvider] = useState(null)
    const [testingProvider, setTestingProvider] = useState(null)
    const [showSetupModal, setShowSetupModal] = useState(false)
    const [togglingConfig, setTogglingConfig] = useState(null)
    const [deletingConfig, setDeletingConfig] = useState(null)

    // Manual add provider state
    const [showManualAdd, setShowManualAdd] = useState(false)
    const [manualProviderName, setManualProviderName] = useState('')
    const [manualProviderAlias, setManualProviderAlias] = useState('')
    const [addingManual, setAddingManual] = useState(false)

    // JID test result state: { field: 'whatsappGroupJid'|'whatsappNumber', status: 'testing'|'success'|'failed', message: '' }
    const [jidTestResult, setJidTestResult] = useState(null)

    // Form state for inline setup
    const [formData, setFormData] = useState({
        providerName: '',
        alias: '',
        forwardRefill: true,
        forwardCancel: true,
        forwardSpeedup: true,
        forwardStatus: false,
        whatsappGroupJid: '',
        whatsappNumber: '',
        telegramChatId: '',
        deviceId: '',
        errorGroupJid: '',
        errorNotifyEnabled: true,
        refillTemplate: '{externalId} {command}',
        cancelTemplate: '{externalId} cancel',
        speedupTemplate: '{externalId} speedup',
        priority: 0,
        isActive: true
    })

    useEffect(() => { fetchInitialData() }, [])
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t) } }, [success])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 8000); return () => clearTimeout(t) } }, [error])

    const fetchInitialData = async () => {
        try {
            setLoadingPanels(true)
            const [panelsRes, configsRes, devicesRes] = await Promise.all([
                api.get('/panels'),
                api.get('/provider-config'),
                api.get('/devices')
            ])

            setPanels(panelsRes.data || [])
            setConfigs(configsRes.data || [])
            const devList = devicesRes.data || devicesRes || []
            setDevices(Array.isArray(devList) ? devList : [])
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to load data')
        } finally {
            setLoadingPanels(false)
        }
    }

    const fetchProviders = async (panelId) => {
        if (!panelId) { setProviders([]); return }
        setLoadingProviders(true)
        try {
            const res = await api.post(`/panels/${panelId}/sync-providers`)
            const apiProviders = res.data?.providers || []
            // Merge with manually-added providers from configs
            const apiNames = new Set(apiProviders.map(p => (p.name || '').toLowerCase()))
            const manualProviders = configs
                .filter(c => !apiNames.has((c.providerName || '').toLowerCase()))
                .map(c => ({
                    name: c.providerName,
                    orderCount: 0,
                    isManual: true
                }))
            setProviders([...apiProviders, ...manualProviders])
            // Re-fetch panels to update lastProviderSyncAt timestamp
            try {
                const panelsRes = await api.get('/panels')
                setPanels(panelsRes.data || [])
            } catch (_) { /* non-critical */ }
        } catch (err) {
            // Even if API fetch fails, show manually-added providers
            const manualProviders = configs.map(c => ({
                name: c.providerName,
                orderCount: 0,
                isManual: true
            }))
            setProviders(manualProviders)
            if (manualProviders.length === 0) {
                setError(err.error?.message || err.message || 'Failed to fetch providers. Make sure Admin API is configured.')
            }
        } finally {
            setLoadingProviders(false)
        }
    }

    const handlePanelSelect = (panelId) => {
        setSelectedPanel(panelId)
        setSearchTerm('')
        setExpandedProvider(null)
        fetchProviders(panelId)
    }

    const handleReCatch = async () => {
        if (!selectedPanel) return
        setSyncing(true)
        setError(null)
        try {
            const res = await api.post(`/panels/${selectedPanel}/sync-providers`)
            const apiProviders = res.data?.providers || []
            // Merge API providers with manually-added providers (from configs)
            const apiNames = new Set(apiProviders.map(p => (p.name || '').toLowerCase()))
            const manualProviders = configs
                .filter(c => !apiNames.has((c.providerName || '').toLowerCase()))
                .map(c => ({
                    name: c.providerName,
                    orderCount: 0,
                    isManual: true
                }))
            setProviders([...apiProviders, ...manualProviders])
            setSuccess(`Re-caught ${apiProviders.length} providers from panel`)
            // Re-fetch panels to update lastProviderSyncAt timestamp
            try {
                const panelsRes = await api.get('/panels')
                setPanels(panelsRes.data || [])
            } catch (_) { /* non-critical */ }
        } catch (err) {
            setError(err.error?.message || err.message || 'Re-catch failed')
        } finally {
            setSyncing(false)
        }
    }

    // Handle manual provider add
    const handleManualAdd = async () => {
        if (!manualProviderName.trim()) {
            setError('Provider name is required')
            return
        }

        // Check if provider already exists
        const exists = providers.some(p => (p.name || '').toLowerCase() === manualProviderName.trim().toLowerCase())
        if (exists) {
            setError('This provider already exists in the list')
            return
        }

        setAddingManual(true)
        try {
            // Create provider config with just name and alias
            await api.post('/provider-config', {
                providerName: manualProviderName.trim(),
                alias: manualProviderAlias.trim() || manualProviderName.trim(),
                isActive: true
            })

            // Add to local providers list
            setProviders(prev => [...prev, {
                name: manualProviderName.trim(),
                orderCount: 0,
                isManual: true
            }])

            // Refresh configs
            const configsRes = await api.get('/provider-config')
            setConfigs(configsRes.data || [])

            setSuccess(`Provider "${manualProviderAlias.trim() || manualProviderName.trim()}" added successfully`)
            setShowManualAdd(false)
            setManualProviderName('')
            setManualProviderAlias('')
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to add provider')
        } finally {
            setAddingManual(false)
        }
    }

    const openSetup = (provider) => {
        const existingConfig = configs.find(c =>
            c.providerName === provider.name || c.providerName === provider.id?.toString()
        )
        // setEditingProvider removed — unused
        setFormData({
            providerName: provider.name || provider.id?.toString() || 'Unknown',
            alias: existingConfig?.alias || provider.name || '',
            forwardRefill: existingConfig?.forwardRefill ?? true,
            forwardCancel: existingConfig?.forwardCancel ?? true,
            forwardSpeedup: existingConfig?.forwardSpeedup ?? true,
            forwardStatus: existingConfig?.forwardStatus ?? false,
            whatsappGroupJid: existingConfig?.whatsappGroupJid || '',
            whatsappNumber: existingConfig?.whatsappNumber || '',
            telegramChatId: existingConfig?.telegramChatId || '',
            deviceId: existingConfig?.deviceId || '',
            errorGroupJid: existingConfig?.errorGroupJid || '',
            errorNotifyEnabled: existingConfig?.errorNotifyEnabled ?? true,
            refillTemplate: existingConfig?.refillTemplate || '{externalId} {command}',
            cancelTemplate: existingConfig?.cancelTemplate || '{externalId} cancel',
            speedupTemplate: existingConfig?.speedupTemplate || '{externalId} speedup',
            priority: existingConfig?.priority || 0,
            isActive: existingConfig?.isActive ?? true
        })
        setShowSetupModal(true)
    }

    const handleSaveSetup = async () => {
        if (!formData.providerName) {
            setError('Provider name is required')
            return
        }
        setSavingProvider(formData.providerName)
        try {
            const existingConfig = configs.find(c => c.providerName === formData.providerName)
            const payload = { ...formData }
            // Send null instead of deleting keys, so backend PUT actually clears values
            if (!payload.deviceId) payload.deviceId = null
            if (!payload.whatsappGroupJid) payload.whatsappGroupJid = null
            if (!payload.whatsappNumber) payload.whatsappNumber = null
            if (!payload.telegramChatId) payload.telegramChatId = null
            if (!payload.errorGroupJid) payload.errorGroupJid = null
            // Nullify optional string fields to keep DB consistent (null vs '')
            if (!payload.alias) payload.alias = null
            if (!payload.refillTemplate) payload.refillTemplate = null
            if (!payload.cancelTemplate) payload.cancelTemplate = null
            if (!payload.speedupTemplate) payload.speedupTemplate = null

            if (existingConfig) {
                await api.put(`/provider-config/${existingConfig.id}`, payload)
                setSuccess(`Updated forwarding config for "${formData.alias || formData.providerName}"`)
            } else {
                await api.post('/provider-config', payload)
                setSuccess(`Created forwarding config for "${formData.alias || formData.providerName}"`)
            }
            setShowSetupModal(false)
            // Re-fetch configs
            const res = await api.get('/provider-config')
            setConfigs(res.data || [])
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save')
        } finally {
            setSavingProvider(null)
        }
    }

    const handleTestForward = async (config, platform) => {
        setTestingProvider(`${config.id}-${platform}`)
        try {
            const res = await api.post(`/provider-config/${config.id}/test`, {
                platform,
                deviceId: config.deviceId || null
            })
            if (res.data?.success) {
                setSuccess('Test message sent successfully!')
            } else {
                setError(`Test failed: ${res.data?.error || 'Unknown error'}`)
            }
        } catch (err) {
            setError(`Test failed: ${err.error?.message || err.message}`)
        } finally {
            setTestingProvider(null)
        }
    }

    const handleDeleteConfig = async (config) => {
        if (!confirm(`Delete forwarding config for "${config.providerName}"?`)) return
        setDeletingConfig(config.id)
        try {
            await api.delete(`/provider-config/${config.id}`)
            setSuccess(`Deleted config for "${config.providerName}"`)
            const res = await api.get('/provider-config')
            setConfigs(res.data || [])
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to delete')
        } finally {
            setDeletingConfig(null)
        }
    }

    const handleToggleConfig = async (config) => {
        setTogglingConfig(config.id)
        try {
            await api.put(`/provider-config/${config.id}`, { isActive: !config.isActive })
            setSuccess(`${config.providerName} ${!config.isActive ? 'activated' : 'deactivated'}`)
            const res = await api.get('/provider-config')
            setConfigs(res.data || [])
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to toggle')
        } finally {
            setTogglingConfig(null)
        }
    }

    const handleTestBotInGroup = async (groupJid, preferDeviceId) => {
        if (!groupJid) { setError('No group JID specified'); return }
        setTestingProvider(`bot-${groupJid}`)
        try {
            // Use explicitly provided deviceId, then form deviceId, then first connected
            let targetDevice = null
            const tryDeviceId = preferDeviceId || formData.deviceId
            if (tryDeviceId) {
                targetDevice = devices.find(d => d.id === tryDeviceId)
            }
            if (!targetDevice) {
                targetDevice = devices.find(d => d.status === 'connected')
            }
            if (!targetDevice) {
                setError('No connected WhatsApp device. Connect a device first.')
                return
            }
            // Send a test message to verify bot presence
            await api.post('/messages/send', {
                deviceId: targetDevice.id,
                to: groupJid,
                message: '🧪 *System Bot Test*\n\nThis is a test to verify bot presence in this group.\nTime: ' + new Date().toLocaleString()
            })
            setSuccess('Test message sent to group! Check the group to verify bot received it.')
        } catch (err) {
            setError(`Bot test failed: ${err.error?.message || err.message || 'Bot may not be in the group'}`)
        } finally {
            setTestingProvider(null)
        }
    }

    // Test JID inline - sends test message and shows result below input
    const handleTestJid = async (jidValue, fieldName) => {
        if (!jidValue || !jidValue.trim()) {
            setJidTestResult({ field: fieldName, status: 'failed', message: 'Please enter a JID or number first' })
            return
        }
        setJidTestResult({ field: fieldName, status: 'testing', message: 'Sending test message...' })
        try {
            let targetDevice = null
            const tryDeviceId = formData.deviceId
            if (tryDeviceId) {
                targetDevice = devices.find(d => d.id === tryDeviceId)
            }
            if (!targetDevice) {
                targetDevice = devices.find(d => d.status === 'connected')
            }
            if (!targetDevice) {
                setJidTestResult({ field: fieldName, status: 'failed', message: 'No connected WhatsApp device. Connect a device first.' })
                return
            }

            // Format the JID
            let to = jidValue.trim()
            if (fieldName === 'whatsappGroupJid' && !to.includes('@')) {
                to = `${to}@g.us`
            } else if (fieldName === 'whatsappNumber' && !to.includes('@')) {
                to = `${to.replace(/\D/g, '')}@s.whatsapp.net`
            }

            await api.post('/messages/send', {
                deviceId: targetDevice.id,
                to: to,
                message: `🧪 *Test Message*\n\nThis is a test to verify forwarding destination.\nProvider: ${formData.providerName || 'N/A'}\nTime: ${new Date().toLocaleString()}`
            })
            setJidTestResult({ field: fieldName, status: 'success', message: '✅ Test message sent successfully! The destination is correctly linked.' })
        } catch (err) {
            const errMsg = err.error?.message || err.message || 'Failed to send'
            setJidTestResult({ field: fieldName, status: 'failed', message: `❌ Test failed: ${errMsg}. Your WhatsApp number may not be a member of this group.` })
        }
    }

    const selectedPanelObj = panels.find(p => p.id === selectedPanel)

    const getConfigForProvider = (providerName) => {
        return configs.find(c => c.providerName === providerName || c.providerName === providerName?.toString())
    }

    const filteredProviders = providers.filter(p => {
        if (!searchTerm) return true
        const name = (p.name || p.id?.toString() || '').toLowerCase()
        const term = searchTerm.toLowerCase()
        if (name.includes(term)) return true
        // Also search by configured alias
        const config = getConfigForProvider(name)
        if (config?.alias && config.alias.toLowerCase().includes(term)) return true
        return false
    })

    // Stats
    const totalConfigs = configs.length
    const activeConfigs = configs.filter(c => c.isActive).length
    const mappedProviders = providers.filter(p => getConfigForProvider(p.name || p.id?.toString())).length

    // Loading state
    if (loadingPanels) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <Loader2 size={32} className="animate-spin" />
                    <p>Loading provider aliases...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Provider Aliases</h1>
                    <p className="page-subtitle">Select a panel, view provider aliases, and configure forwarding inline</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary" onClick={fetchInitialData}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {success && (
                <div className="alert alert-success">
                    <CheckCircle size={16} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={14} /></button>
                </div>
            )}
            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={14} /></button>
                </div>
            )}

            {/* Panel Selection */}
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 300px' }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--spacing-xs)' }}>
                            <Globe size={15} />
                            Select Connected Panel
                        </label>
                        <select
                            className="form-input"
                            value={selectedPanel}
                            onChange={(e) => handlePanelSelect(e.target.value)}
                        >
                            <option value="">— Choose a Panel —</option>
                            {panels.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.alias || p.name} {p.supportsAdminApi ? '✓ Admin API' : ''} — {p.url?.replace(/https?:\/\//, '').split('/')[0]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedPanel && (
                        <button
                            className="btn btn-primary"
                            onClick={handleReCatch}
                            disabled={syncing}
                            style={{ alignSelf: 'flex-end' }}
                        >
                            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            Re-catch Providers
                        </button>
                    )}
                </div>

                {selectedPanelObj && (
                    <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <span><strong>Type:</strong> {selectedPanelObj.panelType}</span>
                        <span><strong>Admin API:</strong> {selectedPanelObj.supportsAdminApi ? '✅ Configured' : '❌ Not configured'}</span>
                        {selectedPanelObj.lastProviderSyncAt && (
                            <span><strong>Last sync:</strong> {new Date(selectedPanelObj.lastProviderSyncAt).toLocaleString()}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Stats Row (when panel selected) */}
            {selectedPanel && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <div className="stat-card">
                        <div className="stat-label"><Layers size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Providers</div>
                        <div className="stat-value">{providers.length}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label"><ArrowRight size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Mapped</div>
                        <div className="stat-value" style={{ color: 'var(--success)' }}>{mappedProviders}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label"><Settings2 size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Total Configs</div>
                        <div className="stat-value">{totalConfigs}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label"><Zap size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Active</div>
                        <div className="stat-value" style={{ color: '#a855f7' }}>{activeConfigs}</div>
                    </div>
                </div>
            )}

            {/* Provider List */}
            {selectedPanel && (
                <>
                    {/* Search + Add Manual */}
                    <div className="filter-bar" style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: '1 1 250px', minWidth: '200px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Search provider aliases..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="form-input"
                                style={{ paddingLeft: '36px', width: '100%' }}
                            />
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {filteredProviders.length} provider{filteredProviders.length !== 1 ? 's' : ''}
                        </span>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowManualAdd(true)}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            <Plus size={16} />
                            Add Provider
                        </button>
                    </div>

                    {/* Manual Add Provider Modal */}
                    {showManualAdd && (
                        <div className="card" style={{
                            padding: 'var(--spacing-lg)',
                            marginBottom: 'var(--spacing-lg)',
                            border: '2px solid var(--primary)',
                            background: 'var(--bg-secondary)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                                    <UserPlus size={18} />
                                    Add Provider Manually
                                </h3>
                                <button className="btn btn-ghost" onClick={() => { setShowManualAdd(false); setManualProviderName(''); setManualProviderAlias('') }} style={{ padding: '4px' }}>
                                    <X size={18} />
                                </button>
                            </div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)', marginTop: 0 }}>
                                Add a provider that cannot be auto-detected via Admin API. The provider name must match exactly how it appears in orders.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 'var(--spacing-sm)', alignItems: 'end' }}>
                                <div>
                                    <label className="form-label">Provider Name *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., smmnepal, main_provider"
                                        value={manualProviderName}
                                        onChange={e => setManualProviderName(e.target.value)}
                                        className="form-input"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Alias (display name)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Provider A"
                                        value={manualProviderAlias}
                                        onChange={e => setManualProviderAlias(e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleManualAdd}
                                    disabled={addingManual || !manualProviderName.trim()}
                                    style={{ height: '38px' }}
                                >
                                    {addingManual ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    Add
                                </button>
                            </div>
                        </div>
                    )}

                    {loadingProviders ? (
                        <div className="loading-container">
                            <Loader2 size={28} className="animate-spin" />
                            <p>Fetching providers from Admin API...</p>
                        </div>
                    ) : providers.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon"><Globe size={32} /></div>
                            <div className="empty-state-title">No providers found</div>
                            <div className="empty-state-description">
                                {selectedPanelObj?.supportsAdminApi
                                    ? 'Click "Re-catch Providers" to fetch from Admin API, or add providers manually.'
                                    : 'Admin API is not configured for this panel. You can still add providers manually.'}
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={() => setShowManualAdd(true)}
                                style={{ marginTop: 'var(--spacing-md)' }}
                            >
                                <Plus size={16} />
                                Add Provider Manually
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 'var(--spacing-sm)' }}>
                            {filteredProviders.map(provider => {
                                const pName = provider.name || provider.id?.toString() || 'Unknown'
                                const config = getConfigForProvider(pName)
                                const isExpanded = expandedProvider === pName
                                const hasSetup = !!config

                                return (
                                    <div key={pName} className="card" style={{
                                        padding: 0,
                                        overflow: 'hidden',
                                        borderLeft: hasSetup ? '3px solid var(--success)' : '3px solid var(--border-color)'
                                    }}>
                                        {/* Provider Row Header */}
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr auto auto auto',
                                                gap: 'var(--spacing-md)',
                                                alignItems: 'center',
                                                padding: 'var(--spacing-md) var(--spacing-lg)',
                                                cursor: 'pointer',
                                                backgroundColor: isExpanded ? 'var(--bg-secondary)' : 'transparent',
                                                transition: 'background-color 0.15s'
                                            }}
                                            onClick={() => setExpandedProvider(isExpanded ? null : pName)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                                        {config?.alias || pName}
                                                    </div>
                                                    {config?.alias && config.alias !== pName && (
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Provider: {pName}</div>
                                                    )}
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                                                        {provider.isManual
                                                            ? <span style={{ color: 'var(--primary)' }}>✦ Manually added</span>
                                                            : <>{selectedPanelObj?.url?.replace(/https?:\/\//, '').split('/')[0] || 'Unknown panel'}
                                                                {provider.orderCount !== undefined && ` · ${provider.orderCount} orders`}</>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status badges */}
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {config ? (
                                                    <>
                                                        <span className={`badge ${config.isActive ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.7rem' }}>
                                                            {config.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                        {config.forwardRefill && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Refill</span>}
                                                        {config.forwardCancel && <span className="badge badge-error" style={{ fontSize: '0.65rem' }}>Cancel</span>}
                                                        {config.forwardSpeedup && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Speed</span>}
                                                        {config.forwardStatus && <span className="badge" style={{ fontSize: '0.65rem', background: '#8b5cf6', color: '#fff' }}>Status</span>}
                                                    </>
                                                ) : (
                                                    <span className="badge" style={{ fontSize: '0.7rem', opacity: 0.6 }}>Not configured</span>
                                                )}
                                            </div>

                                            {/* Destination summary */}
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                {config?.whatsappGroupJid && (
                                                    <span title={`WA Group: ${config.whatsappGroupJid}`} style={{ color: '#25D366' }}><MessageSquare size={15} /></span>
                                                )}
                                                {config?.whatsappNumber && (
                                                    <span title={`WA Number: ${config.whatsappNumber}`} style={{ color: '#25D366' }}><Smartphone size={15} /></span>
                                                )}
                                                {config?.telegramChatId && (
                                                    <span title={`Telegram: ${config.telegramChatId}`} style={{ color: '#0088cc' }}><Send size={15} /></span>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => openSetup(provider)}
                                                    title="Setup forwarding"
                                                >
                                                    <Settings2 size={14} />
                                                </button>
                                                {config && (
                                                    <>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleToggleConfig(config)}
                                                            disabled={togglingConfig === config.id}
                                                            title={config.isActive ? 'Deactivate' : 'Activate'}
                                                        >
                                                            {togglingConfig === config.id
                                                                ? <Loader2 size={14} className="animate-spin" />
                                                                : config.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleDeleteConfig(config)}
                                                            disabled={deletingConfig === config.id}
                                                            title="Delete config"
                                                            style={{ color: 'var(--error)' }}
                                                        >
                                                            {deletingConfig === config.id
                                                                ? <Loader2 size={14} className="animate-spin" />
                                                                : <Trash2 size={14} />}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded Detail */}
                                        {isExpanded && config && (
                                            <div style={{
                                                padding: 'var(--spacing-md) var(--spacing-lg)',
                                                borderTop: '1px solid var(--border-color)',
                                                background: 'var(--bg-tertiary)',
                                                fontSize: '0.85rem'
                                            }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--spacing-lg)' }}>
                                                    {/* Forwarding destinations */}
                                                    <div>
                                                        <h4 style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <ArrowRight size={14} /> Destinations
                                                        </h4>
                                                        {config.whatsappGroupJid && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                                <MessageSquare size={13} style={{ color: '#25D366' }} />
                                                                <code style={{ fontSize: '0.8rem' }}>{config.whatsappGroupJid}</code>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{ padding: '2px' }}
                                                                    onClick={() => handleTestForward(config, 'whatsapp_group')}
                                                                    disabled={testingProvider === `${config.id}-whatsapp_group`}
                                                                    title="Test send"
                                                                >
                                                                    {testingProvider === `${config.id}-whatsapp_group`
                                                                        ? <Loader2 size={12} className="animate-spin" />
                                                                        : <TestTube size={12} />}
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{ padding: '2px' }}
                                                                    onClick={() => handleTestBotInGroup(config.whatsappGroupJid, config.deviceId)}
                                                                    disabled={testingProvider === `bot-${config.whatsappGroupJid}`}
                                                                    title="Test bot in group"
                                                                >
                                                                    {testingProvider === `bot-${config.whatsappGroupJid}`
                                                                        ? <Loader2 size={12} className="animate-spin" />
                                                                        : <Shield size={12} />}
                                                                </button>
                                                            </div>
                                                        )}
                                                        {config.whatsappNumber && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                                <Smartphone size={13} style={{ color: '#25D366' }} />
                                                                <span>{config.whatsappNumber}</span>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{ padding: '2px' }}
                                                                    onClick={() => handleTestForward(config, 'whatsapp_number')}
                                                                    disabled={testingProvider === `${config.id}-whatsapp_number`}
                                                                >
                                                                    {testingProvider === `${config.id}-whatsapp_number`
                                                                        ? <Loader2 size={12} className="animate-spin" />
                                                                        : <TestTube size={12} />}
                                                                </button>
                                                            </div>
                                                        )}
                                                        {config.telegramChatId && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                                <Send size={13} style={{ color: '#0088cc' }} />
                                                                <span>{config.telegramChatId}</span>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{ padding: '2px' }}
                                                                    onClick={() => handleTestForward(config, 'telegram')}
                                                                    disabled={testingProvider === `${config.id}-telegram`}
                                                                >
                                                                    {testingProvider === `${config.id}-telegram`
                                                                        ? <Loader2 size={12} className="animate-spin" />
                                                                        : <TestTube size={12} />}
                                                                </button>
                                                            </div>
                                                        )}
                                                        {!config.whatsappGroupJid && !config.whatsappNumber && !config.telegramChatId && (
                                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No destinations set</span>
                                                        )}
                                                    </div>

                                                    {/* Forward command templates */}
                                                    <div>
                                                        <h4 style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Send size={14} /> Command Templates
                                                        </h4>
                                                        {config.refillTemplate && (
                                                            <div style={{ marginBottom: '4px' }}>
                                                                <span style={{ color: 'var(--text-muted)' }}>Refill: </span>
                                                                <code style={{ fontSize: '0.8rem' }}>{config.refillTemplate}</code>
                                                            </div>
                                                        )}
                                                        {config.cancelTemplate && (
                                                            <div style={{ marginBottom: '4px' }}>
                                                                <span style={{ color: 'var(--text-muted)' }}>Cancel: </span>
                                                                <code style={{ fontSize: '0.8rem' }}>{config.cancelTemplate}</code>
                                                            </div>
                                                        )}
                                                        {config.speedupTemplate && (
                                                            <div style={{ marginBottom: '4px' }}>
                                                                <span style={{ color: 'var(--text-muted)' }}>Speedup: </span>
                                                                <code style={{ fontSize: '0.8rem' }}>{config.speedupTemplate}</code>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Error config */}
                                                    <div>
                                                        <h4 style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <AlertCircle size={14} /> Error Handling
                                                        </h4>
                                                        <div style={{ marginBottom: '4px' }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>Notify: </span>
                                                            <span className={`badge ${config.errorNotifyEnabled ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.7rem' }}>
                                                                {config.errorNotifyEnabled ? 'Enabled' : 'Disabled'}
                                                            </span>
                                                        </div>
                                                        {config.errorGroupJid && (
                                                            <div>
                                                                <span style={{ color: 'var(--text-muted)' }}>Error Group: </span>
                                                                <code style={{ fontSize: '0.8rem' }}>{config.errorGroupJid}</code>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Device info */}
                                                    <div>
                                                        <h4 style={{ fontSize: '0.85rem', marginBottom: 'var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Smartphone size={14} /> Device
                                                        </h4>
                                                        {config.deviceId ? (() => {
                                                            const dev = devices.find(d => d.id === config.deviceId)
                                                            return dev ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span>{dev.name} {dev.phone ? `(${dev.phone})` : ''}</span>
                                                                    <span className={`badge ${dev.status === 'connected' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.65rem' }}>{dev.status}</span>
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Device not found (ID: {config.deviceId})</span>
                                                            )
                                                        })() : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Auto (first connected)</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {isExpanded && !config && (
                                            <div style={{
                                                padding: 'var(--spacing-lg)',
                                                borderTop: '1px solid var(--border-color)',
                                                background: 'var(--bg-tertiary)',
                                                textAlign: 'center'
                                            }}>
                                                <p style={{ color: 'var(--text-muted)', margin: '0 0 var(--spacing-sm)' }}>
                                                    No forwarding configured yet for this provider.
                                                </p>
                                                <button className="btn btn-primary btn-sm" onClick={() => openSetup(provider)}>
                                                    <Settings2 size={14} /> Setup Forwarding
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            )}

            {/* No panel selected */}
            {!selectedPanel && (
                <div className="empty-state">
                    <div className="empty-state-icon"><Globe size={32} /></div>
                    <div className="empty-state-title">Select a Panel</div>
                    <div className="empty-state-description">
                        Choose a connected SMM panel above to view and configure provider aliases for forwarding.
                    </div>
                </div>
            )}

            {/* Setup/Edit Modal */}
            {showSetupModal && (
                <div className="modal-overlay open" onClick={() => setShowSetupModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h2>
                                {configs.find(c => c.providerName === formData.providerName)
                                    ? `Edit: ${formData.providerName}`
                                    : `Setup: ${formData.providerName}`}
                            </h2>
                            <button className="modal-close" onClick={() => setShowSetupModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                {/* Alias & Priority */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-md)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Alias Name</label>
                                        <input
                                            className="form-input"
                                            placeholder="Display name for this provider"
                                            value={formData.alias}
                                            onChange={e => setFormData(p => ({ ...p, alias: e.target.value }))}
                                        />
                                        <div className="form-hint">Shown in UI instead of raw provider name</div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Priority</label>
                                        <input
                                            className="form-input"
                                            type="number"
                                            min={0}
                                            value={formData.priority}
                                            onChange={e => setFormData(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                                        />
                                        <div className="form-hint">Lower = higher priority</div>
                                    </div>
                                </div>

                                {/* Request Types */}
                                <div>
                                    <label className="form-label">Forward Request Types</label>
                                    <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', padding: 'var(--spacing-sm) 0' }}>
                                        {[
                                            { key: 'forwardRefill', label: 'Refill', color: '#3b82f6' },
                                            { key: 'forwardCancel', label: 'Cancel', color: '#ef4444' },
                                            { key: 'forwardSpeedup', label: 'Speedup', color: '#f59e0b' },
                                            { key: 'forwardStatus', label: 'Status', color: '#8b5cf6' },
                                        ].map(rt => (
                                            <label key={rt.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={formData[rt.key]}
                                                    onChange={e => setFormData(p => ({ ...p, [rt.key]: e.target.checked }))}
                                                />
                                                <span style={{ color: rt.color, fontWeight: 500 }}>{rt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* WhatsApp Destinations */}
                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid rgba(37, 211, 102, 0.2)',
                                    background: 'rgba(37, 211, 102, 0.05)'
                                }}>
                                    <h4 style={{ margin: '0 0 var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <MessageSquare size={16} style={{ color: '#25D366' }} />
                                        WhatsApp Forwarding
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                                        <div className="form-group">
                                            <label className="form-label">Group JID</label>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                                <input
                                                    className="form-input"
                                                    style={{ flex: 1 }}
                                                    placeholder="120363xxx@g.us"
                                                    value={formData.whatsappGroupJid}
                                                    onChange={e => { setFormData(p => ({ ...p, whatsappGroupJid: e.target.value })); setJidTestResult(null) }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ whiteSpace: 'nowrap', height: '38px', minWidth: '90px' }}
                                                    onClick={() => handleTestJid(formData.whatsappGroupJid, 'whatsappGroupJid')}
                                                    disabled={!formData.whatsappGroupJid || (jidTestResult?.field === 'whatsappGroupJid' && jidTestResult?.status === 'testing')}
                                                >
                                                    {jidTestResult?.field === 'whatsappGroupJid' && jidTestResult?.status === 'testing'
                                                        ? <Loader2 size={14} className="animate-spin" />
                                                        : <TestTube size={14} />}
                                                    Test
                                                </button>
                                            </div>
                                            {jidTestResult?.field === 'whatsappGroupJid' && jidTestResult.status !== 'testing' && (
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    marginTop: '4px',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    background: jidTestResult.status === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    color: jidTestResult.status === 'success' ? 'var(--success)' : 'var(--error)',
                                                    border: `1px solid ${jidTestResult.status === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                }}>
                                                    {jidTestResult.message}
                                                </div>
                                            )}
                                            <div className="form-hint">Send <code>.groupid</code> in group to get this</div>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">WA Number (Direct)</label>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                                <input
                                                    className="form-input"
                                                    style={{ flex: 1 }}
                                                    placeholder="628xxx"
                                                    value={formData.whatsappNumber}
                                                    onChange={e => { setFormData(p => ({ ...p, whatsappNumber: e.target.value })); setJidTestResult(null) }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ whiteSpace: 'nowrap', height: '38px', minWidth: '90px' }}
                                                    onClick={() => handleTestJid(formData.whatsappNumber, 'whatsappNumber')}
                                                    disabled={!formData.whatsappNumber || (jidTestResult?.field === 'whatsappNumber' && jidTestResult?.status === 'testing')}
                                                >
                                                    {jidTestResult?.field === 'whatsappNumber' && jidTestResult?.status === 'testing'
                                                        ? <Loader2 size={14} className="animate-spin" />
                                                        : <TestTube size={14} />}
                                                    Test
                                                </button>
                                            </div>
                                            {jidTestResult?.field === 'whatsappNumber' && jidTestResult.status !== 'testing' && (
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    marginTop: '4px',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    background: jidTestResult.status === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    color: jidTestResult.status === 'success' ? 'var(--success)' : 'var(--error)',
                                                    border: `1px solid ${jidTestResult.status === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                }}>
                                                    {jidTestResult.message}
                                                </div>
                                            )}
                                            <div className="form-hint">Multiple numbers: separate with comma</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Telegram */}
                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid rgba(0, 136, 204, 0.2)',
                                    background: 'rgba(0, 136, 204, 0.05)'
                                }}>
                                    <h4 style={{ margin: '0 0 var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Send size={16} style={{ color: '#0088cc' }} />
                                        Telegram Forwarding
                                    </h4>
                                    <div className="form-group">
                                        <label className="form-label">Telegram Chat ID</label>
                                        <input
                                            className="form-input"
                                            placeholder="-1001234567890"
                                            value={formData.telegramChatId}
                                            onChange={e => setFormData(p => ({ ...p, telegramChatId: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                {/* Device Selection (Section 8.2) */}
                                <div className="form-group">
                                    <label className="form-label">
                                        <Smartphone size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                        WhatsApp Device for Forwarding
                                    </label>
                                    <select
                                        className="form-input"
                                        value={formData.deviceId}
                                        onChange={e => setFormData(p => ({ ...p, deviceId: e.target.value }))}
                                    >
                                        <option value="">Auto (use first connected)</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name} {d.phone ? `(${d.phone})` : ''} — {d.status}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="form-hint">Select which device will send the forwarded messages. Selection-based, no manual typing.</div>
                                </div>

                                {/* Forward Command Templates (Section 8.1 + Bug 3.4) */}
                                <div>
                                    <label className="form-label">Forward Command Format</label>
                                    <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <div className="form-hint" style={{ marginBottom: '6px' }}>Click a variable to insert into the focused template field:</div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {[
                                                { var: '{externalId}', label: 'External ID', desc: 'Order external ID' },
                                                { var: '{orderId}', label: 'Order ID', desc: 'Internal order ID' },
                                                { var: '{command}', label: 'Command', desc: 'e.g. refill / cancel' },
                                                { var: '{providerAlias}', label: 'Provider Alias', desc: 'Configured alias name' },
                                                { var: '{service}', label: 'Service', desc: 'Service ID/name' },
                                                { var: '{link}', label: 'Link', desc: 'Target URL' },
                                                { var: '{quantity}', label: 'Quantity', desc: 'Order quantity' },
                                            ].map(v => (
                                                <button
                                                    key={v.var}
                                                    type="button"
                                                    title={v.desc}
                                                    style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--bg-secondary)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.72rem',
                                                        fontFamily: 'monospace',
                                                        color: 'var(--primary)',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onClick={() => {
                                                        // Insert into the last focused template field
                                                        const activeEl = document.activeElement;
                                                        if (activeEl && activeEl.dataset.templateField) {
                                                            const field = activeEl.dataset.templateField;
                                                            const start = activeEl.selectionStart || activeEl.value.length;
                                                            const val = activeEl.value;
                                                            const newVal = val.slice(0, start) + v.var + val.slice(start);
                                                            setFormData(p => ({ ...p, [field]: newVal }));
                                                            // Restore cursor after render
                                                            setTimeout(() => {
                                                                activeEl.focus();
                                                                activeEl.setSelectionRange(start + v.var.length, start + v.var.length);
                                                            }, 0);
                                                        } else {
                                                            // Fallback: append to refill template
                                                            setFormData(p => ({ ...p, refillTemplate: (p.refillTemplate || '') + ' ' + v.var }));
                                                        }
                                                    }}
                                                >
                                                    {v.var}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Refill Template</label>
                                            <input
                                                className="form-input"
                                                placeholder="{externalId} {command}"
                                                value={formData.refillTemplate}
                                                data-template-field="refillTemplate"
                                                onChange={e => setFormData(p => ({ ...p, refillTemplate: e.target.value }))}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Cancel Template</label>
                                            <input
                                                className="form-input"
                                                placeholder="{externalId} cancel"
                                                value={formData.cancelTemplate}
                                                data-template-field="cancelTemplate"
                                                onChange={e => setFormData(p => ({ ...p, cancelTemplate: e.target.value }))}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontSize: '0.8rem' }}>Speedup Template</label>
                                            <input
                                                className="form-input"
                                                placeholder="{externalId} speedup"
                                                value={formData.speedupTemplate}
                                                data-template-field="speedupTemplate"
                                                onChange={e => setFormData(p => ({ ...p, speedupTemplate: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Error Notifications */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--spacing-md)', alignItems: 'end' }}>
                                    <div className="form-group">
                                        <label className="form-label">Error Notification Group JID</label>
                                        <input
                                            className="form-input"
                                            placeholder="120363xxx@g.us"
                                            value={formData.errorGroupJid}
                                            onChange={e => setFormData(p => ({ ...p, errorGroupJid: e.target.value }))}
                                        />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', paddingBottom: '12px' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.errorNotifyEnabled}
                                            onChange={e => setFormData(p => ({ ...p, errorNotifyEnabled: e.target.checked }))}
                                        />
                                        Enable Error Notifications
                                    </label>
                                </div>

                                {/* System Bot Group Validation (Section 8.3) */}
                                {formData.whatsappGroupJid && (
                                    <div style={{
                                        padding: 'var(--spacing-md)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(147, 51, 234, 0.2)',
                                        background: 'rgba(147, 51, 234, 0.05)'
                                    }}>
                                        <h4 style={{ margin: '0 0 var(--spacing-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Shield size={16} style={{ color: '#a855f7' }} />
                                            System Bot Group Validation
                                        </h4>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
                                            Ensure the System Bot number is added to this support group. Click "Test" to verify bot membership.
                                        </p>
                                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleTestBotInGroup(formData.whatsappGroupJid)}
                                                disabled={testingProvider === `bot-${formData.whatsappGroupJid}`}
                                            >
                                                {testingProvider === `bot-${formData.whatsappGroupJid}`
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <TestTube size={14} />}
                                                Test Bot in Group
                                            </button>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Sends a test message to verify the bot can post in the group
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowSetupModal(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveSetup}
                                disabled={savingProvider === formData.providerName}
                            >
                                {savingProvider === formData.providerName ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {configs.find(c => c.providerName === formData.providerName) ? 'Update Config' : 'Create Config'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

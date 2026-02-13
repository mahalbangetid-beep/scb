import { useState, useEffect } from 'react'
import {
    Globe, Plus, RefreshCw, Trash2, Edit3, Check, X,
    DollarSign, Link2, AlertCircle, Loader2, Search,
    Shield, Eye, EyeOff, CheckCircle2, ExternalLink, Settings,
    Sparkles, Zap, ArrowRight, ArrowLeft, HelpCircle, Wifi, WifiOff,
    Key, Database, Users
} from 'lucide-react'
import api from '../services/api'

export default function SmmPanels() {
    const [panels, setPanels] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [modalMode, setModalMode] = useState('smart') // 'smart' | 'manual' | 'edit'
    const [editPanel, setEditPanel] = useState(null)
    const [error, setError] = useState(null)
    const [syncingPanel, setSyncingPanel] = useState(null)

    // Smart Detection States
    const [wizardStep, setWizardStep] = useState(1) // 1: Input, 2: Scanning, 3: Success/Config
    const [smartForm, setSmartForm] = useState({
        panelType: 'PERFECT_PANEL', // PERFECT_PANEL (V2) or RENTAL (V1)
        url: '',
        adminApiKey: '',
        name: '',
        alias: '',
        isPrimary: false
    })
    const [showApiKey, setShowApiKey] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [scanProgress, setScanProgress] = useState(0)
    const [scanStatus, setScanStatus] = useState('')
    const [scanResult, setScanResult] = useState(null)
    const [formLoading, setFormLoading] = useState(false)

    // Manual Form States (for edit)
    const [manualForm, setManualForm] = useState({
        name: '',
        alias: '',
        url: '',
        isPrimary: false,
        adminApiKey: '',
        adminApiBaseUrl: ''
    })

    // Admin API Testing State
    const [testingAdminApi, setTestingAdminApi] = useState(false)
    const [adminApiStatus, setAdminApiStatus] = useState(null) // null, 'success', 'error'
    const [adminApiMessage, setAdminApiMessage] = useState('')

    // Sync All Services Modal State
    const [showSyncModal, setShowSyncModal] = useState(false)
    const [syncAllPanel, setSyncAllPanel] = useState(null)
    const [syncSteps, setSyncSteps] = useState({
        scanning: { status: 'pending', message: '' },
        summary: null
    })
    const [syncComplete, setSyncComplete] = useState(false)

    useEffect(() => {
        fetchPanels()
    }, [])

    const fetchPanels = async () => {
        try {
            setLoading(true)
            const res = await api.get('/panels')
            setPanels(res.data || [])
        } catch (err) {
            setError(err.message || 'Failed to fetch panels')
        } finally {
            setLoading(false)
        }
    }

    const handleSmartDetect = async () => {
        if (!smartForm.url || !smartForm.adminApiKey) {
            setError('URL and Admin API Key are required')
            return
        }

        setWizardStep(2)
        setScanning(true)
        setScanProgress(0)
        setScanStatus('Starting scan...')
        setScanResult(null)

        // Simulate progress while waiting for API
        const progressInterval = setInterval(() => {
            setScanProgress(prev => {
                if (prev >= 90) return prev
                return prev + Math.random() * 15
            })
        }, 500)

        try {
            const res = await api.post('/panels/detect', {
                url: smartForm.url,
                adminApiKey: smartForm.adminApiKey,
                panelType: smartForm.panelType
            })

            clearInterval(progressInterval)
            setScanProgress(100)

            if (res.data.success) {
                setScanStatus('Panel detected successfully!')
                setScanResult({
                    success: true,
                    ...res.data
                })
                // Auto-generate name and alias from URL
                const urlObj = new URL(smartForm.url)
                const hostname = urlObj.hostname.replace('www.', '')
                setSmartForm(prev => ({
                    ...prev,
                    name: prev.name || hostname,
                    alias: prev.alias || hostname.split('.')[0].toUpperCase()
                }))
                setWizardStep(3)
            } else {
                setScanStatus('Detection failed')
                setScanResult({
                    success: false,
                    ...res.data
                })
                setWizardStep(3)
            }
        } catch (err) {
            clearInterval(progressInterval)
            setScanProgress(100)
            setScanStatus('Scanning error')
            setScanResult({
                success: false,
                errorType: 'API_ERROR',
                error: err.message || 'An error occurred while detecting panel'
            })
            setWizardStep(3)
        } finally {
            setScanning(false)
        }
    }

    // Add Panel with detected config
    const handleAddDetectedPanel = async () => {
        if (!smartForm.name || !smartForm.alias) {
            setError('Panel name and alias are required')
            return
        }

        setFormLoading(true)
        setError(null)

        try {
            const res = await api.post('/panels/detect-and-add', {
                url: smartForm.url,
                adminApiKey: smartForm.adminApiKey,
                name: smartForm.name,
                alias: smartForm.alias,
                isPrimary: smartForm.isPrimary
            })

            if (res.data.success) {
                setShowModal(false)
                resetSmartForm()
                fetchPanels()
            } else {
                setError(res.data.error || 'Failed to add panel')
            }
        } catch (err) {
            setError(err.message || 'Failed to add panel')
        } finally {
            setFormLoading(false)
        }
    }

    // Manual submit (for edit or fallback)
    const handleManualSubmit = async (e) => {
        e.preventDefault()
        setFormLoading(true)
        setError(null)

        try {
            if (editPanel) {
                await api.put(`/panels/${editPanel.id}`, manualForm)
            } else {
                await api.post('/panels', manualForm)
            }
            setShowModal(false)
            setEditPanel(null)
            resetManualForm()
            fetchPanels()
        } catch (err) {
            setError(err.message || 'Failed to save panel')
        } finally {
            setFormLoading(false)
        }
    }


    const handleEdit = (panel) => {
        setEditPanel(panel)
        setManualForm({
            name: panel.name,
            alias: panel.alias,
            url: panel.url,
            isPrimary: panel.isPrimary,
            adminApiKey: '', // Don't show existing key for security
            adminApiBaseUrl: panel.adminApiBaseUrl || ''
        })
        setModalMode('edit')
        // Reset admin API status
        setAdminApiStatus(panel.supportsAdminApi ? 'success' : null)
        setAdminApiMessage(panel.supportsAdminApi ? 'Admin API configured' : '')
        setShowModal(true)
    }


    const handleDelete = async (panelId) => {
        if (!confirm('Are you sure you want to delete this panel? All orders will be deleted too.')) {
            return
        }

        try {
            await api.delete(`/panels/${panelId}`)
            fetchPanels()
        } catch (err) {
            setError(err.message || 'Failed to delete panel')
        }
    }

    // Open Sync All Modal and start scanning
    const handleSyncAll = async (panel) => {
        setSyncAllPanel(panel)
        setShowSyncModal(true)
        setSyncComplete(false)
        setSyncSteps({
            scanning: { status: 'scanning', message: 'Scanning all endpoints...' },
            summary: null
        })

        try {
            // Call sync-all API
            const res = await api.post(`/panels/${panel.id}/sync-all`)
            const data = res.data?.data || res.data

            // Short delay to show scanning animation
            setTimeout(() => {
                // Extract summary from response
                const summary = data.summary || {
                    success: Object.values(data.results || {}).filter(r => r?.status === 'success').length,
                    failed: Object.values(data.results || {}).filter(r => r?.status === 'error').length,
                    skipped: Object.values(data.results || {}).filter(r => r?.status === 'skipped').length,
                    totalEndpointsDetected: Object.keys(data.detectedEndpoints || {}).length
                }

                setSyncSteps({
                    scanning: { status: 'success', message: 'Scan complete!' },
                    summary: {
                        connected: summary.success || 0,
                        failed: summary.failed || 0,
                        skipped: summary.skipped || 0,
                        total: summary.totalEndpointsDetected || 0,
                        capabilities: data.capabilities || []
                    }
                })
                setSyncComplete(true)
                fetchPanels()
            }, 800)

        } catch (err) {
            setSyncSteps({
                scanning: { status: 'error', message: err.message || 'Scan failed' },
                summary: null
            })
            setSyncComplete(true)
        }
    }

    const handleRefreshBalance = async (panelId) => {
        setSyncingPanel(panelId)
        try {
            await api.get(`/panels/${panelId}/balance`)
            fetchPanels()
        } catch (err) {
            const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to refresh balance'
            setError(errorMsg)
        } finally {
            setSyncingPanel(null)
        }
    }


    const resetSmartForm = () => {
        setSmartForm({
            panelType: 'PERFECT_PANEL',
            url: '',
            adminApiKey: '',
            name: '',
            alias: '',
            isPrimary: false
        })
        setWizardStep(1)
        setScanResult(null)
        setScanProgress(0)
        setShowApiKey(false)
    }

    const resetManualForm = () => {
        setManualForm({
            name: '',
            alias: '',
            url: '',
            isPrimary: false,
            adminApiKey: '',
            adminApiBaseUrl: ''
        })
        // Reset admin API status
        setAdminApiStatus(null)
        setAdminApiMessage('')
    }

    // Test Admin API Connection
    const handleTestAdminApi = async () => {
        if (!editPanel?.id) {
            setAdminApiStatus('error')
            setAdminApiMessage('Save the panel first before testing Admin API')
            return
        }

        if (!manualForm.adminApiKey) {
            setAdminApiStatus('error')
            setAdminApiMessage('Please enter Admin API Key')
            return
        }

        setTestingAdminApi(true)
        setAdminApiStatus(null)
        setAdminApiMessage('Testing connection...')

        try {
            const res = await api.post(`/panels/${editPanel.id}/test-admin`, {
                adminApiKey: manualForm.adminApiKey,
                adminApiBaseUrl: manualForm.adminApiBaseUrl || undefined
            })

            if (res.data.success) {
                setAdminApiStatus('success')
                setAdminApiMessage(`Connected! Capabilities: ${res.data.capabilities?.join(', ') || 'Standard'}`)
            } else {
                setAdminApiStatus('error')
                setAdminApiMessage(res.data.error || 'Connection failed')
            }
        } catch (err) {
            setAdminApiStatus('error')
            setAdminApiMessage(err.message || 'Failed to test connection')
        } finally {
            setTestingAdminApi(false)
        }
    }

    const openSmartModal = () => {
        resetSmartForm()
        setModalMode('smart')
        setEditPanel(null)
        setError(null)
        setShowModal(true)
    }

    const switchToManual = () => {
        // Transfer data from smart form to manual form
        setManualForm(prev => ({
            ...prev,
            url: smartForm.url,
            adminApiKey: smartForm.adminApiKey,
            name: smartForm.name,
            alias: smartForm.alias,
            isPrimary: smartForm.isPrimary
        }))
        setModalMode('manual')
        setWizardStep(1)
    }

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0'
        return new Intl.NumberFormat('en-US').format(num)
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">SMM Panels</h1>
                    <p className="page-subtitle">Connect and manage your SMM panel integrations</p>
                </div>
                <button className="btn btn-primary btn-glow" onClick={openSmartModal}>
                    <Sparkles size={18} />
                    Add Panel
                </button>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading panels...</p>
                </div>
            ) : panels.length === 0 ? (
                <div className="empty-state-card">
                    <div className="empty-state-icon">
                        <Globe size={48} />
                    </div>
                    <h3>No Panels Connected</h3>
                    <p>Connect your first SMM Panel to start managing orders</p>
                    <button className="btn btn-primary btn-lg" onClick={openSmartModal}>
                        <Sparkles size={20} />
                        Add First Panel
                    </button>
                    <div className="empty-state-features">
                        <div className="feature-item">
                            <Zap size={16} />
                            <span>Auto-detect API</span>
                        </div>
                        <div className="feature-item">
                            <Shield size={16} />
                            <span>Secure Encryption</span>
                        </div>
                        <div className="feature-item">
                            <RefreshCw size={16} />
                            <span>Auto Sync</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="panels-grid">
                    {panels.map(panel => (
                        <div key={panel.id} className={`panel-card ${panel.isPrimary ? 'primary' : ''} ${panel.supportsAdminApi ? 'has-admin-api' : ''}`}>
                            {/* Top Right Actions */}
                            <div className="panel-top-actions">
                                {panel.supportsAdminApi && (
                                    <span className="badge badge-admin">
                                        <Key size={10} />
                                        Admin
                                    </span>
                                )}
                                <button className="btn-icon" onClick={() => handleEdit(panel)} title="Edit">
                                    <Edit3 size={15} />
                                </button>
                                <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(panel.id)} title="Delete">
                                    <Trash2 size={15} />
                                </button>
                            </div>

                            {/* Header Row */}
                            <div className="panel-card-header">
                                <div className="panel-icon">
                                    <Globe size={20} />
                                </div>
                                <div className="panel-info">
                                    <h3>{panel.alias}</h3>
                                    <p className="panel-url">{panel.url}</p>
                                </div>
                            </div>

                            {/* Info Row */}
                            <div className="panel-card-body">
                                <div className="panel-info-row">
                                    <div className="panel-meta-left">
                                        <span className={`status-dot ${panel.isActive ? 'active' : 'inactive'}`}></span>
                                        <span className="status-text">{panel.isActive ? 'Active' : 'Inactive'}</span>
                                        <span className="meta-divider">•</span>
                                        <span className="panel-type">{panel.panelType}</span>
                                        <span className="meta-divider">•</span>
                                        <span className="orders-count">{panel._count?.orders || 0} orders</span>
                                    </div>
                                    {panel.lastSyncAt && (
                                        <span className="sync-time">
                                            Synced {new Date(panel.lastSyncAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>

                                {/* Capabilities - only show if present */}
                                {panel.capabilities && (
                                    <div className="panel-capabilities">
                                        {panel.capabilities.split(',').filter(cap => cap.trim()).map(cap => {
                                            const capTrim = cap.trim();
                                            let label = '';
                                            if (capTrim === 'orders') label = '📦 Orders';
                                            else if (capTrim === 'refill') label = '🔄 Refill';
                                            else if (capTrim === 'cancel') label = '❌ Cancel';
                                            else if (capTrim === 'provider') label = '🏷️ Provider';
                                            else if (capTrim === 'status') label = '📊 Status';
                                            else return null;

                                            return label ? (
                                                <span key={capTrim} className="capability-badge">{label}</span>
                                            ) : null;
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="panel-card-footer">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleRefreshBalance(panel.id)}
                                    disabled={syncingPanel === panel.id}
                                >
                                    {syncingPanel === panel.id ? (
                                        <Loader2 className="animate-spin" size={14} />
                                    ) : (
                                        <RefreshCw size={14} />
                                    )}
                                    Refresh
                                </button>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleSyncAll(panel)}
                                    disabled={syncingPanel === panel.id}
                                >
                                    <Zap size={14} />
                                    Sync All
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Smart Add Panel Modal */}
            {showModal && modalMode === 'smart' && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal smart-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Progress Steps */}
                        <div className="wizard-steps">
                            <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}>
                                <div className="step-number">{wizardStep > 1 ? <Check size={14} /> : '1'}</div>
                                <span>Credentials</span>
                            </div>
                            <div className="step-line"></div>
                            <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''} ${wizardStep > 2 ? 'completed' : ''}`}>
                                <div className="step-number">{wizardStep > 2 ? <Check size={14} /> : '2'}</div>
                                <span>Scanning</span>
                            </div>
                            <div className="step-line"></div>
                            <div className={`wizard-step ${wizardStep >= 3 ? 'active' : ''}`}>
                                <div className="step-number">3</div>
                                <span>Complete</span>
                            </div>
                        </div>

                        <button className="modal-close" onClick={() => setShowModal(false)}>
                            <X size={20} />
                        </button>

                        {/* Step 1: Input Credentials */}
                        {wizardStep === 1 && (
                            <div className="wizard-content">
                                <div className="wizard-header">
                                    <div className="wizard-icon">
                                        <Sparkles size={32} />
                                    </div>
                                    <h2>Add New Panel</h2>
                                    <p>Just enter URL and API Key, the system will automatically detect API configuration</p>
                                </div>

                                <div className="wizard-form">
                                    <div className="form-group">
                                        <label className="form-label">
                                            <Database size={16} />
                                            Panel Type *
                                        </label>
                                        <div className="panel-type-selector">
                                            <button
                                                type="button"
                                                className={`panel-type-btn ${smartForm.panelType === 'PERFECT_PANEL' ? 'active' : ''}`}
                                                onClick={() => setSmartForm({ ...smartForm, panelType: 'PERFECT_PANEL' })}
                                            >
                                                <div className="panel-type-icon">V2</div>
                                                <div className="panel-type-info">
                                                    <span className="panel-type-name">Perfect Panel</span>
                                                    <span className="panel-type-desc">Admin API v2 (Header Auth)</span>
                                                </div>
                                                {smartForm.panelType === 'PERFECT_PANEL' && <CheckCircle2 size={18} className="check-icon" />}
                                            </button>
                                            <button
                                                type="button"
                                                className={`panel-type-btn ${smartForm.panelType === 'RENTAL' ? 'active' : ''}`}
                                                onClick={() => setSmartForm({ ...smartForm, panelType: 'RENTAL' })}
                                            >
                                                <div className="panel-type-icon">V1</div>
                                                <div className="panel-type-info">
                                                    <span className="panel-type-name">Rental Panel</span>
                                                    <span className="panel-type-desc">Admin API v1 (Key Param)</span>
                                                </div>
                                                {smartForm.panelType === 'RENTAL' && <CheckCircle2 size={18} className="check-icon" />}
                                            </button>
                                        </div>
                                        <p className="form-hint">Select your panel type for optimized detection</p>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            <Globe size={16} />
                                            URL Panel *
                                        </label>
                                        <input
                                            type="url"
                                            className="form-input"
                                            placeholder="https://yourpanel.com"
                                            value={smartForm.url}
                                            onChange={(e) => setSmartForm({ ...smartForm, url: e.target.value })}
                                        />
                                        <p className="form-hint">Enter base panel URL (without /api/v2)</p>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            <Key size={16} />
                                            Admin API Key *
                                        </label>
                                        <div className="input-with-button">
                                            <input
                                                type={showApiKey ? 'text' : 'password'}
                                                className="form-input"
                                                placeholder="Enter your Admin API Key"
                                                value={smartForm.adminApiKey}
                                                onChange={(e) => setSmartForm({ ...smartForm, adminApiKey: e.target.value })}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => setShowApiKey(!showApiKey)}
                                            >
                                                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        <p className="form-hint">Get this from your panel's Admin Settings (different from User API Key)</p>
                                    </div>

                                    {error && (
                                        <div className="alert alert-error compact">
                                            <AlertCircle size={16} />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <button
                                        className="btn btn-primary btn-lg btn-full btn-glow"
                                        onClick={handleSmartDetect}
                                        disabled={!smartForm.url || !smartForm.adminApiKey}
                                    >
                                        <Search size={20} />
                                        Detect & Add
                                        <ArrowRight size={20} />
                                    </button>

                                    <button
                                        className="btn btn-ghost btn-sm switch-mode-btn"
                                        onClick={switchToManual}
                                    >
                                        <Settings size={16} />
                                        Manual Configuration
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Scanning */}
                        {wizardStep === 2 && (
                            <div className="wizard-content scanning-content">
                                <div className="scanning-animation">
                                    <div className="scan-circle">
                                        <div className="scan-pulse"></div>
                                        <div className="scan-icon">
                                            <Search size={40} />
                                        </div>
                                    </div>
                                </div>
                                <h2>Detecting API Configuration...</h2>
                                <p>{scanStatus}</p>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${Math.min(scanProgress, 100)}%` }}
                                    ></div>
                                </div>
                                <p className="progress-text">{Math.round(scanProgress)}%</p>
                            </div>
                        )}

                        {/* Step 3: Result */}
                        {wizardStep === 3 && (
                            <div className="wizard-content result-content">
                                {scanResult?.success ? (
                                    <>
                                        <div className="result-icon success">
                                            <CheckCircle2 size={48} />
                                        </div>
                                        <h2>Panel Detected! 🎉</h2>

                                        <div className="detected-info">
                                            <div className="info-card">
                                                <div className="info-item">
                                                    <span className="info-label">Panel Type</span>
                                                    <span className="info-value badge">{scanResult.panelType}</span>
                                                </div>
                                                {/* Show API Type indicator for Admin API, Balance for User API */}
                                                {scanResult.detectedConfig?.isAdminApi ? (
                                                    <div className="info-item">
                                                        <span className="info-label">API Type</span>
                                                        <span className="info-value highlight admin-api-badge">
                                                            🔐 Admin API
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="info-item">
                                                        <span className="info-label">Balance</span>
                                                        <span className="info-value highlight">
                                                            {formatNumber(scanResult.balance)} {scanResult.currency}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="info-item">
                                                    <span className="info-label">Endpoint</span>
                                                    <span className="info-value code">{scanResult.detectedConfig?.endpoint}</span>
                                                </div>
                                                {/* Show Auth method for Admin API */}
                                                {scanResult.detectedConfig?.isAdminApi && (
                                                    <div className="info-item">
                                                        <span className="info-label">Auth Method</span>
                                                        <span className="info-value code">{scanResult.detectedConfig?.keyHeader || 'X-Api-Key'} Header</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="wizard-form">
                                            <div className="form-row-2">
                                                <div className="form-group">
                                                    <label className="form-label">Panel Name *</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        placeholder="My SMM Panel"
                                                        value={smartForm.name}
                                                        onChange={(e) => setSmartForm({ ...smartForm, name: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Alias *</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        placeholder="MYPANEL"
                                                        value={smartForm.alias}
                                                        onChange={(e) => setSmartForm({ ...smartForm, alias: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <p className="form-hint">Alias will be displayed in bot replies (to hide provider name)</p>

                                            <div className="form-group">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={smartForm.isPrimary}
                                                        onChange={(e) => setSmartForm({ ...smartForm, isPrimary: e.target.checked })}
                                                    />
                                                    <span>Set as Primary Panel</span>
                                                </label>
                                            </div>

                                            {error && (
                                                <div className="alert alert-error compact">
                                                    <AlertCircle size={16} />
                                                    <span>{error}</span>
                                                </div>
                                            )}

                                            <button
                                                className="btn btn-primary btn-lg btn-full btn-glow"
                                                onClick={handleAddDetectedPanel}
                                                disabled={formLoading || !smartForm.name || !smartForm.alias}
                                            >
                                                {formLoading ? (
                                                    <Loader2 className="animate-spin" size={20} />
                                                ) : (
                                                    <>
                                                        <CheckCircle2 size={20} />
                                                        Save Panel
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="result-icon error">
                                            <WifiOff size={48} />
                                        </div>
                                        <h2>Detection Failed</h2>
                                        <p className="error-message">{scanResult?.error}</p>

                                        <div className="error-hints">
                                            <h4>Possible causes:</h4>
                                            <ul>
                                                {scanResult?.errorType === 'INVALID_API_KEY' && (
                                                    <li>The API Key entered is invalid</li>
                                                )}
                                                {scanResult?.errorType === 'CONNECTION_ERROR' && (
                                                    <li>Panel cannot be reached - check the URL</li>
                                                )}
                                                {scanResult?.errorType === 'NEEDS_API_ID' && (
                                                    <li>This panel requires an API ID</li>
                                                )}
                                                {scanResult?.errorType === 'DETECTION_FAILED' && (
                                                    <li>API format not recognized - use manual configuration</li>
                                                )}
                                                {scanResult?.errorType === 'CLOUDFLARE_PROTECTED' && (
                                                    <li>Panel is protected by Cloudflare - Admin API cannot be accessed remotely</li>
                                                )}
                                                <li>Please double-check your credentials</li>
                                            </ul>
                                        </div>

                                        <div className="result-actions">
                                            <button
                                                className="btn btn-secondary btn-lg"
                                                onClick={() => setWizardStep(1)}
                                            >
                                                <ArrowLeft size={18} />
                                                Try Again
                                            </button>
                                            <button
                                                className="btn btn-primary btn-lg"
                                                onClick={switchToManual}
                                            >
                                                <Settings size={18} />
                                                Manual Configuration
                                            </button>
                                        </div>

                                        <a href="#" className="support-link">
                                            <HelpCircle size={16} />
                                            Need help? Contact Support
                                        </a>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sync All Services Modal */}
            {showSyncModal && syncAllPanel && (
                <div className="modal-overlay open" onClick={() => !syncComplete || setShowSyncModal(false)}>
                    <div className="modal sync-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><Zap size={20} /> Scan All Endpoints</h2>
                            {syncComplete && (
                                <button className="modal-close" onClick={() => setShowSyncModal(false)}>
                                    <X size={20} />
                                </button>
                            )}
                        </div>

                        <div className="sync-panel-info">
                            <Globe size={20} />
                            <span>{syncAllPanel.name}</span>
                            <span className="sync-url">{syncAllPanel.url}</span>
                        </div>

                        {/* Scanning Status */}
                        {syncSteps.scanning && (
                            <div className={`sync-scanning-status ${syncSteps.scanning.status}`}>
                                <div className="scanning-icon">
                                    {syncSteps.scanning.status === 'scanning' && <Loader2 className="animate-spin" size={32} />}
                                    {syncSteps.scanning.status === 'success' && <CheckCircle2 size={32} />}
                                    {syncSteps.scanning.status === 'error' && <AlertCircle size={32} />}
                                </div>
                                <div className="scanning-message">{syncSteps.scanning.message}</div>
                            </div>
                        )}

                        {/* Summary Results */}
                        {syncSteps.summary && (
                            <div className="sync-summary-results">
                                <div className="summary-grid">
                                    <div className="summary-card connected">
                                        <CheckCircle2 size={24} />
                                        <span className="summary-count">{syncSteps.summary.connected}</span>
                                        <span className="summary-label">Connected</span>
                                    </div>
                                    <div className="summary-card failed">
                                        <X size={24} />
                                        <span className="summary-count">{syncSteps.summary.failed}</span>
                                        <span className="summary-label">Failed</span>
                                    </div>
                                    <div className="summary-card skipped">
                                        <AlertCircle size={24} />
                                        <span className="summary-count">{syncSteps.summary.skipped}</span>
                                        <span className="summary-label">Skipped</span>
                                    </div>
                                </div>

                                {syncSteps.summary.capabilities && syncSteps.summary.capabilities.length > 0 && (
                                    <div className="capabilities-list">
                                        <span className="capabilities-label">Detected Capabilities:</span>
                                        <div className="capabilities-tags">
                                            {syncSteps.summary.capabilities.map(cap => (
                                                <span key={cap} className="capability-tag">{cap}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="sync-tip">
                                    <HelpCircle size={16} />
                                    <span>Visit <strong>Panel Connections</strong> page for detailed status of all 23 services</span>
                                </div>
                            </div>
                        )}

                        {syncComplete && (
                            <div className="sync-actions">
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowSyncModal(false)}
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Manual/Edit Panel Modal */}
            {showModal && (modalMode === 'manual' || modalMode === 'edit') && (
                <div className="modal-overlay open" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editPanel ? 'Edit Panel' : 'Manual Configuration'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleManualSubmit}>
                            <div className="modal-body">
                                {error && (
                                    <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <AlertCircle size={16} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="form-row-2">
                                    <div className="form-group">
                                        <label className="form-label">Panel Name *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="My SMM Panel"
                                            value={manualForm.name}
                                            onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Alias *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="MySMM"
                                            value={manualForm.alias}
                                            onChange={(e) => setManualForm({ ...manualForm, alias: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">URL Panel *</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        placeholder="https://yourpanel.com"
                                        value={manualForm.url}
                                        onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        <Key size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
                                        Admin API Key *
                                    </label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder={editPanel ? 'Leave empty to keep unchanged' : 'Your Admin API Key'}
                                        value={manualForm.adminApiKey}
                                        onChange={(e) => setManualForm({ ...manualForm, adminApiKey: e.target.value })}
                                        required={!editPanel}
                                    />
                                    <p className="form-hint">Get this from your panel's Admin Settings (required for provider-level data)</p>
                                </div>

                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={manualForm.isPrimary}
                                            onChange={(e) => setManualForm({ ...manualForm, isPrimary: e.target.checked })}
                                        />
                                        <span>Set as Primary Panel</span>
                                    </label>
                                </div>

                                {/* Admin API Test Section */}
                                {editPanel && (
                                    <div className="admin-api-section">
                                        <div className="section-header">
                                            <Key size={18} />
                                            <h4>Test Connection</h4>
                                            {adminApiStatus === 'success' && (
                                                <span className="badge badge-success">
                                                    <CheckCircle2 size={12} />
                                                    Active
                                                </span>
                                            )}
                                        </div>

                                        <div className="form-group optional-field">
                                            <label className="form-label">Custom Admin API URL</label>
                                            <input
                                                type="url"
                                                className="form-input"
                                                placeholder="Leave empty to use panel URL"
                                                value={manualForm.adminApiBaseUrl}
                                                onChange={(e) => setManualForm({ ...manualForm, adminApiBaseUrl: e.target.value })}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleTestAdminApi}
                                            disabled={testingAdminApi || !manualForm.adminApiKey}
                                            style={{ marginBottom: 'var(--spacing-md)' }}
                                        >
                                            {testingAdminApi ? (
                                                <Loader2 className="animate-spin" size={16} />
                                            ) : (
                                                <Wifi size={16} />
                                            )}
                                            Test Admin API Connection
                                        </button>

                                        {adminApiMessage && (
                                            <div className={`admin-api-status ${adminApiStatus}`}>
                                                {adminApiStatus === 'success' ? (
                                                    <CheckCircle2 size={16} />
                                                ) : adminApiStatus === 'error' ? (
                                                    <AlertCircle size={16} />
                                                ) : (
                                                    <Loader2 className="animate-spin" size={16} />
                                                )}
                                                <span>{adminApiMessage}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : editPanel ? (
                                        'Update Panel'
                                    ) : (
                                        'Save Panel'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                /* Enhanced Button Glow */
                .btn-glow {
                    position: relative;
                    overflow: hidden;
                }
                .btn-glow::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    animation: shimmer 2s infinite;
                }
                @keyframes shimmer {
                    100% { left: 100%; }
                }

                /* Empty State Card */
                .empty-state-card {
                    background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(37, 211, 102, 0.05) 100%);
                    border: 1px dashed var(--border-color);
                    border-radius: var(--radius-xl);
                    padding: var(--spacing-3xl);
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                }
                .empty-state-icon {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    margin-bottom: var(--spacing-md);
                }
                .empty-state-card h3 {
                    font-size: 1.5rem;
                    margin: 0;
                }
                .empty-state-card > p {
                    color: var(--text-secondary);
                    margin: 0;
                }
                .empty-state-features {
                    display: flex;
                    gap: var(--spacing-lg);
                    margin-top: var(--spacing-lg);
                }
                .feature-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                .feature-item svg {
                    color: var(--primary-500);
                }

                /* Panels Grid */
                .panels-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
                    gap: var(--spacing-lg);
                }

                /* Panel Card - Compact Design */
                .panel-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                    transition: all 0.2s ease;
                    position: relative;
                }
                .panel-card:hover {
                    border-color: var(--primary-500);
                    box-shadow: 0 4px 20px rgba(37, 211, 102, 0.15);
                }
                .panel-card.primary {
                    border-left: 3px solid var(--primary-500);
                }

                /* Top Right Actions - Absolute Position */
                .panel-top-actions {
                    position: absolute;
                    top: var(--spacing-sm);
                    right: var(--spacing-sm);
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    z-index: 1;
                }

                /* Panel Card Header */
                .panel-card-header {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md) var(--spacing-lg);
                    padding-right: 120px; /* space for absolute actions */
                }
                .panel-icon {
                    width: 40px;
                    height: 40px;
                    background: var(--gradient-primary);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    flex-shrink: 0;
                }
                .panel-info {
                    flex: 1;
                    min-width: 0;
                }
                .panel-info h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                    color: var(--text-primary);
                }
                .panel-url {
                    font-size: 0.75rem;
                    font-family: var(--font-mono);
                    color: var(--text-muted);
                    margin: 3px 0 0;
                }
                .badge-admin {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    padding: 4px 8px;
                    border-radius: var(--radius-full);
                    font-size: 0.6rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    background: rgba(37, 211, 102, 0.15);
                    color: var(--primary-500);
                    border: 1px solid rgba(37, 211, 102, 0.3);
                }
                .btn-icon {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: var(--radius-sm);
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .btn-icon:hover {
                    background: var(--bg-tertiary);
                    border-color: var(--border-color);
                    color: var(--text-primary);
                }
                .btn-icon-danger:hover {
                    background: rgba(239, 68, 68, 0.1);
                    border-color: rgba(239, 68, 68, 0.3);
                    color: var(--error);
                }

                /* Panel Card Body - Compact */
                .panel-card-body {
                    padding: var(--spacing-md) var(--spacing-lg);
                }
                .panel-info-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: var(--spacing-sm);
                }
                .panel-meta-left {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                }
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                .status-dot.active {
                    background: var(--success);
                    box-shadow: 0 0 6px var(--success);
                }
                .status-dot.inactive {
                    background: var(--error);
                }
                .status-text {
                    font-weight: 500;
                }
                .meta-divider {
                    color: var(--text-muted);
                    opacity: 0.5;
                }
                .panel-type {
                    color: var(--text-muted);
                }
                .orders-count {
                    color: var(--text-secondary);
                }
                .sync-time {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                }

                /* Capabilities - Inline */
                .panel-capabilities {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-xs);
                    margin-top: var(--spacing-sm);
                }
                .capability-badge {
                    display: inline-flex;
                    align-items: center;
                    font-size: 0.7rem;
                    padding: 3px 8px;
                    border-radius: var(--radius-sm);
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                    border: 1px solid rgba(37, 211, 102, 0.2);
                }

                /* Panel Card Footer */
                .panel-card-footer {
                    display: flex;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                }
                .panel-card-footer .btn {
                    flex: 1;
                    justify-content: center;
                    padding: var(--spacing-xs) var(--spacing-md);
                    font-size: 0.8rem;
                }

                /* Smart Modal */
                .smart-modal {
                    max-width: 520px;
                    overflow: visible;
                }

                /* Wizard Steps */
                .wizard-steps {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-lg) var(--spacing-xl);
                    background: var(--bg-tertiary);
                    border-bottom: 1px solid var(--border-color);
                    gap: var(--spacing-sm);
                }
                .wizard-step {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                .wizard-step.active {
                    color: var(--primary-500);
                }
                .wizard-step.completed {
                    color: var(--primary-500);
                }
                .step-number {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: var(--bg-secondary);
                    border: 2px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .wizard-step.active .step-number {
                    background: var(--primary-500);
                    border-color: var(--primary-500);
                    color: white;
                }
                .wizard-step.completed .step-number {
                    background: var(--primary-500);
                    border-color: var(--primary-500);
                    color: white;
                }
                .step-line {
                    width: 40px;
                    height: 2px;
                    background: var(--border-color);
                }

                /* Wizard Content */
                .wizard-content {
                    padding: var(--spacing-xl);
                }
                .wizard-header {
                    text-align: center;
                    margin-bottom: var(--spacing-xl);
                }
                .wizard-icon {
                    width: 64px;
                    height: 64px;
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    margin: 0 auto var(--spacing-md);
                }
                .wizard-header h2 {
                    margin: 0 0 var(--spacing-sm);
                }
                .wizard-header p {
                    color: var(--text-secondary);
                    margin: 0;
                }

                .wizard-form {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }
                .wizard-form .form-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .optional-field {
                    opacity: 0.8;
                }

                .btn-full { width: 100%; }
                .btn-lg {
                    padding: var(--spacing-md) var(--spacing-lg);
                    font-size: 1rem;
                }

                .switch-mode-btn {
                    margin: var(--spacing-md) auto 0;
                }

                /* Scanning Animation */
                .scanning-content {
                    text-align: center;
                    padding: var(--spacing-3xl) var(--spacing-xl);
                }
                .scanning-animation {
                    margin-bottom: var(--spacing-xl);
                }
                .scan-circle {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.1), rgba(37, 211, 102, 0.05));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto;
                    position: relative;
                }
                .scan-pulse {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 2px solid var(--primary-500);
                    animation: pulse 1.5s ease-out infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
                .scan-icon {
                    color: var(--primary-500);
                    animation: searchMove 1s ease-in-out infinite;
                }
                @keyframes searchMove {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-5px); }
                }

                .progress-bar {
                    width: 100%;
                    height: 8px;
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    overflow: hidden;
                    margin: var(--spacing-lg) 0 var(--spacing-sm);
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--primary-500), var(--primary-400));
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }
                .progress-text {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                /* Result Content */
                .result-content {
                    text-align: center;
                }
                .result-icon {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto var(--spacing-lg);
                }
                .result-icon.success {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }
                .result-icon.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .detected-info {
                    margin: var(--spacing-lg) 0;
                }
                .info-card {
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    text-align: left;
                }
                .info-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-color);
                }
                .info-item:last-child {
                    border-bottom: none;
                }
                .info-label {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                .info-value {
                    font-weight: 500;
                }
                .info-value.badge {
                    background: var(--primary-500);
                    color: white;
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                }
                .info-value.highlight {
                    color: var(--primary-500);
                    font-size: 1.125rem;
                }
                .info-value.code {
                    font-family: monospace;
                    background: var(--bg-secondary);
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                }

                .error-message {
                    color: var(--error);
                    margin-bottom: var(--spacing-lg);
                }
                .error-hints {
                    background: rgba(239, 68, 68, 0.05);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    text-align: left;
                    margin-bottom: var(--spacing-lg);
                }
                .error-hints h4 {
                    margin: 0 0 var(--spacing-sm);
                    font-size: 0.875rem;
                    color: var(--error);
                }
                .error-hints ul {
                    margin: 0;
                    padding-left: var(--spacing-lg);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                .error-hints li {
                    margin-bottom: var(--spacing-xs);
                }

                .result-actions {
                    display: flex;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }
                .result-actions .btn {
                    flex: 1;
                }

                .support-link {
                    display: inline-flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    text-decoration: none;
                }
                .support-link:hover {
                    color: var(--primary-500);
                }

                /* Form Enhancements */
                .form-row-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-md);
                }
                .input-with-button {
                    display: flex;
                    gap: var(--spacing-sm);
                }
                .input-with-button .form-input {
                    flex: 1;
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
                .advanced-toggle {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-md);
                    color: var(--text-secondary);
                }
                .advanced-settings {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                }

                .alert.compact {
                    padding: var(--spacing-sm) var(--spacing-md);
                }

                /* Loading */
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

                /* Admin API Badge */
                .admin-api-badge {
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.2), rgba(37, 211, 102, 0.1)) !important;
                    border: 1px solid var(--primary-500) !important;
                    color: var(--primary-500) !important;
                    padding: 4px 12px !important;
                    border-radius: var(--radius-sm) !important;
                    font-weight: 600 !important;
                }

                /* Sync Modal Styles */
                .sync-modal {
                    max-width: 500px;
                }
                .sync-panel-info {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }
                .sync-panel-info span {
                    font-weight: 600;
                }
                .sync-url {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                    font-weight: 400 !important;
                    margin-left: auto;
                }
                .sync-steps-container {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }
                .sync-step-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    transition: all 0.3s ease;
                }
                .sync-step-item.pending {
                    opacity: 0.5;
                }
                .sync-step-item.scanning {
                    background: var(--bg-secondary);
                    border: 1px solid var(--primary-500);
                }
                .sync-step-item.success {
                    background: rgba(37, 211, 102, 0.1);
                    border: 1px solid var(--primary-500);
                }
                .sync-step-item.error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid var(--error);
                }
                .sync-step-item.skipped {
                    background: rgba(245, 158, 11, 0.1);
                    border: 1px solid var(--warning);
                }
                .sync-step-icon {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }
                .sync-step-item.pending .sync-step-icon { color: var(--text-tertiary); }
                .sync-step-item.scanning .sync-step-icon { color: var(--primary-500); }
                .sync-step-item.success .sync-step-icon { color: var(--primary-500); }
                .sync-step-item.error .sync-step-icon { color: var(--error); }
                .sync-step-item.skipped .sync-step-icon { color: var(--warning); }
                .step-dot {
                    width: 10px;
                    height: 10px;
                    background: var(--text-tertiary);
                    border-radius: 50%;
                }
                .sync-step-content {
                    flex: 1;
                }
                .sync-step-name {
                    font-weight: 600;
                    font-size: 0.95rem;
                }
                .sync-step-message {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    margin-top: 2px;
                }
                .sync-detected-endpoint {
                    margin-top: 4px;
                }
                .sync-detected-endpoint code {
                    font-family: 'Fira Code', monospace;
                    font-size: 0.75rem;
                    padding: 2px 8px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    color: var(--primary-500);
                }
                .sync-result-summary {
                    margin-top: var(--spacing-lg);
                    padding-top: var(--spacing-lg);
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .sync-summary-stats {
                    display: flex;
                    gap: var(--spacing-md);
                }
                .sync-stat {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-xs) var(--spacing-sm);
                    border-radius: var(--radius-sm);
                    font-size: 0.85rem;
                    font-weight: 500;
                }
                .sync-stat.success {
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                }
                .sync-stat.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: var(--error);
                }
                .sync-stat.skipped {
                    background: rgba(245, 158, 11, 0.1);
                    color: var(--warning);
                }

                /* Capability Badges on Panel Cards - Improved */
                .panel-capabilities {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-xs);
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                }
                .capability-badge {
                    display: inline-flex;
                    align-items: center;
                    font-size: 0.7rem;
                    padding: 4px 10px;
                    border-radius: var(--radius-full);
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                    border: 1px solid var(--border-color);
                    transition: all 0.2s;
                }
                .capability-badge.active {
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                    border-color: rgba(37, 211, 102, 0.3);
                }
                .capability-badge:hover {
                    transform: scale(1.05);
                }

                /* Responsive */
                @media (max-width: 640px) {
                    .panels-grid {
                        grid-template-columns: 1fr;
                    }
                    .form-row-2 {
                        grid-template-columns: 1fr;
                    }
                    .wizard-steps span {
                        display: none;
                    }
                    .empty-state-features {
                        flex-direction: column;
                        align-items: center;
                    }
                }
            `}</style>
        </div>
    )
}

import { useState, useEffect, useRef } from 'react'
import {
    Smartphone,
    Plus,
    QrCode,
    RefreshCw,
    Trash2,
    MoreVertical,
    CheckCircle,
    XCircle,
    Signal,
    Battery,
    Wifi,
    MessageSquare,
    Clock,
    X,
    Loader2
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

export default function Devices() {
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [activeTab, setActiveTab] = useState('all')
    const [newDeviceName, setNewDeviceName] = useState('')
    const [qrCode, setQrCode] = useState(null)
    const [addLoading, setAddLoading] = useState(false)
    const [currentDeviceId, setCurrentDeviceId] = useState(null)
    const [qrStatus, setQrStatus] = useState('idle') // idle, loading, ready, scanning, connected, error
    const [connectionMessage, setConnectionMessage] = useState('')
    const qrPollRef = useRef(null)

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data || [])
        } catch (error) {
            console.error('Failed to fetch devices:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDevices()
        const interval = setInterval(fetchDevices, 10000)
        return () => clearInterval(interval)
    }, [])

    // Cleanup QR polling when modal closes
    useEffect(() => {
        if (!showAddModal) {
            if (qrPollRef.current) {
                clearInterval(qrPollRef.current)
                qrPollRef.current = null
            }
        }
    }, [showAddModal])

    // Start polling for QR/status when device is created
    const startQRPolling = (deviceId) => {
        if (qrPollRef.current) {
            clearInterval(qrPollRef.current)
        }

        const pollQR = async () => {
            try {
                // Add timestamp to prevent caching (304 responses)
                const res = await api.get(`/devices/${deviceId}/qr?t=${Date.now()}`)

                if (res.data.status === 'connected') {
                    // Device is connected!
                    setQrStatus('connected')
                    setConnectionMessage('Device connected successfully!')
                    clearInterval(qrPollRef.current)
                    qrPollRef.current = null
                    fetchDevices()

                    // Auto close modal after 2 seconds
                    setTimeout(() => {
                        setShowAddModal(false)
                        resetModal()
                    }, 2000)
                } else if (res.data.qrCode) {
                    setQrCode(res.data.qrCode)
                    setQrStatus('ready')
                    setConnectionMessage('Scan this QR code with WhatsApp')
                } else {
                    setQrStatus('loading')
                    setConnectionMessage('Generating QR code...')
                }
            } catch (error) {
                console.error('QR poll error:', error)
                // If device already connected
                if (error?.error?.message?.includes('already connected')) {
                    setQrStatus('connected')
                    setConnectionMessage('Device is already connected!')
                    clearInterval(qrPollRef.current)
                    fetchDevices()
                    setTimeout(() => {
                        setShowAddModal(false)
                        resetModal()
                    }, 2000)
                }
            }
        }

        // Poll immediately, then every 2 seconds
        pollQR()
        qrPollRef.current = setInterval(pollQR, 2000)
    }

    const resetModal = () => {
        setQrCode(null)
        setQrStatus('idle')
        setConnectionMessage('')
        setNewDeviceName('')
        setCurrentDeviceId(null)
    }

    const handleAddDevice = async () => {
        if (!newDeviceName) return
        setAddLoading(true)
        setQrStatus('loading')
        setConnectionMessage('Creating device...')

        try {
            const res = await api.post('/devices', { name: newDeviceName })
            setCurrentDeviceId(res.data.id)

            // If QR is returned immediately
            if (res.data.qrCode) {
                setQrCode(res.data.qrCode)
                setQrStatus('ready')
                setConnectionMessage('Scan this QR code with WhatsApp')
            } else {
                setConnectionMessage('Waiting for QR code...')
            }

            // Start polling for QR updates
            startQRPolling(res.data.id)
            fetchDevices()
        } catch (error) {
            console.error('Failed to add device:', error)
            setQrStatus('error')
            setConnectionMessage(error?.error?.message || 'Failed to create device')
        } finally {
            setAddLoading(false)
        }
    }

    const handleDeleteDevice = async (id) => {
        if (!confirm('Are you sure you want to delete this device?')) return
        try {
            await api.delete(`/devices/${id}`)
            fetchDevices()
        } catch (error) {
            console.error('Failed to delete device:', error)
        }
    }

    const handleRestartDevice = async (id) => {
        try {
            await api.post(`/devices/${id}/restart`)
            fetchDevices()
        } catch (error) {
            console.error('Failed to restart device:', error)
        }
    }

    const handleGetQR = async (id) => {
        setCurrentDeviceId(id)
        setNewDeviceName(devices.find(d => d.id === id)?.name || '')
        setShowAddModal(true)
        setQrStatus('loading')
        setConnectionMessage('Getting QR code...')
        startQRPolling(id)
    }

    const handleOpenAddModal = () => {
        setShowAddModal(true)
        resetModal()
    }

    const handleCloseModal = () => {
        if (qrPollRef.current) {
            clearInterval(qrPollRef.current)
            qrPollRef.current = null
        }
        setShowAddModal(false)
        resetModal()
    }

    const filteredDevices = devices.filter(device => {
        if (activeTab === 'all') return true
        return device.status === activeTab
    })

    const connectedCount = devices.filter(d => d.status === 'connected').length
    const disconnectedCount = devices.filter(d => d.status !== 'connected').length

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin primary" size={48} />
            </div>
        )
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Device Management</h1>
                    <p className="page-subtitle">Manage your WhatsApp sessions and connected devices</p>
                </div>
                <button className="btn btn-primary" onClick={handleOpenAddModal}>
                    <Plus size={16} />
                    Add Device
                </button>
            </div>

            {/* Filter Tabs */}
            <div className="tabs" style={{ maxWidth: '400px', marginBottom: 'var(--spacing-xl)' }}>
                <button
                    className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveTab('all')}
                >
                    All ({devices.length})
                </button>
                <button
                    className={`tab ${activeTab === 'connected' ? 'active' : ''}`}
                    onClick={() => setActiveTab('connected')}
                >
                    Online ({connectedCount})
                </button>
                <button
                    className={`tab ${activeTab === 'disconnected' ? 'active' : ''}`}
                    onClick={() => setActiveTab('disconnected')}
                >
                    Offline ({disconnectedCount})
                </button>
            </div>

            {/* Devices Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                gap: 'var(--spacing-lg)'
            }}>
                {filteredDevices.map((device) => (
                    <div
                        key={device.id}
                        className={`device-card ${device.status === 'connected' ? 'connected' : ''}`}
                    >
                        <div className="device-header">
                            <div className="device-info">
                                <div className="device-avatar" style={{
                                    background: device.status === 'connected'
                                        ? 'rgba(37, 211, 102, 0.15)'
                                        : 'var(--bg-tertiary)'
                                }}>
                                    <Smartphone
                                        size={24}
                                        style={{
                                            color: device.status === 'connected'
                                                ? 'var(--primary-500)'
                                                : 'var(--text-muted)'
                                        }}
                                    />
                                </div>
                                <div>
                                    <div className="device-name">{device.name}</div>
                                    <div className="device-number">{device.phone || 'Not connected'}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                <span className={`badge ${device.status === 'connected' ? 'badge-success' : 'badge-error'}`}>
                                    <span className={`status-dot ${device.status === 'connected' ? 'online' : 'offline'}`}></span>
                                    {device.status === 'connected' ? 'Online' : device.status === 'connecting' ? 'Connecting' : 'Offline'}
                                </span>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-sm)',
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                            marginTop: 'var(--spacing-sm)'
                        }}>
                            <Clock size={12} />
                            {device.lastActive
                                ? `Active ${formatDistanceToNow(new Date(device.lastActive), { addSuffix: true })}`
                                : 'Never connected'}
                        </div>

                        <div className="device-stats">
                            <div className="device-stat">
                                <MessageSquare size={14} />
                                <span>{device.messagesSent || 0} sent</span>
                            </div>
                            <div className="device-stat">
                                <MessageSquare size={14} />
                                <span>{device.messagesReceived || 0} received</span>
                            </div>
                        </div>

                        <div className="device-actions">
                            {device.status === 'connected' ? (
                                <>
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleRestartDevice(device.id)}>
                                        <RefreshCw size={14} />
                                        Restart
                                    </button>
                                    <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => handleDeleteDevice(device.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleGetQR(device.id)}>
                                        <QrCode size={14} />
                                        Connect
                                    </button>
                                    <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => handleDeleteDevice(device.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add/Connect Device Modal */}
            <div className={`modal-overlay ${showAddModal ? 'open' : ''}`} onClick={handleCloseModal}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3 className="modal-title">{currentDeviceId ? 'Connect Device' : 'Add New Device'}</h3>
                        <button className="btn btn-ghost btn-icon" onClick={handleCloseModal}>
                            <X size={20} />
                        </button>
                    </div>
                    <div className="modal-body">
                        {/* Step 1: Enter device name (only if new device) */}
                        {!currentDeviceId && qrStatus === 'idle' && (
                            <div className="form-group">
                                <label className="form-label">Device Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., Marketing Team"
                                    value={newDeviceName}
                                    onChange={(e) => setNewDeviceName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddDevice()}
                                />
                                <p className="form-hint">Give this device a memorable name</p>
                                <button
                                    className="btn btn-primary w-full"
                                    onClick={handleAddDevice}
                                    disabled={addLoading || !newDeviceName}
                                    style={{ marginTop: 'var(--spacing-lg)' }}
                                >
                                    {addLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                    Create & Connect
                                </button>
                            </div>
                        )}

                        {/* Loading state */}
                        {qrStatus === 'loading' && (
                            <div style={{
                                textAlign: 'center',
                                padding: 'var(--spacing-xl) 0'
                            }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    margin: '0 auto var(--spacing-lg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(37, 211, 102, 0.1)',
                                    borderRadius: '50%'
                                }}>
                                    <Loader2 className="animate-spin" size={40} style={{ color: 'var(--primary-500)' }} />
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    {connectionMessage}
                                </p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 'var(--spacing-xs)' }}>
                                    Please wait...
                                </p>
                            </div>
                        )}

                        {/* QR Code Ready */}
                        {qrStatus === 'ready' && qrCode && (
                            <div style={{
                                textAlign: 'center',
                                padding: 'var(--spacing-lg)',
                                background: 'white',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border-color)'
                            }}>
                                <div style={{
                                    width: '240px',
                                    height: '240px',
                                    margin: '0 auto var(--spacing-lg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#fff',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--spacing-sm)'
                                }}>
                                    <img src={qrCode} alt="QR Code" style={{ width: '100%', height: '100%' }} />
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Scan this QR code with your WhatsApp app
                                </p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 'var(--spacing-xs)' }}>
                                    Open WhatsApp → Settings → Linked Devices → Link a Device
                                </p>
                                <div style={{
                                    marginTop: 'var(--spacing-lg)',
                                    padding: 'var(--spacing-sm)',
                                    background: 'rgba(37, 211, 102, 0.1)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 'var(--spacing-sm)'
                                }}>
                                    <Loader2 className="animate-spin" size={14} style={{ color: 'var(--primary-500)' }} />
                                    <span style={{ color: 'var(--primary-500)', fontSize: '0.75rem' }}>
                                        Waiting for scan...
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Connected success */}
                        {qrStatus === 'connected' && (
                            <div style={{
                                textAlign: 'center',
                                padding: 'var(--spacing-xl) 0'
                            }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    margin: '0 auto var(--spacing-lg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(37, 211, 102, 0.15)',
                                    borderRadius: '50%'
                                }}>
                                    <CheckCircle size={40} style={{ color: 'var(--primary-500)' }} />
                                </div>
                                <p style={{ color: 'var(--primary-500)', fontSize: '1rem', fontWeight: 600 }}>
                                    {connectionMessage}
                                </p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 'var(--spacing-xs)' }}>
                                    Closing automatically...
                                </p>
                            </div>
                        )}

                        {/* Error state */}
                        {qrStatus === 'error' && (
                            <div style={{
                                textAlign: 'center',
                                padding: 'var(--spacing-xl) 0'
                            }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    margin: '0 auto var(--spacing-lg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '50%'
                                }}>
                                    <XCircle size={40} style={{ color: 'var(--error)' }} />
                                </div>
                                <p style={{ color: 'var(--error)', fontSize: '0.875rem', fontWeight: 500 }}>
                                    {connectionMessage}
                                </p>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        if (currentDeviceId) {
                                            startQRPolling(currentDeviceId)
                                        } else {
                                            resetModal()
                                        }
                                    }}
                                    style={{ marginTop: 'var(--spacing-lg)' }}
                                >
                                    <RefreshCw size={14} />
                                    Try Again
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={handleCloseModal}>
                            {qrStatus === 'connected' ? 'Close' : 'Cancel'}
                        </button>
                        {qrStatus === 'ready' && (
                            <button className="btn btn-primary" onClick={() => startQRPolling(currentDeviceId)}>
                                <RefreshCw size={16} />
                                Refresh QR
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

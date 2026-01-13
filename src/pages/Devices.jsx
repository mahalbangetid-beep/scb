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
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 'var(--spacing-lg)'
            }}>
                {filteredDevices.map((device) => (
                    <div
                        key={device.id}
                        style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--spacing-lg)',
                            border: device.status === 'connected'
                                ? '1px solid rgba(37, 211, 102, 0.3)'
                                : '1px solid var(--border-color)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: device.status === 'connected'
                                        ? 'linear-gradient(135deg, rgba(37, 211, 102, 0.2), rgba(37, 211, 102, 0.1))'
                                        : 'var(--bg-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Smartphone size={24} style={{
                                        color: device.status === 'connected' ? '#25D366' : 'var(--text-muted)'
                                    }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                        {device.name}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {device.phone || 'Not connected'}
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                background: device.status === 'connected'
                                    ? 'rgba(37, 211, 102, 0.15)'
                                    : 'rgba(239, 68, 68, 0.1)',
                                color: device.status === 'connected' ? '#25D366' : '#ef4444'
                            }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: device.status === 'connected' ? '#25D366' : '#ef4444'
                                }}></span>
                                {device.status === 'connected' ? 'Online' : 'Offline'}
                            </div>
                        </div>

                        {/* Stats */}
                        <div style={{
                            display: 'flex',
                            gap: 'var(--spacing-lg)',
                            padding: 'var(--spacing-md) 0',
                            borderTop: '1px solid var(--border-color)',
                            borderBottom: '1px solid var(--border-color)',
                            marginBottom: 'var(--spacing-md)'
                        }}>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {device.messagesSent || 0}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sent</div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {device.messagesReceived || 0}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Received</div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                            {device.status === 'connected' ? (
                                <>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ flex: 1 }}
                                        onClick={() => handleRestartDevice(device.id)}
                                    >
                                        <RefreshCw size={14} />
                                        Restart
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '8px' }}
                                        onClick={() => handleDeleteDevice(device.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        style={{ flex: 1 }}
                                        onClick={() => handleGetQR(device.id)}
                                    >
                                        <QrCode size={14} />
                                        Connect
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '8px' }}
                                        onClick={() => handleDeleteDevice(device.id)}
                                    >
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
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    background: '#fff',
                                    borderRadius: '16px',
                                    padding: '24px',
                                    display: 'inline-block'
                                }}>
                                    <img
                                        src={qrCode}
                                        alt="QR Code"
                                        style={{
                                            width: '280px',
                                            height: '280px',
                                            display: 'block'
                                        }}
                                    />
                                </div>
                                <div style={{
                                    marginTop: 'var(--spacing-lg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    color: '#25D366'
                                }}>
                                    <Loader2 className="animate-spin" size={16} />
                                    <span style={{ fontSize: '0.875rem' }}>Waiting for scan...</span>
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

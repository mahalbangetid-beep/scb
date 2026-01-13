import { useState, useEffect } from 'react'
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
        const interval = setInterval(fetchDevices, 10000) // Poll every 10s
        return () => clearInterval(interval)
    }, [])

    const handleAddDevice = async () => {
        if (!newDeviceName) return
        setAddLoading(true)
        try {
            const res = await api.post('/devices', { name: newDeviceName })
            setQrCode(res.data.qrCode)
            setCurrentDeviceId(res.data.id)
            fetchDevices()
        } catch (error) {
            console.error('Failed to add device:', error)
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
        try {
            const res = await api.get(`/devices/${id}/qr`)
            setQrCode(res.data.qrCode)
            setCurrentDeviceId(id)
            setShowAddModal(true)
            setNewDeviceName(devices.find(d => d.id === id)?.name || '')
        } catch (error) {
            console.error('Failed to get QR:', error)
            alert(error.error?.message || 'Failed to get QR code')
        }
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
                <button className="btn btn-primary" onClick={() => {
                    setShowAddModal(true)
                    setQrCode(null)
                    setNewDeviceName('')
                    setCurrentDeviceId(null)
                }}>
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
                            Last active: {device.lastActive ? formatDistanceToNow(new Date(device.lastActive), { addSuffix: true }) : 'Never'}
                        </div>

                        <div className="device-stats">
                            <div className="device-stat">
                                <div className="device-stat-value" style={{ color: 'var(--primary-500)' }}>
                                    {device.messagesSent?.toLocaleString() || 0}
                                </div>
                                <div className="device-stat-label">Messages</div>
                            </div>
                            <div className="device-stat">
                                <div className="device-stat-value" style={{ color: 'var(--info)' }}>
                                    {device.status}
                                </div>
                                <div className="device-stat-label">Status</div>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex',
                            gap: 'var(--spacing-sm)',
                            marginTop: 'var(--spacing-md)',
                            paddingTop: 'var(--spacing-md)',
                            borderTop: '1px solid var(--border-color)'
                        }}>
                            {device.status === 'connected' ? (
                                <>
                                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => handleRestartDevice(device.id)}>
                                        <RefreshCw size={14} />
                                        Restart
                                    </button>
                                    <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleDeleteDevice(device.id)}>
                                        <XCircle size={14} />
                                        Delete
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handleGetQR(device.id)}>
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
            <div className={`modal-overlay ${showAddModal ? 'open' : ''}`} onClick={() => setShowAddModal(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3 className="modal-title">{currentDeviceId ? 'Connect Device' : 'Add New Device'}</h3>
                        <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}>
                            <X size={20} />
                        </button>
                    </div>
                    <div className="modal-body">
                        {!currentDeviceId && (
                            <div className="form-group">
                                <label className="form-label">Device Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g., Marketing Team"
                                    value={newDeviceName}
                                    onChange={(e) => setNewDeviceName(e.target.value)}
                                />
                                <p className="form-hint">Give this device a memorable name</p>
                            </div>
                        )}

                        {qrCode ? (
                            <div style={{
                                textAlign: 'center',
                                padding: 'var(--spacing-xl)',
                                background: 'white',
                                borderRadius: 'var(--radius-lg)',
                                marginTop: 'var(--spacing-lg)',
                                border: '1px solid var(--border-color)'
                            }}>
                                <div style={{
                                    width: '240px',
                                    height: '240px',
                                    margin: '0 auto var(--spacing-lg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <img src={qrCode} alt="QR Code" style={{ width: '100%', height: '100%' }} />
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500 }}>
                                    Scan this QR code with your WhatsApp app
                                </p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 'var(--spacing-xs)' }}>
                                    Open WhatsApp → Settings → Linked Devices → Link a Device
                                </p>
                            </div>
                        ) : (
                            !currentDeviceId && (
                                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <button
                                        className="btn btn-primary w-full"
                                        onClick={handleAddDevice}
                                        disabled={addLoading || !newDeviceName}
                                    >
                                        {addLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                        Initialize Device
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                            {qrCode ? 'Done' : 'Cancel'}
                        </button>
                        {qrCode && (
                            <button className="btn btn-primary" onClick={() => handleGetQR(currentDeviceId)}>
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

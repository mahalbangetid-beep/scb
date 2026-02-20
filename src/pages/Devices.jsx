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
    Loader2,
    Link2,
    Settings,
    Power,
    Users,
    ShieldOff,
    ShieldCheck
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'
import { getPhoneFlag } from '../utils/countryFlag'

export default function Devices() {
    const [devices, setDevices] = useState([])
    const [panels, setPanels] = useState([])  // Available SMM panels
    const [loading, setLoading] = useState(true)
    const [showAddModal, setShowAddModal] = useState(false)
    const [activeTab, setActiveTab] = useState('all')
    const [newDeviceName, setNewDeviceName] = useState('')
    const [selectedPanelId, setSelectedPanelId] = useState('')  // Selected panel for device
    const [qrCode, setQrCode] = useState(null)
    const [addLoading, setAddLoading] = useState(false)
    const [currentDeviceId, setCurrentDeviceId] = useState(null)
    const [qrStatus, setQrStatus] = useState('idle') // idle, loading, ready, scanning, connected, error
    const [connectionMessage, setConnectionMessage] = useState('')
    const qrPollRef = useRef(null)

    // Action loading states (double-click protection)
    const [deletingDevice, setDeletingDevice] = useState(null)
    const [restartingDevice, setRestartingDevice] = useState(null)
    const [togglingDevice, setTogglingDevice] = useState(null)

    // Edit Panel Modal State
    const [showEditModal, setShowEditModal] = useState(false)
    const [editDevice, setEditDevice] = useState(null)
    const [editPanelIds, setEditPanelIds] = useState([])
    const [editReplyScope, setEditReplyScope] = useState('all')
    const [editForwardOnly, setEditForwardOnly] = useState(false)
    const [editLoading, setEditLoading] = useState(false)

    // Group Block State
    const [deviceGroups, setDeviceGroups] = useState([])
    const [groupsLoading, setGroupsLoading] = useState(false)
    const [selectedGroupJids, setSelectedGroupJids] = useState([])
    const [groupActionLoading, setGroupActionLoading] = useState(false)

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

    const fetchPanels = async () => {
        try {
            const res = await api.get('/panels')
            setPanels(res.data || [])
        } catch (error) {
            console.error('Failed to fetch panels:', error)
        }
    }

    useEffect(() => {
        fetchDevices()
        fetchPanels()  // Fetch panels for the dropdown
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

                    // Optimistic update - immediately show as connected
                    setDevices(prev => prev.map(d =>
                        d.id === deviceId ? { ...d, status: 'connected' } : d
                    ))

                    // Auto close modal after 1.5 seconds (faster)
                    setTimeout(() => {
                        setShowAddModal(false)
                        resetModal()
                        // Refresh to get full data (phone number, etc)
                        fetchDevices()
                    }, 1500)
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
        setSelectedPanelId('')  // Reset panel selection
        setCurrentDeviceId(null)
    }

    const handleAddDevice = async () => {
        if (!newDeviceName) return
        setAddLoading(true)
        setQrStatus('loading')
        setConnectionMessage('Creating device...')

        try {
            // Send panelId if selected (null/empty means no panel assigned)
            const payload = {
                name: newDeviceName,
                panelId: selectedPanelId || null  // Include panel binding
            }
            const res = await api.post('/devices', payload)
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
        if (deletingDevice === id) return
        if (!confirm('Are you sure you want to delete this device?')) return
        setDeletingDevice(id)
        try {
            await api.delete(`/devices/${id}`)
            fetchDevices()
        } catch (error) {
            console.error('Failed to delete device:', error)
        } finally {
            setDeletingDevice(null)
        }
    }

    const handleRestartDevice = async (id) => {
        if (restartingDevice === id) return
        setRestartingDevice(id)
        try {
            await api.post(`/devices/${id}/restart`)
            fetchDevices()
        } catch (error) {
            console.error('Failed to restart device:', error)
        } finally {
            setRestartingDevice(null)
        }
    }

    const handleToggleDevice = async (id) => {
        if (togglingDevice === id) return
        setTogglingDevice(id)
        try {
            const res = await api.patch(`/devices/${id}/toggle`)
            // Optimistic update
            setDevices(prev => prev.map(d =>
                d.id === id ? { ...d, isActive: res.data?.isActive ?? !d.isActive } : d
            ))
        } catch (error) {
            console.error('Failed to toggle device:', error)
            alert(error?.error?.message || 'Failed to toggle device')
        } finally {
            setTogglingDevice(null)
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

    // Edit Panel Handlers
    const handleOpenEditModal = (device) => {
        setEditDevice(device)
        // Populate from multi-panel bindings, fallback to primary panelId
        const boundIds = (device.panels || []).map(p => p.id)
        if (boundIds.length > 0) {
            setEditPanelIds(boundIds)
        } else if (device.panelId) {
            setEditPanelIds([device.panelId])
        } else {
            setEditPanelIds([])
        }
        setEditReplyScope(device.replyScope || 'all')
        setEditForwardOnly(device.forwardOnly || false)
        setShowEditModal(true)

        // Fetch groups if device is connected
        if (device.status === 'connected') {
            fetchDeviceGroups(device.id)
        } else {
            setDeviceGroups([])
        }
    }

    const handleCloseEditModal = () => {
        setShowEditModal(false)
        setEditDevice(null)
        setEditPanelIds([])
        setEditReplyScope('all')
        setEditForwardOnly(false)
        setDeviceGroups([])
        setSelectedGroupJids([])
    }

    // Fetch live groups from WhatsApp device
    const fetchDeviceGroups = async (deviceId) => {
        setGroupsLoading(true)
        try {
            const res = await api.get(`/devices/${deviceId}/groups`)
            setDeviceGroups(res.data || [])
        } catch (error) {
            console.error('Failed to fetch groups:', error)
            setDeviceGroups([])
        } finally {
            setGroupsLoading(false)
        }
    }

    // Toggle group block
    const handleToggleGroupBlock = async (group) => {
        if (!editDevice) return
        try {
            if (group.isBlocked) {
                // Unblock: use mass-action with single JID
                await api.post(`/devices/${editDevice.id}/group-blocks/mass-action`, {
                    action: 'unblock',
                    groupJids: [group.groupJid]
                })
            } else {
                // Block
                await api.post(`/devices/${editDevice.id}/group-blocks`, {
                    groupJid: group.groupJid,
                    groupName: group.groupName
                })
            }
            // Refresh groups
            fetchDeviceGroups(editDevice.id)
        } catch (error) {
            console.error('Failed to toggle group block:', error)
        }
    }

    // Mass action on selected groups
    const handleMassGroupAction = async (action) => {
        if (!editDevice || selectedGroupJids.length === 0) return
        setGroupActionLoading(true)
        try {
            if (action === 'block') {
                const groups = selectedGroupJids.map(jid => {
                    const g = deviceGroups.find(dg => dg.groupJid === jid)
                    return { groupJid: jid, groupName: g?.groupName || null }
                })
                await api.post(`/devices/${editDevice.id}/group-blocks`, { groups })
            } else {
                await api.post(`/devices/${editDevice.id}/group-blocks/mass-action`, {
                    action: 'unblock',
                    groupJids: selectedGroupJids
                })
            }
            setSelectedGroupJids([])
            fetchDeviceGroups(editDevice.id)
        } catch (error) {
            console.error('Failed mass group action:', error)
        } finally {
            setGroupActionLoading(false)
        }
    }

    // Toggle group selection for mass action
    const handleToggleGroupSelection = (groupJid) => {
        setSelectedGroupJids(prev =>
            prev.includes(groupJid)
                ? prev.filter(j => j !== groupJid)
                : [...prev, groupJid]
        )
    }

    const handleSelectAllGroups = () => {
        if (selectedGroupJids.length === deviceGroups.length) {
            setSelectedGroupJids([])
        } else {
            setSelectedGroupJids(deviceGroups.map(g => g.groupJid))
        }
    }

    const handleTogglePanelId = (panelId) => {
        setEditPanelIds(prev =>
            prev.includes(panelId)
                ? prev.filter(id => id !== panelId)
                : [...prev, panelId]
        )
    }

    const handleUpdatePanel = async () => {
        if (!editDevice) return

        // Derive current bound panel IDs
        const currentIds = (editDevice.panels || []).map(p => p.id)
        const hasChanged = editPanelIds.length !== currentIds.length ||
            editPanelIds.some(id => !currentIds.includes(id))

        if (currentIds.length > 0 && hasChanged) {
            const currentNames = currentIds.map(id => panels.find(p => p.id === id)?.alias || panels.find(p => p.id === id)?.name || id).join(', ')
            const newNames = editPanelIds.length > 0
                ? editPanelIds.map(id => panels.find(p => p.id === id)?.alias || panels.find(p => p.id === id)?.name || id).join(', ')
                : 'None (Search All)'
            const confirmed = confirm(
                `⚠️ Changing panels will affect order lookups.\n\n` +
                `Current: ${currentNames}\n` +
                `New: ${newNames}\n\n` +
                `Commands sent to this device will search orders in the selected panels.\n\nContinue?`
            )
            if (!confirmed) return
        }

        setEditLoading(true)
        try {
            await api.put(`/devices/${editDevice.id}`, {
                panelId: editPanelIds.length === 1 ? editPanelIds[0] : null,
                panelIds: editPanelIds,
                replyScope: editReplyScope,
                forwardOnly: editForwardOnly
            })
            fetchDevices()
            handleCloseEditModal()
        } catch (error) {
            console.error('Failed to update device:', error)
            alert('Failed to update device panels')
        } finally {
            setEditLoading(false)
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
                                ? device.isActive !== false
                                    ? '1px solid rgba(37, 211, 102, 0.3)'
                                    : '1px solid rgba(251, 191, 36, 0.3)'
                                : '1px solid var(--border-color)',
                            opacity: device.isActive === false ? 0.7 : 1,
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
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {device.phone ? (() => {
                                            const { flag, formattedPhone } = getPhoneFlag(device.phone)
                                            return <>
                                                {flag && <span style={{ fontSize: '1rem' }}>{flag}</span>}
                                                <span>{formattedPhone}</span>
                                            </>
                                        })() : 'Not connected'}
                                    </div>
                                    {/* Reply Scope Badge */}
                                    {device.replyScope && device.replyScope !== 'all' && (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.65rem',
                                            fontWeight: 500,
                                            marginTop: '3px',
                                            background: device.replyScope === 'disabled'
                                                ? 'rgba(239, 68, 68, 0.1)'
                                                : device.replyScope === 'groups_only'
                                                    ? 'rgba(168, 85, 247, 0.1)'
                                                    : 'rgba(59, 130, 246, 0.1)',
                                            color: device.replyScope === 'disabled'
                                                ? '#ef4444'
                                                : device.replyScope === 'groups_only'
                                                    ? '#a855f7'
                                                    : '#3b82f6'
                                        }}>
                                            {device.replyScope === 'disabled' && '🔇 Replies Disabled'}
                                            {device.replyScope === 'groups_only' && '👥 Groups Only'}
                                            {device.replyScope === 'private_only' && '💬 DM Only'}
                                        </div>
                                    )}
                                    {/* Forward-Only Badge */}
                                    {device.forwardOnly && (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.65rem',
                                            fontWeight: 500,
                                            marginTop: '3px',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            color: '#f59e0b'
                                        }}>
                                            🔀 Forward Only
                                        </div>
                                    )}
                                    {/* Panel Badges (multi-panel support) */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                        {(device.panels && device.panels.length > 0) ? (
                                            device.panels.map(p => (
                                                <div key={p.id} style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.7rem',
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    color: '#3b82f6'
                                                }}>
                                                    <Link2 size={10} />
                                                    {p.alias || p.name}
                                                </div>
                                            ))
                                        ) : device.panel ? (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.7rem',
                                                background: 'rgba(59, 130, 246, 0.1)',
                                                color: '#3b82f6'
                                            }}>
                                                <Link2 size={10} />
                                                {device.panel.alias || device.panel.name}
                                            </div>
                                        ) : (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.7rem',
                                                background: 'rgba(156, 163, 175, 0.1)',
                                                color: '#9ca3af'
                                            }}>
                                                All Panels
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* ON/OFF Toggle */}
                                {device.status === 'connected' && (
                                    <button
                                        onClick={() => handleToggleDevice(device.id)}
                                        disabled={togglingDevice === device.id}
                                        title={device.isActive !== false ? 'Turn Bot OFF' : 'Turn Bot ON'}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            cursor: togglingDevice === device.id ? 'not-allowed' : 'pointer',
                                            opacity: togglingDevice === device.id ? 0.5 : 1,
                                            background: device.isActive !== false
                                                ? 'rgba(37, 211, 102, 0.15)'
                                                : 'rgba(239, 68, 68, 0.1)',
                                            color: device.isActive !== false ? '#25D366' : '#ef4444',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        {togglingDevice === device.id ? <Loader2 className="animate-spin" size={14} /> : <Power size={14} />}
                                    </button>
                                )}
                                {/* Status Badge */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '20px',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    background: device.status === 'connected'
                                        ? device.isActive !== false
                                            ? 'rgba(37, 211, 102, 0.15)'
                                            : 'rgba(251, 191, 36, 0.15)'
                                        : 'rgba(239, 68, 68, 0.1)',
                                    color: device.status === 'connected'
                                        ? device.isActive !== false ? '#25D366' : '#f59e0b'
                                        : '#ef4444'
                                }}>
                                    <span style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: device.status === 'connected'
                                            ? device.isActive !== false ? '#25D366' : '#f59e0b'
                                            : '#ef4444'
                                    }}></span>
                                    {device.status === 'connected'
                                        ? device.isActive !== false ? 'Online' : 'Bot OFF'
                                        : 'Offline'}
                                </div>
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
                                        onClick={() => handleOpenEditModal(device)}
                                        title="Edit Panel Binding"
                                    >
                                        <Settings size={14} />
                                        Edit
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '8px' }}
                                        onClick={() => handleRestartDevice(device.id)}
                                        disabled={restartingDevice === device.id}
                                        title="Restart Device"
                                    >
                                        {restartingDevice === device.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '8px' }}
                                        onClick={() => handleDeleteDevice(device.id)}
                                        disabled={deletingDevice === device.id}
                                    >
                                        {deletingDevice === device.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
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
                                        className="btn btn-secondary btn-sm"
                                        style={{ padding: '8px' }}
                                        onClick={() => handleOpenEditModal(device)}
                                        title="Edit Panel Binding"
                                    >
                                        <Settings size={14} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '8px' }}
                                        onClick={() => handleDeleteDevice(device.id)}
                                        disabled={deletingDevice === device.id}
                                    >
                                        {deletingDevice === device.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
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
                        {/* Step 1: Enter device name and select panel (only if new device) */}
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

                                {/* Panel Selection */}
                                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <label className="form-label">
                                        <Link2 size={14} style={{ marginRight: '6px', display: 'inline' }} />
                                        Assign to Panel (Optional)
                                    </label>
                                    <select
                                        className="form-select"
                                        value={selectedPanelId}
                                        onChange={(e) => setSelectedPanelId(e.target.value)}
                                    >
                                        <option value="">All Panels (No specific binding)</option>
                                        {panels.map(panel => (
                                            <option key={panel.id} value={panel.id}>
                                                {panel.alias || panel.name} - {panel.url}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="form-hint" style={{ marginTop: '4px' }}>
                                        {selectedPanelId
                                            ? '✅ This device will only handle orders from the selected panel'
                                            : '⚠️ This device will handle orders from ALL your panels'}
                                    </p>
                                </div>

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

            {/* Edit Panel Modal */}
            <div className={`modal-overlay ${showEditModal ? 'open' : ''}`} onClick={handleCloseEditModal}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                    <div className="modal-header">
                        <h3 className="modal-title">Device Settings</h3>
                        <button className="btn btn-ghost btn-icon" onClick={handleCloseEditModal}>
                            <X size={20} />
                        </button>
                    </div>
                    <div className="modal-body">
                        {editDevice && (
                            <>
                                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                        Device: <strong style={{ color: 'var(--text-primary)' }}>{editDevice.name}</strong>
                                    </p>
                                    {editDevice.phone && (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                                            {editDevice.phone}
                                        </p>
                                    )}
                                </div>

                                {/* Reply Scope Control */}
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <MessageSquare size={14} />
                                        Reply Mode
                                    </label>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '8px'
                                    }}>
                                        {[
                                            { value: 'all', label: 'All Messages', icon: '📨', desc: 'Groups + DMs' },
                                            { value: 'groups_only', label: 'Groups Only', icon: '👥', desc: 'Ignore DMs' },
                                            { value: 'private_only', label: 'DM Only', icon: '💬', desc: 'Ignore groups' },
                                            { value: 'disabled', label: 'Disabled', icon: '🔇', desc: 'No replies' }
                                        ].map(opt => (
                                            <div
                                                key={opt.value}
                                                onClick={() => setEditReplyScope(opt.value)}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '10px',
                                                    border: editReplyScope === opt.value
                                                        ? '2px solid var(--primary-color)'
                                                        : '1px solid var(--border-color)',
                                                    background: editReplyScope === opt.value
                                                        ? 'rgba(99, 102, 241, 0.06)'
                                                        : 'var(--bg-secondary)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{opt.icon}</div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {opt.label}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {opt.desc}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                        Controls whether the bot replies to group messages, private messages, both, or neither.
                                    </p>
                                </div>

                                {/* Forward-Only Mode Toggle */}
                                <div className="form-group">
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '12px 14px',
                                            borderRadius: '10px',
                                            border: editForwardOnly
                                                ? '2px solid #f59e0b'
                                                : '1px solid var(--border-color)',
                                            background: editForwardOnly
                                                ? 'rgba(245, 158, 11, 0.06)'
                                                : 'var(--bg-secondary)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                🔀 Forward Without Reply
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                Commands are processed & forwarded, but no reply is sent in chat
                                            </div>
                                        </div>
                                        <div
                                            onClick={(e) => { e.preventDefault(); setEditForwardOnly(!editForwardOnly) }}
                                            style={{
                                                width: '40px',
                                                height: '22px',
                                                borderRadius: '11px',
                                                background: editForwardOnly ? '#f59e0b' : 'var(--border-color)',
                                                position: 'relative',
                                                transition: 'background 0.2s',
                                                cursor: 'pointer',
                                                flexShrink: 0
                                            }}
                                        >
                                            <div style={{
                                                width: '18px',
                                                height: '18px',
                                                borderRadius: '50%',
                                                background: '#fff',
                                                position: 'absolute',
                                                top: '2px',
                                                left: editForwardOnly ? '20px' : '2px',
                                                transition: 'left 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                            }} />
                                        </div>
                                    </label>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border-color)', margin: 'var(--spacing-sm) 0' }} />

                                <div className="form-group">
                                    <label className="form-label">Assigned Panels</label>
                                    <div style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        padding: '8px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        background: 'var(--bg-secondary)'
                                    }}>
                                        {panels.length === 0 ? (
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px', textAlign: 'center' }}>
                                                No panels available
                                            </p>
                                        ) : (
                                            panels.map(panel => (
                                                <label
                                                    key={panel.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        padding: '8px 10px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.15s',
                                                        background: editPanelIds.includes(panel.id)
                                                            ? 'rgba(59, 130, 246, 0.08)'
                                                            : 'transparent'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={editPanelIds.includes(panel.id)}
                                                        onChange={() => handleTogglePanelId(panel.id)}
                                                        style={{
                                                            width: '18px',
                                                            height: '18px',
                                                            accentColor: 'var(--primary-color)',
                                                            flexShrink: 0
                                                        }}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                                            {panel.alias || panel.name}
                                                        </div>
                                                        {panel.url && (
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {panel.url}
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                        {editPanelIds.length === 0
                                            ? '⚠️ No panel selected — device will search orders across ALL panels.'
                                            : `✅ ${editPanelIds.length} panel${editPanelIds.length > 1 ? 's' : ''} selected.`
                                        }
                                    </p>
                                </div>

                                {/* Group Reply Blocking */}
                                {editDevice?.status === 'connected' && (
                                    <>
                                        <div style={{ borderTop: '1px solid var(--border-color)', margin: 'var(--spacing-sm) 0' }} />

                                        <div className="form-group">
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Users size={14} />
                                                Group Reply Control
                                            </label>

                                            {groupsLoading ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '8px', color: 'var(--text-muted)' }}>
                                                    <Loader2 className="animate-spin" size={16} />
                                                    <span style={{ fontSize: '0.85rem' }}>Loading groups...</span>
                                                </div>
                                            ) : deviceGroups.length === 0 ? (
                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                                                    No groups found on this device.
                                                </p>
                                            ) : (
                                                <>
                                                    {/* Mass Action Bar */}
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        marginBottom: '8px',
                                                        gap: '8px'
                                                    }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedGroupJids.length === deviceGroups.length && deviceGroups.length > 0}
                                                                onChange={handleSelectAllGroups}
                                                                style={{ width: '14px', height: '14px', accentColor: 'var(--primary-color)' }}
                                                            />
                                                            Select All ({deviceGroups.length})
                                                        </label>
                                                        {selectedGroupJids.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    className="btn btn-sm"
                                                                    disabled={groupActionLoading}
                                                                    onClick={() => handleMassGroupAction('block')}
                                                                    style={{
                                                                        fontSize: '0.7rem',
                                                                        padding: '3px 10px',
                                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                                        color: '#ef4444',
                                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <ShieldOff size={10} /> Block ({selectedGroupJids.length})
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm"
                                                                    disabled={groupActionLoading}
                                                                    onClick={() => handleMassGroupAction('unblock')}
                                                                    style={{
                                                                        fontSize: '0.7rem',
                                                                        padding: '3px 10px',
                                                                        background: 'rgba(34, 197, 94, 0.1)',
                                                                        color: '#22c55e',
                                                                        border: '1px solid rgba(34, 197, 94, 0.2)',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    <ShieldCheck size={10} /> Allow ({selectedGroupJids.length})
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Group List */}
                                                    <div style={{
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '8px',
                                                        maxHeight: '240px',
                                                        overflowY: 'auto',
                                                        background: 'var(--bg-secondary)'
                                                    }}>
                                                        {deviceGroups.map(group => (
                                                            <div
                                                                key={group.groupJid}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    padding: '8px 10px',
                                                                    borderBottom: '1px solid var(--border-color)',
                                                                    background: group.isBlocked ? 'rgba(239, 68, 68, 0.03)' : 'transparent'
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedGroupJids.includes(group.groupJid)}
                                                                    onChange={() => handleToggleGroupSelection(group.groupJid)}
                                                                    style={{ width: '14px', height: '14px', accentColor: 'var(--primary-color)', flexShrink: 0 }}
                                                                />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {group.groupName}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                                        {group.participantCount} members
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => handleToggleGroupBlock(group)}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        padding: '3px 10px',
                                                                        borderRadius: '12px',
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: 500,
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.15s',
                                                                        background: group.isBlocked
                                                                            ? 'rgba(239, 68, 68, 0.12)'
                                                                            : 'rgba(34, 197, 94, 0.1)',
                                                                        color: group.isBlocked ? '#ef4444' : '#22c55e'
                                                                    }}
                                                                >
                                                                    {group.isBlocked ? <><ShieldOff size={10} /> Blocked</> : <><ShieldCheck size={10} /> Allowed</>}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                                        {deviceGroups.filter(g => g.isBlocked).length} of {deviceGroups.length} groups blocked. Blocked groups will not receive any bot replies.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={handleCloseEditModal}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleUpdatePanel}
                            disabled={editLoading}
                        >
                            {editLoading ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

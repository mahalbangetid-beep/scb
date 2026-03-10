import { useState, useEffect } from 'react'
import {
    Database,
    Download,
    RefreshCw,
    Trash2,
    Clock,
    Users,
    MessageSquare,
    Smartphone,
    CheckCircle,
    XCircle,
    Loader2,
    HardDrive,
    Calendar,
    Play,
    Pause,
    Eye,
    Shield,
    Globe,
    Zap,
    Copy,
    ClipboardCheck
} from 'lucide-react'
import api from '../../services/api'
import { formatDistanceToNow, format } from 'date-fns'

export default function ContactBackups() {
    // Get current user
    const userStr = localStorage.getItem('user')
    const currentUser = userStr ? JSON.parse(userStr) : {}
    const isMasterAdmin = currentUser.role === 'MASTER_ADMIN'

    const [devices, setDevices] = useState([])
    const [backups, setBackups] = useState({})
    const [stats, setStats] = useState(null)
    const [masterStats, setMasterStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [selectedDevice, setSelectedDevice] = useState(null)
    const [backupLoading, setBackupLoading] = useState({})
    const [viewBackup, setViewBackup] = useState(null)
    const [viewLoading, setViewLoading] = useState(false)
    const [activeTab, setActiveTab] = useState('all-contacts') // 'all-contacts' | 'my-devices' | 'all-users'
    const [allBackups, setAllBackups] = useState([])
    const [backupAllLoading, setBackupAllLoading] = useState(false)
    const [exportLoading, setExportLoading] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const [allContacts, setAllContacts] = useState(null)
    const [allContactsLoading, setAllContactsLoading] = useState(false)
    const [contactSearch, setContactSearch] = useState('')

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data || [])
        } catch (error) {
            console.error('Failed to fetch devices:', error)
        }
    }

    const fetchStats = async () => {
        try {
            const res = await api.get('/contact-backup/stats')
            setStats(res.data)
        } catch (error) {
            console.error('Failed to fetch stats:', error)
        }
    }

    const fetchMasterStats = async () => {
        if (!isMasterAdmin) return
        try {
            const res = await api.get('/contact-backup/admin/stats')
            setMasterStats(res.data)
        } catch (error) {
            console.error('Failed to fetch master stats:', error)
        }
    }

    const fetchAllBackups = async () => {
        if (!isMasterAdmin) return
        try {
            const res = await api.get('/contact-backup/admin/all?limit=50')
            setAllBackups(res.data || [])
        } catch (error) {
            console.error('Failed to fetch all backups:', error)
        }
    }

    const fetchBackupsForDevice = async (deviceId) => {
        try {
            const res = await api.get(`/contact-backup/device/${deviceId}?limit=10`)
            setBackups(prev => ({
                ...prev,
                [deviceId]: res.data.backups || []
            }))
        } catch (error) {
            console.error('Failed to fetch backups:', error)
        }
    }

    const fetchAllContacts = async () => {
        setAllContactsLoading(true)
        try {
            const res = await api.get('/contact-backup/all-contacts')
            setAllContacts(res.data || res)
        } catch (error) {
            console.error('Failed to fetch all contacts:', error)
        } finally {
            setAllContactsLoading(false)
        }
    }

    useEffect(() => {
        const init = async () => {
            setLoading(true)
            await Promise.all([fetchDevices(), fetchStats(), fetchAllContacts()])
            if (isMasterAdmin) {
                await Promise.all([fetchMasterStats(), fetchAllBackups()])
            }
            setLoading(false)
        }
        init()
    }, [])

    useEffect(() => {
        if (selectedDevice) {
            fetchBackupsForDevice(selectedDevice)
        }
    }, [selectedDevice])

    const handleManualBackup = async (deviceId) => {
        setBackupLoading(prev => ({ ...prev, [deviceId]: true }))
        try {
            await api.post(`/contact-backup/device/${deviceId}`)
            await fetchBackupsForDevice(deviceId)
            await fetchStats()
            if (isMasterAdmin) await fetchMasterStats()
        } catch (error) {
            console.error('Backup failed:', error)
            alert(error?.error?.message || 'Backup failed')
        } finally {
            setBackupLoading(prev => ({ ...prev, [deviceId]: false }))
        }
    }

    const handleBackupAll = async () => {
        if (!confirm('This will backup ALL connected devices from ALL users. Continue?')) return
        setBackupAllLoading(true)
        try {
            const res = await api.post('/contact-backup/admin/backup-all')
            const result = res.data || res
            alert(`Backup completed!\n\n${result.successful || 0} of ${result.totalDevices || 0} devices backed up successfully.`)
            await Promise.all([fetchMasterStats(), fetchAllBackups()])
        } catch (error) {
            console.error('Backup all failed:', error)
            alert(error?.error?.message || 'Backup all failed')
        } finally {
            setBackupAllLoading(false)
        }
    }

    const handleBackupAllMyDevices = async () => {
        const connected = connectedDevices.length
        if (connected === 0) {
            alert('No connected devices found. Please connect a device first.')
            return
        }
        if (!confirm(`Backup all ${connected} connected device(s)?`)) return
        setBackupAllLoading(true)
        try {
            const res = await api.post('/contact-backup/backup-all-my-devices')
            const data = res.data?.data || res.data || {}
            const msg = [`Backup completed!`, ``]
            if (data.successful > 0) msg.push(`✅ ${data.successful} backed up`)
            if (data.skipped > 0) msg.push(`⏭ ${data.skipped} skipped (already backed up within 1 hour)`)
            if (data.failed > 0) msg.push(`❌ ${data.failed} failed`)
            alert(msg.join('\n'))
            await Promise.all([fetchDevices(), fetchStats()])
        } catch (error) {
            console.error('Backup all my devices failed:', error)
            alert(error?.response?.data?.error?.message || error?.message || 'Backup failed')
        } finally {
            setBackupAllLoading(false)
        }
    }

    const handleExportAll = async () => {
        setExportLoading(true)
        try {
            const res = await api.get('/contact-backup/admin/export')
            const exportData = res.data || res
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `master_backup_${new Date().toISOString().split('T')[0]}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Export failed:', error)
            alert('Failed to export backups')
        } finally {
            setExportLoading(false)
        }
    }

    const handleDownloadBackup = async (backupId) => {
        try {
            const endpoint = isMasterAdmin && activeTab === 'all-users'
                ? `/contact-backup/admin/backup/${backupId}`
                : `/contact-backup/${backupId}/download`
            const res = await api.get(endpoint)
            const data = res.data || res
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `backup_${backupId}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Download failed:', error)
            alert('Failed to download backup')
        }
    }

    // CSV export for individual backup (Bug 5.5)
    const handleDownloadBackupCsv = async (backupId) => {
        try {
            const endpoint = isMasterAdmin && activeTab === 'all-users'
                ? `/contact-backup/admin/backup/${backupId}`
                : `/contact-backup/${backupId}/download`
            const res = await api.get(endpoint)
            const data = res.data || res
            const contacts = data.contacts || data.data?.contacts || []
            const csvRows = ['Phone,Name,Type']
            for (const c of contacts) {
                const phone = (c.phone || c.jid || '').replace(/"/g, '""')
                const name = (c.name || c.pushName || '').replace(/"/g, '""')
                const type = c.isGroup ? 'Group' : 'Contact'
                csvRows.push(`"${phone}","${name}","${type}"`)
            }
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `backup_${backupId}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('CSV download failed:', error)
            alert('Failed to download CSV')
        }
    }

    const handleViewBackup = async (backupId, isAdmin = false) => {
        setViewLoading(true)
        try {
            const endpoint = isAdmin
                ? `/contact-backup/admin/backup/${backupId}`
                : `/contact-backup/${backupId}`
            const res = await api.get(endpoint)
            setViewBackup(res.data || res)
        } catch (error) {
            console.error('Failed to load backup:', error)
            alert('Failed to load backup details')
        } finally {
            setViewLoading(false)
        }
    }

    const handleDeleteBackup = async (backupId, deviceId, isAdmin = false) => {
        if (!confirm('Are you sure you want to delete this backup?')) return
        try {
            const endpoint = isAdmin
                ? `/contact-backup/admin/backup/${backupId}`
                : `/contact-backup/${backupId}`
            await api.delete(endpoint)
            if (deviceId) {
                await fetchBackupsForDevice(deviceId)
            }
            await fetchStats()
            if (isMasterAdmin) {
                await Promise.all([fetchMasterStats(), fetchAllBackups()])
            }
        } catch (error) {
            console.error('Delete failed:', error)
            alert('Failed to delete backup')
        }
    }

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const connectedDevices = devices.filter(d => d.status === 'connected')

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
                    <h1 className="page-title">Contact Backups</h1>
                    <p className="page-subtitle">
                        {isMasterAdmin ? 'Master Admin: Backup ALL users\' WhatsApp contacts' : 'Automatic backup of WhatsApp contacts and groups'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    {isMasterAdmin && (
                        <>
                            <button
                                className="btn btn-secondary"
                                onClick={handleExportAll}
                                disabled={exportLoading}
                            >
                                {exportLoading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                                Export All
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleBackupAll}
                                disabled={backupAllLoading}
                            >
                                {backupAllLoading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                                Backup All Users
                            </button>
                        </>
                    )}
                    {!isMasterAdmin && (
                        <button
                            className="btn btn-primary"
                            onClick={handleBackupAllMyDevices}
                            disabled={backupAllLoading || connectedDevices.length === 0}
                        >
                            {backupAllLoading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                            Backup All Devices ({connectedDevices.length})
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ maxWidth: isMasterAdmin ? '550px' : '400px', marginBottom: 'var(--spacing-xl)' }}>
                <button
                    className={`tab ${activeTab === 'all-contacts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('all-contacts')}
                >
                    <Users size={16} />
                    All Contacts
                </button>
                <button
                    className={`tab ${activeTab === 'my-devices' ? 'active' : ''}`}
                    onClick={() => setActiveTab('my-devices')}
                >
                    <Smartphone size={16} />
                    My Devices
                </button>
                {isMasterAdmin && (
                    <button
                        className={`tab ${activeTab === 'all-users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all-users')}
                    >
                        <Globe size={16} />
                        All Users
                    </button>
                )}
            </div>

            {/* All Contacts Section (deduplicated, single page) */}
            {activeTab === 'all-contacts' && (
                <div className="card">
                    <div style={{ padding: 'var(--spacing-lg)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                All Contacts (Deduplicated)
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {allContacts ? `${allContacts.uniqueContacts || 0} unique contacts from ${allContacts.totalDevices || 0} device(s)` : 'Loading...'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={fetchAllContacts}
                                disabled={allContactsLoading}
                            >
                                {allContactsLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                                Refresh
                            </button>
                            {allContacts?.contacts?.length > 0 && (
                                <button
                                    className="btn btn-sm"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        background: copySuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                                        color: copySuccess ? '#22c55e' : 'var(--primary-500)',
                                        border: 'none', padding: '6px 12px', borderRadius: '8px',
                                        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
                                    }}
                                    onClick={() => {
                                        const filtered = (allContacts.contacts || []).filter(c => {
                                            if (!contactSearch) return true
                                            const q = contactSearch.toLowerCase()
                                            return (c.phone || '').includes(q) || (c.name || '').toLowerCase().includes(q)
                                        })
                                        const numbers = filtered.map(c => c.phone).filter(Boolean).join('\n')
                                        navigator.clipboard.writeText(numbers).then(() => {
                                            setCopySuccess(true)
                                            setTimeout(() => setCopySuccess(false), 2000)
                                        })
                                    }}
                                >
                                    {copySuccess ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                                    {copySuccess ? 'Copied!' : `Copy All Numbers`}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Search */}
                    <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', borderBottom: '1px solid var(--border-color)' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by phone number or name..."
                            value={contactSearch}
                            onChange={(e) => setContactSearch(e.target.value)}
                            style={{ width: '100%', maxWidth: '400px' }}
                        />
                    </div>

                    {allContactsLoading ? (
                        <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                            <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--primary-500)' }} />
                            <p style={{ color: 'var(--text-muted)', marginTop: 'var(--spacing-sm)' }}>Loading contacts from all devices...</p>
                        </div>
                    ) : !allContacts || (allContacts.contacts || []).length === 0 ? (
                        <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Users size={48} style={{ margin: '0 auto var(--spacing-md)', opacity: 0.3 }} />
                            <p>No contacts found</p>
                            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Connect a device and trigger a backup first</p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '50px' }}>#</th>
                                        <th>Phone Number</th>
                                        <th>Name</th>
                                        <th>Device</th>
                                        <th style={{ width: '60px' }}>Copy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(allContacts.contacts || []).filter(c => {
                                        if (!contactSearch) return true
                                        const q = contactSearch.toLowerCase()
                                        return (c.phone || '').includes(q) || (c.name || '').toLowerCase().includes(q)
                                    }).map((contact, i) => (
                                        <tr key={contact.phone || i}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{contact.phone}</td>
                                            <td>{contact.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{contact.device || '—'}</td>
                                            <td>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(contact.phone)
                                                        setCopySuccess(true)
                                                        setTimeout(() => setCopySuccess(false), 1000)
                                                    }}
                                                    title="Copy number"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Master Admin Stats */}
            {isMasterAdmin && activeTab === 'all-users' && masterStats && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--spacing-lg)',
                    marginBottom: 'var(--spacing-xl)'
                }}>
                    <div className="card" style={{ padding: 'var(--spacing-lg)', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(168, 85, 247, 0.05))', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <Shield size={32} style={{ color: '#a855f7' }} />
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {masterStats.totalBackups || 0}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Backups</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <Smartphone size={32} style={{ color: '#3b82f6' }} />
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {masterStats.totalConnectedDevices || 0}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Connected Devices</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <Users size={32} style={{ color: '#22c55e' }} />
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {masterStats.totalContactsBackedUp || 0}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Contacts</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <MessageSquare size={32} style={{ color: '#f97316' }} />
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {masterStats.totalGroupsBackedUp || 0}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Groups</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* All Users Backups Table (Master Admin) */}
            {isMasterAdmin && activeTab === 'all-users' && (
                <div className="card">
                    <div style={{ padding: 'var(--spacing-lg)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                All User Backups
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Backups from all users across the system
                            </p>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={fetchAllBackups}>
                            <RefreshCw size={14} />
                            Refresh
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>User</th>
                                    <th>Device</th>
                                    <th>Type</th>
                                    <th>Contacts</th>
                                    <th>Groups</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allBackups.map(backup => (
                                    <tr key={backup.id}>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                {format(new Date(backup.createdAt), 'MMM dd, HH:mm')}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{backup.user?.username || 'Unknown'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{backup.user?.email}</div>
                                        </td>
                                        <td>{backup.device?.name || 'Unknown'}</td>
                                        <td>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '10px',
                                                fontSize: '0.7rem',
                                                fontWeight: 500,
                                                background: backup.backupType === 'MASTER_BACKUP'
                                                    ? 'rgba(168, 85, 247, 0.15)'
                                                    : backup.backupType === 'AUTO'
                                                        ? 'rgba(59, 130, 246, 0.1)'
                                                        : 'rgba(34, 197, 94, 0.1)',
                                                color: backup.backupType === 'MASTER_BACKUP'
                                                    ? '#a855f7'
                                                    : backup.backupType === 'AUTO' ? '#3b82f6' : '#22c55e'
                                            }}>
                                                {backup.backupType}
                                            </span>
                                        </td>
                                        <td>{backup.totalContacts || 0}</td>
                                        <td>{backup.totalGroups || 0}</td>
                                        <td>
                                            {backup.status === 'COMPLETED' ? (
                                                <CheckCircle size={16} style={{ color: '#22c55e' }} />
                                            ) : (
                                                <XCircle size={16} style={{ color: '#ef4444' }} />
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleViewBackup(backup.id, true)}
                                                    title="View"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleDownloadBackup(backup.id)}
                                                    title="Download JSON"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleDownloadBackupCsv(backup.id)}
                                                    title="Download CSV"
                                                    style={{ fontSize: '0.6rem', fontWeight: 600 }}
                                                >
                                                    CSV
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleDeleteBackup(backup.id, null, true)}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* My Devices Section (Original) */}
            {activeTab === 'my-devices' && (
                <>
                    {/* Stats Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 'var(--spacing-lg)',
                        marginBottom: 'var(--spacing-xl)'
                    }}>
                        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Database size={24} style={{ color: '#22c55e' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats?.totalBackups || 0}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>My Backups</div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Smartphone size={24} style={{ color: '#3b82f6' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats?.devicesWithBackups || 0}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Devices Backed Up</div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(168, 85, 247, 0.1))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Clock size={24} style={{ color: '#a855f7' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        Every 10 min
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Auto-Backup</div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(249, 115, 22, 0.1))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <HardDrive size={24} style={{ color: '#f97316' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        Last 10
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Per Device</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Device List */}
                    <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <div style={{ padding: 'var(--spacing-lg)', borderBottom: '1px solid var(--border-color)' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Connected Devices
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Select a device to view its backup history
                            </p>
                        </div>

                        {connectedDevices.length === 0 ? (
                            <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Smartphone size={48} style={{ margin: '0 auto var(--spacing-md)', opacity: 0.3 }} />
                                <p>No connected devices</p>
                                <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                                    Connect a WhatsApp device to enable contact backups
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-md)', padding: 'var(--spacing-lg)' }}>
                                {connectedDevices.map(device => (
                                    <div
                                        key={device.id}
                                        onClick={() => setSelectedDevice(device.id)}
                                        style={{
                                            padding: 'var(--spacing-md)',
                                            borderRadius: 'var(--radius-md)',
                                            border: selectedDevice === device.id
                                                ? '2px solid var(--primary-500)'
                                                : '1px solid var(--border-color)',
                                            background: selectedDevice === device.id
                                                ? 'rgba(37, 211, 102, 0.05)'
                                                : 'var(--bg-tertiary)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                                                <Smartphone size={20} style={{ color: '#25D366' }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {device.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {device.phone || 'Connected'}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleManualBackup(device.id)
                                                }}
                                                disabled={backupLoading[device.id]}
                                            >
                                                {backupLoading[device.id] ? (
                                                    <Loader2 className="animate-spin" size={14} />
                                                ) : (
                                                    <RefreshCw size={14} />
                                                )}
                                                Backup
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Backup History for Selected Device */}
                    {selectedDevice && (
                        <div className="card">
                            <div style={{ padding: 'var(--spacing-lg)', borderBottom: '1px solid var(--border-color)' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Backup History
                                </h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {devices.find(d => d.id === selectedDevice)?.name || 'Device'}
                                </p>
                            </div>

                            {!backups[selectedDevice] ? (
                                <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                                    <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', color: 'var(--primary-500)' }} />
                                </div>
                            ) : backups[selectedDevice].length === 0 ? (
                                <div style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Database size={48} style={{ margin: '0 auto var(--spacing-md)', opacity: 0.3 }} />
                                    <p>No backups yet</p>
                                    <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                                        Backups are created automatically every 10 minutes
                                    </p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Type</th>
                                                <th>Contacts</th>
                                                <th>Groups</th>
                                                <th>Size</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {backups[selectedDevice].map(backup => (
                                                <tr key={backup.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                                                            <div>
                                                                <div style={{ fontWeight: 500 }}>
                                                                    {format(new Date(backup.createdAt), 'MMM dd, yyyy')}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                    {format(new Date(backup.createdAt), 'HH:mm:ss')}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 500,
                                                            background: backup.backupType === 'AUTO'
                                                                ? 'rgba(59, 130, 246, 0.1)'
                                                                : 'rgba(168, 85, 247, 0.1)',
                                                            color: backup.backupType === 'AUTO' ? '#3b82f6' : '#a855f7'
                                                        }}>
                                                            {backup.backupType}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Users size={14} style={{ color: 'var(--text-muted)' }} />
                                                            {backup.totalContacts}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />
                                                            {backup.totalGroups}
                                                        </div>
                                                    </td>
                                                    <td>{formatBytes(backup.fileSize)}</td>
                                                    <td>
                                                        {backup.status === 'COMPLETED' ? (
                                                            <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <CheckCircle size={14} /> OK
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <XCircle size={14} /> Failed
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => handleViewBackup(backup.id)}
                                                                title="View Details"
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => handleDownloadBackup(backup.id)}
                                                                title="Download JSON"
                                                            >
                                                                <Download size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => handleDownloadBackupCsv(backup.id)}
                                                                title="Download CSV"
                                                                style={{ fontSize: '0.6rem', fontWeight: 600 }}
                                                            >
                                                                CSV
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => handleDeleteBackup(backup.id, selectedDevice)}
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* View Backup Modal */}
            {viewBackup && (
                <div className="modal-overlay open" onClick={() => setViewBackup(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Backup Details</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setViewBackup(null)}>
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Owner info for admin view */}
                            {viewBackup.user && (
                                <div style={{ marginBottom: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'rgba(168, 85, 247, 0.1)', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Owner</div>
                                    <div style={{ fontWeight: 600 }}>{viewBackup.user.username} ({viewBackup.user.email})</div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                                <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Contacts</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-500)' }}>
                                        {viewBackup.totalContacts}
                                    </div>
                                </div>
                                <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Groups</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>
                                        {viewBackup.totalGroups}
                                    </div>
                                </div>
                            </div>

                            {/* Contacts Preview */}
                            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                        All Contacts ({(viewBackup.contacts || []).length})
                                    </h4>
                                    {(viewBackup.contacts || []).length > 0 && (
                                        <button
                                            className="btn btn-sm"
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                background: copySuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                                                color: copySuccess ? '#22c55e' : 'var(--primary-500)',
                                                border: 'none', padding: '6px 12px', borderRadius: '8px',
                                                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600
                                            }}
                                            onClick={() => {
                                                const numbers = (viewBackup.contacts || [])
                                                    .map(c => c.phone || c.jid || '')
                                                    .filter(n => n && !n.includes('@g.us'))
                                                    .join('\n')
                                                navigator.clipboard.writeText(numbers).then(() => {
                                                    setCopySuccess(true)
                                                    setTimeout(() => setCopySuccess(false), 2000)
                                                })
                                            }}
                                        >
                                            {copySuccess ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                                            {copySuccess ? 'Copied!' : `Copy All Numbers (${(viewBackup.contacts || []).filter(c => !(c.phone || c.jid || '').includes('@g.us')).length})`}
                                        </button>
                                    )}
                                </div>
                                <div style={{
                                    maxHeight: '400px',
                                    overflow: 'auto',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--spacing-sm)'
                                }}>
                                    {(viewBackup.contacts || []).map((c, i) => (
                                        <div key={i} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: '8px',
                                            borderBottom: '1px solid var(--border-color)'
                                        }}>
                                            <span>{c.name || c.pushName || 'Unknown'}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {c.phone || c.jid}
                                            </span>
                                        </div>
                                    ))}
                                    {(viewBackup.contacts || []).length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--text-muted)' }}>
                                            No contacts
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Groups Preview */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>
                                    Groups Preview (first 10)
                                </h4>
                                <div style={{
                                    maxHeight: '150px',
                                    overflow: 'auto',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--spacing-sm)'
                                }}>
                                    {(viewBackup.groups || []).slice(0, 10).map((g, i) => (
                                        <div key={i} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: '8px',
                                            borderBottom: '1px solid var(--border-color)'
                                        }}>
                                            <span>{g.name || g.subject || 'Unnamed Group'}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {g.participantCount || 0} members
                                            </span>
                                        </div>
                                    ))}
                                    {(viewBackup.groups || []).length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--text-muted)' }}>
                                            No groups
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setViewBackup(null)}>
                                Close
                            </button>
                            <button className="btn btn-primary" onClick={() => handleDownloadBackup(viewBackup.id)}>
                                <Download size={16} />
                                Download JSON
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleDownloadBackupCsv(viewBackup.id)}>
                                Download CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

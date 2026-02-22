import { useState, useEffect } from 'react'
import {
    Database, Shield, Globe, Key, RefreshCw, Loader2, Eye, EyeOff,
    Search, Download, RotateCcw, Trash2, Clock, Users, AlertTriangle,
    CheckCircle, Copy, ChevronDown, ChevronRight
} from 'lucide-react'
import api from '../../services/api'

export default function MasterBackups() {
    const [backups, setBackups] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [searchDomain, setSearchDomain] = useState('')
    const [expandedId, setExpandedId] = useState(null)
    const [showApiKey, setShowApiKey] = useState({})
    const [restoring, setRestoring] = useState(null)
    const [filterDeleted, setFilterDeleted] = useState('all') // all, active, deleted

    useEffect(() => { fetchData() }, [])
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t) } }, [success])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [backupsRes, statsRes] = await Promise.all([
                api.get('/admin/master-backup?includeDeleted=true&limit=100'),
                api.get('/admin/master-backup/stats')
            ])
            setBackups(backupsRes.data.data?.backups || backupsRes.data.data || [])
            setStats(statsRes.data.data || null)
        } catch (e) { setError(e.response?.data?.message || 'Failed to load backups') }
        setLoading(false)
    }

    const handleSearch = async () => {
        if (!searchDomain.trim()) return fetchData()
        setLoading(true)
        try {
            const res = await api.get(`/admin/master-backup/search?domain=${encodeURIComponent(searchDomain)}`)
            setBackups(res.data.data || [])
        } catch (e) { setError(e.response?.data?.message || 'Search failed') }
        setLoading(false)
    }

    const handleRestore = async (backupId) => {
        if (!confirm('Restore this panel from backup? This will re-create the panel.')) return
        setRestoring(backupId)
        try {
            await api.post(`/admin/master-backup/${backupId}/restore`)
            setSuccess('Panel restored successfully!')
            fetchData()
        } catch (e) { setError(e.response?.data?.message || 'Restore failed') }
        setRestoring(null)
    }

    const handleExport = async () => {
        try {
            const res = await api.get('/admin/master-backup/export', { responseType: 'blob' })
            const url = URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            a.href = url
            a.download = `master-backup-${Date.now()}.json`
            a.click()
            URL.revokeObjectURL(url)
            setSuccess('Export downloaded!')
        } catch (e) { setError('Export failed') }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => setSuccess('Copied!')).catch(() => { })
    }

    const filteredBackups = backups.filter(b => {
        if (filterDeleted === 'active') return !b.deletedByUser
        if (filterDeleted === 'deleted') return b.deletedByUser
        return true
    })

    if (loading && backups.length === 0) {
        return (
            <div className="page-container">
                <div style={{ textAlign: 'center', padding: '60px' }}>
                    <Loader2 size={32} className="animate-spin" />
                    <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>Loading master backups...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <Shield size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                        Provider Panel Backups
                    </h1>
                    <p className="page-subtitle">Master Admin — All panel configurations are backed up here, even after deletion</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary" onClick={handleExport}><Download size={16} /> Export All</button>
                    <button className="btn btn-secondary" onClick={fetchData}><RefreshCw size={16} /> Refresh</button>
                </div>
            </div>

            {success && <div className="alert alert-success"><CheckCircle size={16} /> {success}</div>}
            {error && <div className="alert alert-error"><AlertTriangle size={16} /> {error}</div>}

            {/* Stats */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <div className="stat-card">
                        <div className="stat-label"><Database size={14} /> Total Backups</div>
                        <div className="stat-value">{stats.total || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label"><CheckCircle size={14} /> Active</div>
                        <div className="stat-value" style={{ color: 'var(--color-success)' }}>{stats.active || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label"><Trash2 size={14} /> Deleted</div>
                        <div className="stat-value" style={{ color: 'var(--color-error)' }}>{stats.deleted || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label"><Users size={14} /> Users</div>
                        <div className="stat-value">{stats.uniqueUsers || 0}</div>
                    </div>
                </div>
            )}

            {/* Search & Filter */}
            <div className="card" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 250px', display: 'flex', gap: 8 }}>
                    <input className="form-input" placeholder="Search by domain..." value={searchDomain}
                        onChange={e => setSearchDomain(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                    <button className="btn btn-primary btn-sm" onClick={handleSearch}><Search size={14} /></button>
                </div>
                <select className="form-input" style={{ width: 'auto' }} value={filterDeleted} onChange={e => setFilterDeleted(e.target.value)}>
                    <option value="all">All Panels</option>
                    <option value="active">Active Only</option>
                    <option value="deleted">Deleted Only</option>
                </select>
            </div>

            {/* Backup List */}
            {filteredBackups.length === 0 ? (
                <div className="empty-state"><p>No backups found</p></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {filteredBackups.map(b => (
                        <div key={b.id} className="card" style={{ padding: 'var(--spacing-md)', opacity: b.deletedByUser ? 0.7 : 1, borderLeft: `4px solid ${b.deletedByUser ? 'var(--color-error)' : 'var(--color-success)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {expandedId === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Globe size={16} /> {b.panelName}
                                            {b.panelAlias && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>({b.panelAlias})</span>}
                                            {b.deletedByUser && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>DELETED</span>}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            <strong>Domain:</strong> {b.panelDomain} | <strong>User:</strong> {b.username} ({b.userEmail}) | <strong>Type:</strong> {b.panelType || 'GENERIC'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
                                    <div><Clock size={12} /> {new Date(b.createdAt).toLocaleString()}</div>
                                    <div style={{ marginTop: 4 }}>{b.backupType}</div>
                                </div>
                            </div>

                            {expandedId === b.id && (
                                <div style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)', fontSize: 13 }}>
                                        <div>
                                            <strong>Panel Domain:</strong>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <code style={{ background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 4, flex: 1 }}>{b.panelDomain}</code>
                                                <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(b.panelDomain)}><Copy size={12} /></button>
                                            </div>
                                        </div>
                                        <div>
                                            <strong>API Key:</strong>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <code style={{ background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 4, flex: 1 }}>
                                                    {showApiKey[b.id] ? (b.panelApiKey || '—') : '••••••••••••'}
                                                </code>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setShowApiKey({ ...showApiKey, [b.id]: !showApiKey[b.id] })}>
                                                    {showApiKey[b.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(b.panelApiKey || '')}><Copy size={12} /></button>
                                            </div>
                                        </div>
                                        {b.panelAdminApiKey && (
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <strong>Admin API Key:</strong>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                    <code style={{ background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 4, flex: 1 }}>
                                                        {showApiKey[`admin-${b.id}`] ? b.panelAdminApiKey : '••••••••••••'}
                                                    </code>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowApiKey({ ...showApiKey, [`admin-${b.id}`]: !showApiKey[`admin-${b.id}`] })}>
                                                        {showApiKey[`admin-${b.id}`] ? <EyeOff size={12} /> : <Eye size={12} />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Provider Aliases */}
                                    {b.providerAliases && (
                                        <div style={{ marginTop: 'var(--spacing-md)' }}>
                                            <strong>Provider Aliases ({Array.isArray(b.providerAliases) ? b.providerAliases.length : 0}):</strong>
                                            <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: 8, padding: 'var(--spacing-sm)' }}>
                                                {Array.isArray(b.providerAliases) && b.providerAliases.length > 0 ? (
                                                    b.providerAliases.map((p, i) => (
                                                        <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-color)', fontSize: 12 }}>
                                                            <strong>{p.providerName || p.name}</strong> {p.alias && `→ ${p.alias}`} {p.domain && `(${p.domain})`}
                                                        </div>
                                                    ))
                                                ) : <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No provider aliases</span>}
                                            </div>
                                        </div>
                                    )}

                                    {/* Provider Domains */}
                                    {b.providerDomains && Array.isArray(b.providerDomains) && b.providerDomains.length > 0 && (
                                        <div style={{ marginTop: 'var(--spacing-md)' }}>
                                            <strong>Provider Domains:</strong>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                                {b.providerDomains.map((d, i) => (
                                                    <span key={i} style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: '#6366f1', fontSize: 12 }}>{d}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid var(--border-color)' }}>
                                        {b.deletedByUser && (
                                            <button className="btn btn-primary btn-sm" onClick={() => handleRestore(b.id)} disabled={restoring === b.id}>
                                                {restoring === b.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restore Panel
                                            </button>
                                        )}
                                        <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(JSON.stringify(b, null, 2))}>
                                            <Copy size={14} /> Copy JSON
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

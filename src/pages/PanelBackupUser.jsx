import { useState, useEffect } from 'react'
import {
    Database, Globe, Shield, RefreshCw, Loader2, Clock,
    CheckCircle, AlertTriangle, ChevronDown, ChevronRight,
    Layers, Copy, Eye, EyeOff
} from 'lucide-react'
import api from '../services/api'

export default function PanelBackupUser() {
    const [backups, setBackups] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [expandedId, setExpandedId] = useState(null)
    const [filterDeleted, setFilterDeleted] = useState('all')

    useEffect(() => { fetchData() }, [])
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t) } }, [success])
    useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t) } }, [error])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [backupsRes, statsRes] = await Promise.all([
                api.get('/panel-backup-user?includeDeleted=true'),
                api.get('/panel-backup-user/stats')
            ])
            setBackups(backupsRes.data?.data || backupsRes.data || [])
            setStats(statsRes.data?.data || null)
        } catch (e) {
            setError(e.response?.data?.message || e.error?.message || 'Failed to load panel backups')
        }
        setLoading(false)
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
            .then(() => setSuccess('Copied!'))
            .catch(() => { })
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
                    <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>Loading panel backups...</p>
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
                        Panel Backups
                    </h1>
                    <p className="page-subtitle">
                        Your panel configurations are automatically backed up when panels are added or modified
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-secondary" onClick={fetchData}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
            </div>

            {success && <div className="alert alert-success"><CheckCircle size={16} /> {success}</div>}
            {error && <div className="alert alert-error"><AlertTriangle size={16} /> {error}</div>}

            {/* Stats */}
            {stats && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-lg)'
                }}>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Database size={24} style={{ color: '#6366f1' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {stats.total || 0}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Backups</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <CheckCircle size={24} style={{ color: '#22c55e' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {stats.activeBackups || 0}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Active Panels</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {stats.deletedPanels || 0}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Deleted Panels</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="card" style={{
                padding: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-lg)',
                display: 'flex',
                gap: 'var(--spacing-sm)',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {filteredBackups.length} backup{filteredBackups.length !== 1 ? 's' : ''}
                </span>
                <select
                    className="form-input"
                    style={{ width: 'auto' }}
                    value={filterDeleted}
                    onChange={e => setFilterDeleted(e.target.value)}
                >
                    <option value="all">All Panels</option>
                    <option value="active">Active Only</option>
                    <option value="deleted">Deleted Only</option>
                </select>
            </div>

            {/* Backup List */}
            {filteredBackups.length === 0 ? (
                <div className="card" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                    <Database size={48} style={{ margin: '0 auto var(--spacing-md)', opacity: 0.3, color: 'var(--text-muted)' }} />
                    <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>No panel backups found</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Panel backups are created automatically when you add or modify panels
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {filteredBackups.map(b => (
                        <div
                            key={b.id}
                            className="card"
                            style={{
                                padding: 'var(--spacing-md)',
                                opacity: b.deletedByUser ? 0.7 : 1,
                                borderLeft: `4px solid ${b.deletedByUser ? 'var(--color-error, #ef4444)' : 'var(--color-success, #22c55e)'}`
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {expandedId === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <div>
                                        <div style={{
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}>
                                            <Globe size={16} /> {b.panelName}
                                            {b.panelAlias && (
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                    ({b.panelAlias})
                                                </span>
                                            )}
                                            {b.deletedByUser && (
                                                <span style={{
                                                    fontSize: 11,
                                                    padding: '2px 8px',
                                                    borderRadius: 4,
                                                    background: 'rgba(239,68,68,0.15)',
                                                    color: '#ef4444',
                                                    fontWeight: 600
                                                }}>
                                                    DELETED
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            <strong>Domain:</strong> {b.panelDomain}
                                            {b.panelType && <> | <strong>Type:</strong> {b.panelType}</>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
                                    <div><Clock size={12} /> {new Date(b.createdAt).toLocaleString()}</div>
                                    <div style={{ marginTop: 4 }}>{b.backupType}</div>
                                </div>
                            </div>

                            {expandedId === b.id && (
                                <div style={{
                                    marginTop: 'var(--spacing-md)',
                                    paddingTop: 'var(--spacing-md)',
                                    borderTop: '1px solid var(--border-color)'
                                }}>
                                    {/* Panel Domain */}
                                    <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <strong>Panel Domain:</strong>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                            <code style={{
                                                background: 'var(--bg-secondary)',
                                                padding: '4px 8px',
                                                borderRadius: 4,
                                                flex: 1,
                                                fontSize: 13
                                            }}>
                                                {b.panelDomain}
                                            </code>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => copyToClipboard(b.panelDomain)}
                                            >
                                                <Copy size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Provider Aliases */}
                                    {b.providerAliases && (
                                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                            <strong>
                                                Provider Aliases ({Array.isArray(b.providerAliases) ? b.providerAliases.length : 0}):
                                            </strong>
                                            <div style={{
                                                marginTop: 8,
                                                maxHeight: 200,
                                                overflow: 'auto',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: 8,
                                                padding: 'var(--spacing-sm)'
                                            }}>
                                                {Array.isArray(b.providerAliases) && b.providerAliases.length > 0 ? (
                                                    b.providerAliases.map((p, i) => (
                                                        <div key={i} style={{
                                                            padding: '6px 0',
                                                            borderBottom: '1px solid var(--border-color)',
                                                            fontSize: 13,
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <span>
                                                                <strong>{p.providerName || p.name}</strong>
                                                                {p.alias && ` → ${p.alias}`}
                                                                {p.domain && (
                                                                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                                                                        ({p.domain})
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        No provider aliases
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Provider Domains */}
                                    {b.providerDomains && Array.isArray(b.providerDomains) && b.providerDomains.length > 0 && (
                                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                            <strong>Provider Domains:</strong>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                                {b.providerDomains.map((d, i) => {
                                                    const domainName = typeof d === 'string' ? d : (d.providerName || d.hiddenDomain || 'Unknown')
                                                    return (
                                                        <span key={i} style={{
                                                            padding: '4px 12px',
                                                            borderRadius: 20,
                                                            background: 'rgba(99,102,241,0.15)',
                                                            color: '#6366f1',
                                                            fontSize: 12
                                                        }}>
                                                            {domainName}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Provider Groups */}
                                    {b.providerGroups && Array.isArray(b.providerGroups) && b.providerGroups.length > 0 && (
                                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                            <strong>Provider Groups ({b.providerGroups.length}):</strong>
                                            <div style={{
                                                marginTop: 8,
                                                maxHeight: 150,
                                                overflow: 'auto',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: 8,
                                                padding: 'var(--spacing-sm)'
                                            }}>
                                                {b.providerGroups.map((g, i) => (
                                                    <div key={i} style={{
                                                        padding: '4px 0',
                                                        borderBottom: '1px solid var(--border-color)',
                                                        fontSize: 12
                                                    }}>
                                                        <strong>{g.providerName}</strong>
                                                        {g.type && ` (${g.type})`}
                                                        {g.groupName && ` — ${g.groupName}`}
                                                        {g.isActive === false && (
                                                            <span style={{ color: '#ef4444', marginLeft: 8 }}>Inactive</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Backup Metadata */}
                                    <div style={{
                                        display: 'flex',
                                        gap: 'var(--spacing-md)',
                                        paddingTop: 'var(--spacing-sm)',
                                        borderTop: '1px solid var(--border-color)',
                                        fontSize: 12,
                                        color: 'var(--text-muted)',
                                        flexWrap: 'wrap'
                                    }}>
                                        <span><strong>Backup Type:</strong> {b.backupType}</span>
                                        {b.backupReason && <span><strong>Reason:</strong> {b.backupReason}</span>}
                                        <span><strong>Created:</strong> {new Date(b.createdAt).toLocaleString()}</span>
                                        {b.deletedByUser && b.userDeletedAt && (
                                            <span style={{ color: '#ef4444' }}>
                                                <strong>Deleted:</strong> {new Date(b.userDeletedAt).toLocaleString()}
                                            </span>
                                        )}
                                    </div>

                                    {/* Copy JSON */}
                                    <div style={{ marginTop: 'var(--spacing-sm)' }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => copyToClipboard(JSON.stringify(b, null, 2))}
                                        >
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

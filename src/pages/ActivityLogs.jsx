import { useState, useEffect } from 'react'
import {
    Activity,
    Search,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Clock,
    Shield,
    Smartphone,
    MessageSquare,
    Package,
    Settings,
    Zap,
    Globe,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Loader2,
    X,
    Monitor,
    Info
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow, format } from 'date-fns'

const categoryConfig = {
    auth: { label: 'Authentication', icon: Shield, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    device: { label: 'Device', icon: Smartphone, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    message: { label: 'Messages', icon: MessageSquare, color: '#25D366', bg: 'rgba(37,211,102,0.1)' },
    order: { label: 'Orders', icon: Package, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    admin: { label: 'Admin', icon: Settings, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    system: { label: 'System', icon: Monitor, color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
    panel: { label: 'Panel', icon: Globe, color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
    general: { label: 'General', icon: Activity, color: '#64748b', bg: 'rgba(100,116,139,0.1)' }
}

const statusConfig = {
    success: { label: 'Success', icon: CheckCircle, color: '#22c55e' },
    failed: { label: 'Failed', icon: XCircle, color: '#ef4444' },
    warning: { label: 'Warning', icon: AlertTriangle, color: '#f59e0b' }
}

const actionLabels = {
    LOGIN: 'Login',
    LOGIN_FAILED: 'Failed Login',
    LOGOUT: 'Logout',
    REGISTER: 'Register',
    PASSWORD_CHANGE: 'Password Change',
    DEVICE_CREATE: 'Device Created',
    DEVICE_DELETE: 'Device Deleted',
    DEVICE_CONNECT: 'Device Connected',
    DEVICE_DISCONNECT: 'Device Disconnected',
    MESSAGE_SEND: 'Message Sent',
    MESSAGE_RECEIVE: 'Message Received',
    BROADCAST_SEND: 'Broadcast Sent',
    PANEL_ADD: 'Panel Added',
    PANEL_DELETE: 'Panel Deleted',
    PANEL_UPDATE: 'Panel Updated',
    PANEL_SYNC: 'Panel Synced',
    PANEL_TEST: 'Panel Tested',
    PANEL_BALANCE_REFRESH: 'Panel Balance',
    PANEL_TEST_ADMIN: 'Panel Admin Test',
    PANEL_DETECT: 'Panel Detect',
    ORDER_CREATE: 'Order Created',
    ORDER_REFILL: 'Order Refill',
    ORDER_CANCEL: 'Order Cancel',
    ORDER_STATUS: 'Order Status',
    USER_SUSPEND: 'User Suspended',
    USER_BAN: 'User Banned',
    USER_ACTIVATE: 'User Activated',
    CREDIT_ADJUST: 'Credit Adjusted',
    CONFIG_UPDATE: 'Config Updated',
    SYSTEM_START: 'System Start',
    SYSTEM_ERROR: 'System Error',
    API_CALL: 'API Call'
}

export default function ActivityLogs() {
    const [logs, setLogs] = useState([])
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [stats, setStats] = useState(null)
    const [error, setError] = useState('')

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    // Detail
    const [selectedLog, setSelectedLog] = useState(null)

    const fetchLogs = async (page = 1) => {
        try {
            setRefreshing(true)
            const params = {
                page,
                limit: 20,
                search: searchQuery || undefined,
                category: categoryFilter || undefined,
                status: statusFilter || undefined,
                startDate: dateFrom || undefined,
                endDate: dateTo ? dateTo + 'T23:59:59.999Z' : undefined
            }
            const res = await api.get('/activity-logs', { params })
            setLogs(res.data || [])
            setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 })
        } catch (err) {
            setError(err.message || 'Failed to fetch activity logs')
            console.error('Failed to fetch logs:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const fetchStats = async () => {
        try {
            const res = await api.get('/activity-logs/stats')
            setStats(res.data)
        } catch (err) {
            console.error('Failed to fetch stats:', err)
        }
    }

    useEffect(() => {
        fetchStats()
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => fetchLogs(1), 400)
        return () => clearTimeout(timer)
    }, [searchQuery, categoryFilter, statusFilter, dateFrom, dateTo])

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            fetchLogs(newPage)
        }
    }

    const clearFilters = () => {
        setSearchQuery('')
        setCategoryFilter('')
        setStatusFilter('')
        setDateFrom('')
        setDateTo('')
    }

    const hasActiveFilters = searchQuery || categoryFilter || statusFilter || dateFrom || dateTo

    const getCategoryInfo = (cat) => categoryConfig[cat] || categoryConfig.general
    const getStatusInfo = (st) => statusConfig[st] || statusConfig.success

    if (loading && !refreshing) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin" size={48} style={{ color: 'var(--primary-color)' }} />
            </div>
        )
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Activity Log</h1>
                    <p className="page-subtitle">Track all actions and events in your account</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={() => { fetchLogs(pagination.page); fetchStats(); }}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={16} /></button>
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Events</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.total?.toLocaleString() || 0}</div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Last 24 Hours</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>{stats.last24h?.toLocaleString() || 0}</div>
                    </div>
                    {(stats.byCategory || []).slice(0, 3).map(c => {
                        const info = getCategoryInfo(c.category)
                        return (
                            <div className="card" style={{ padding: 'var(--spacing-lg)' }} key={c.category}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <info.icon size={12} style={{ color: info.color }} />
                                    {info.label}
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: info.color }}>{c.count?.toLocaleString() || 0}</div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Search */}
                    <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search actions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>

                    {/* Category */}
                    <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: 'auto', minWidth: '140px' }}>
                        <option value="">All Categories</option>
                        {Object.entries(categoryConfig).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                        ))}
                    </select>

                    {/* Status */}
                    <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: '120px' }}>
                        <option value="">All Status</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                        <option value="warning">Warning</option>
                    </select>

                    {/* Date range */}
                    <input
                        type="date"
                        className="form-input"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        style={{ width: 'auto' }}
                        title="From date"
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
                    <input
                        type="date"
                        className="form-input"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        style={{ width: 'auto' }}
                        title="To date"
                    />

                    {hasActiveFilters && (
                        <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                            <X size={14} /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Logs List */}
            <div className="card">
                {logs.length > 0 ? (
                    <div>
                        {logs.map((log) => {
                            const catInfo = getCategoryInfo(log.category)
                            const statInfo = getStatusInfo(log.status)
                            const CatIcon = catInfo.icon
                            const StatIcon = statInfo.icon

                            return (
                                <div
                                    key={log.id}
                                    onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 'var(--spacing-md)',
                                        padding: 'var(--spacing-md) var(--spacing-lg)',
                                        borderBottom: '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                        background: selectedLog?.id === log.id ? 'var(--bg-tertiary)' : 'transparent'
                                    }}
                                    onMouseEnter={(e) => { if (selectedLog?.id !== log.id) e.currentTarget.style.background = 'var(--bg-secondary)' }}
                                    onMouseLeave={(e) => { if (selectedLog?.id !== log.id) e.currentTarget.style.background = 'transparent' }}
                                >
                                    {/* Category Icon */}
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: 'var(--radius-md)',
                                        background: catInfo.bg,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        marginTop: '2px'
                                    }}>
                                        <CatIcon size={18} style={{ color: catInfo.color }} />
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: '2px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                {actionLabels[log.action] || log.action}
                                            </span>
                                            <span style={{
                                                padding: '1px 8px',
                                                fontSize: '0.65rem',
                                                fontWeight: 600,
                                                borderRadius: 'var(--radius-full)',
                                                background: catInfo.bg,
                                                color: catInfo.color,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.03em'
                                            }}>
                                                {catInfo.label}
                                            </span>
                                            <StatIcon size={14} style={{ color: statInfo.color }} />
                                        </div>
                                        {log.description && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.description}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={12} />
                                                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                            </span>
                                            {log.ipAddress && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Globe size={12} />
                                                    {log.ipAddress}
                                                </span>
                                            )}
                                            {log.duration && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Zap size={12} />
                                                    {log.duration}ms
                                                </span>
                                            )}
                                        </div>

                                        {/* Expanded detail */}
                                        {selectedLog?.id === log.id && log.metadata && (
                                            <div style={{
                                                marginTop: 'var(--spacing-sm)',
                                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                                background: 'var(--bg-secondary)',
                                                borderRadius: 'var(--radius-md)',
                                                fontSize: '0.8rem',
                                                fontFamily: 'var(--font-mono)',
                                                maxHeight: '200px',
                                                overflow: 'auto',
                                                border: '1px solid var(--border-color)'
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: '0.25rem', fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
                                                    <Info size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                                    Metadata
                                                </div>
                                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)' }}>
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {selectedLog?.id === log.id && log.userAgent && (
                                            <div style={{
                                                marginTop: 'var(--spacing-xs)',
                                                fontSize: '0.7rem',
                                                color: 'var(--text-muted)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                🖥️ {log.userAgent}
                                            </div>
                                        )}
                                    </div>

                                    {/* Timestamp */}
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                                        {format(new Date(log.createdAt), 'MMM dd, yyyy')}
                                        <br />
                                        <span style={{ fontSize: '0.7rem' }}>{format(new Date(log.createdAt), 'HH:mm:ss')}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--text-muted)' }}>
                        <Activity size={48} style={{ marginBottom: 'var(--spacing-md)', opacity: 0.3 }} />
                        <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No activity logs found</div>
                        <div style={{ fontSize: '0.85rem' }}>
                            {hasActiveFilters ? 'Try adjusting your filters' : 'Activity will appear here as you use the platform'}
                        </div>
                    </div>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-md) var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Showing {logs.length} of {pagination.total} events
                        </span>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                            <button className="btn btn-secondary btn-sm" disabled={pagination.page === 1} onClick={() => handlePageChange(pagination.page - 1)}>
                                <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: '0.85rem' }}>Page {pagination.page} of {pagination.totalPages}</span>
                            <button className="btn btn-secondary btn-sm" disabled={pagination.page === pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)}>
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

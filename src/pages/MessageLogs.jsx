import { useState, useEffect } from 'react'
import {
    MessageSquare,
    Search,
    Filter,
    Download,
    RefreshCw,
    CheckCircle,
    Clock,
    XCircle,
    Send,
    Eye,
    Smartphone,
    Calendar,
    ArrowUpRight,
    ArrowDownLeft,
    Loader2,
    ChevronLeft,
    ChevronRight
} from 'lucide-react'
import api from '../services/api'
import { format } from 'date-fns'

const getStatusBadge = (status) => {
    switch (status) {
        case 'delivered':
            return <span className="badge badge-success"><CheckCircle size={12} /> Delivered</span>
        case 'read':
            return <span className="badge badge-info"><Eye size={12} /> Read</span>
        case 'sent':
            return <span className="badge badge-warning"><Clock size={12} /> Sent</span>
        case 'received':
            return <span className="badge badge-info"><ArrowDownLeft size={12} /> Received</span>
        case 'failed':
            return <span className="badge badge-error"><XCircle size={12} /> Failed</span>
        case 'pending':
            return <span className="badge badge-neutral"><Clock size={12} /> Pending</span>
        default:
            return <span className="badge badge-neutral">{status}</span>
    }
}

export default function MessageLogs() {
    const [messages, setMessages] = useState([])
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 })
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')
    const [deviceIdFilter, setDeviceIdFilter] = useState('all')
    const [dateFilter, setDateFilter] = useState('')
    const [selectedLog, setSelectedLog] = useState(null)
    const [devices, setDevices] = useState([])

    const fetchDevices = async () => {
        try {
            const res = await api.get('/devices')
            setDevices(res.data || [])
        } catch (error) {
            console.error('Failed to fetch devices:', error)
        }
    }

    const fetchMessages = async (page = 1) => {
        try {
            setRefreshing(true)
            const params = {
                page,
                limit: 10,
                search: searchQuery || undefined,
                status: statusFilter !== 'all' ? statusFilter : undefined,
                type: typeFilter !== 'all' ? typeFilter : undefined,
                deviceId: deviceIdFilter !== 'all' ? deviceIdFilter : undefined,
                date: dateFilter || undefined
            }

            const res = await api.get('/messages', { params })
            setMessages(res.data || [])
            setPagination(res.pagination)
        } catch (error) {
            console.error('Failed to fetch messages:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchDevices()
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchMessages(1)
        }, 500)
        return () => clearTimeout(timer)
    }, [searchQuery, statusFilter, typeFilter, deviceIdFilter, dateFilter])

    const handleRefresh = () => {
        fetchMessages(pagination.page)
    }

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            fetchMessages(newPage)
        }
    }

    if (loading && !refreshing) {
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
                    <h1 className="page-title">Message Logs</h1>
                    <p className="page-subtitle">View complete history of all messages sent and received</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary">
                        <Download size={16} />
                        Export
                    </button>
                    <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
                        <Search
                            size={18}
                            style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)'
                            }}
                        />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by phone or message..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '44px' }}
                        />
                    </div>

                    <select
                        className="form-select"
                        style={{ width: 'auto' }}
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="outgoing">Outgoing</option>
                        <option value="incoming">Incoming</option>
                    </select>

                    <select
                        className="form-select"
                        style={{ width: 'auto' }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="delivered">Delivered</option>
                        <option value="read">Read</option>
                        <option value="sent">Sent</option>
                        <option value="received">Received</option>
                        <option value="failed">Failed</option>
                        <option value="pending">Pending</option>
                    </select>

                    <select
                        className="form-select"
                        style={{ width: 'auto' }}
                        value={deviceIdFilter}
                        onChange={(e) => setDeviceIdFilter(e.target.value)}
                    >
                        <option value="all">All Devices</option>
                        {devices.map(device => (
                            <option key={device.id} value={device.id}>{device.name}</option>
                        ))}
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="date"
                            className="form-input"
                            style={{ width: 'auto' }}
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Logs Table */}
            <div className="card">
                <div className="table-container" style={{ border: 'none' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>Type</th>
                                <th>Contact</th>
                                <th>Message</th>
                                <th>Status</th>
                                <th>Device</th>
                                <th>Time</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {messages.length > 0 ? messages.map((log) => (
                                <tr key={log.id}>
                                    <td>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: 'var(--radius-full)',
                                            background: log.direction === 'outgoing' ? 'var(--primary-600)' : 'var(--bg-tertiary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {log.direction === 'outgoing'
                                                ? <ArrowUpRight size={16} style={{ color: 'white' }} />
                                                : <ArrowDownLeft size={16} style={{ color: 'var(--info)' }} />
                                            }
                                        </div>
                                    </td>
                                    <td>
                                        <div>
                                            <div style={{ fontWeight: 500 }}>{log.to || log.from}</div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="truncate" style={{ maxWidth: '300px', fontSize: '0.875rem' }}>
                                            {log.content}
                                        </div>
                                    </td>
                                    <td>{getStatusBadge(log.status)}</td>
                                    <td>
                                        <span style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--spacing-xs)',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-muted)'
                                        }}>
                                            <Smartphone size={12} />
                                            {log.device?.name || 'Unknown'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            style={{ width: '32px', height: '32px' }}
                                            onClick={() => setSelectedLog(log)}
                                        >
                                            <Eye size={14} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                                        No messages found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 'var(--spacing-md) var(--spacing-lg)',
                        borderTop: '1px solid var(--border-color)'
                    }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            Showing {messages.length} of {pagination.total} messages
                        </span>
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={pagination.page === 1}
                                onClick={() => handlePageChange(pagination.page - 1)}
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: '0.875rem' }}>
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={pagination.page === pagination.totalPages}
                                onClick={() => handlePageChange(pagination.page + 1)}
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="modal-overlay open" onClick={() => setSelectedLog(null)}>
                    <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Message Details</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setSelectedLog(null)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: 'var(--spacing-md)',
                                marginBottom: 'var(--spacing-lg)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Direction</div>
                                    <div style={{ fontSize: '0.875rem', textTransform: 'capitalize' }}>{selectedLog.direction}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Status</div>
                                    {getStatusBadge(selectedLog.status)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Phone</div>
                                    <div style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{selectedLog.to || selectedLog.from}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</div>
                                    <div style={{ fontSize: '0.875rem' }}>{selectedLog.type}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Device</div>
                                    <div style={{ fontSize: '0.875rem' }}>{selectedLog.device?.name || 'Unknown'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Timestamp</div>
                                    <div style={{ fontSize: '0.875rem' }}>{format(new Date(selectedLog.createdAt), 'yyyy-MM-dd HH:mm:ss')}</div>
                                </div>
                            </div>

                            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Message</div>
                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)',
                                    fontSize: '0.875rem',
                                    lineHeight: 1.6
                                }}>
                                    {selectedLog.content}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                                Close
                            </button>
                            {selectedLog.direction === 'outgoing' && (
                                <button className="btn btn-primary">
                                    <Send size={16} />
                                    Resend Message
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

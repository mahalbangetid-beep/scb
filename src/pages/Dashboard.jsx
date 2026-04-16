import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    MessageSquare,
    Send,
    CheckCircle,
    Clock,
    XCircle,
    TrendingUp,
    TrendingDown,
    Smartphone,
    Activity,
    BarChart3,
    ArrowUpRight,
    Zap,
    RefreshCw,
    Loader2,
    Wallet,
    Inbox,
    SendHorizontal,
    Signal,
    SignalZero,
    Bot,
    CreditCard,
    ChevronRight,
    Package,
    Search
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

const getCommandStatusBadge = (status) => {
    switch (status) {
        case 'COMPLETED':
        case 'completed':
            return <span className="badge badge-success"><CheckCircle size={12} /> Completed</span>
        case 'FORWARDED':
        case 'forwarded':
            return <span className="badge badge-info"><Send size={12} /> Forwarded</span>
        case 'PENDING':
        case 'pending':
            return <span className="badge badge-warning"><Clock size={12} /> Pending</span>
        case 'FAILED':
        case 'failed':
            return <span className="badge badge-error"><XCircle size={12} /> Failed</span>
        case 'PROCESSING':
        case 'processing':
            return <span className="badge badge-info"><Activity size={12} /> Processing</span>
        default:
            return <span className="badge badge-neutral">{status || 'N/A'}</span>
    }
}

const getStatusBadge = (status) => {
    switch (status) {
        case 'delivered':
            return <span className="badge badge-success"><CheckCircle size={12} /> Delivered</span>
        case 'read':
            return <span className="badge badge-info"><CheckCircle size={12} /> Read</span>
        case 'sent':
            return <span className="badge badge-info"><Send size={12} /> Sent</span>
        case 'pending':
            return <span className="badge badge-warning"><Clock size={12} /> Pending</span>
        case 'received':
            return <span className="badge badge-success">Received</span>
        case 'failed':
            return <span className="badge badge-error"><XCircle size={12} /> Failed</span>
        default:
            return <span className="badge badge-neutral">{status}</span>
    }
}

export default function Dashboard() {
    const navigate = useNavigate()
    const [statsData, setStatsData] = useState(null)
    const [recentMsgs, setRecentMsgs] = useState([])
    const [deviceList, setDeviceList] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [lastRefresh, setLastRefresh] = useState(null)
    const [activitySearch, setActivitySearch] = useState('')
    const [supportLinks, setSupportLinks] = useState({ whatsapp: '', telegram: '' })
    const [referralCode, setReferralCode] = useState('')
    const [refCopied, setRefCopied] = useState(false)

    // Fetch support links once
    useEffect(() => {
        api.get('/admin/config').then(res => {
            const d = res.data || {}
            const platform = d.platform || []
            const wa = platform.find(i => i.key === 'supportWhatsapp')?.value || ''
            const tg = platform.find(i => i.key === 'supportTelegram')?.value || ''
            setSupportLinks({ whatsapp: wa, telegram: tg })
        }).catch(() => {})
        // Fetch referral code
        api.get('/auth/me').then(res => {
            setReferralCode(res.data?.referralCode || '')
        }).catch(() => {})
    }, [])

    const fetchData = useCallback(async () => {
        try {
            const [statsRes, messagesRes, devicesRes] = await Promise.all([
                api.get('/settings/stats/dashboard'),
                api.get('/messages?limit=5'),
                api.get('/devices')
            ])

            setStatsData(statsRes.data)
            setRecentMsgs(messagesRes.data || [])
            setDeviceList(devicesRes.data || [])
            setLastRefresh(new Date())
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000) // Auto refresh every 30s
        return () => clearInterval(interval)
    }, [fetchData])

    const handleRefresh = () => {
        setRefreshing(true)
        fetchData()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin primary" size={48} />
            </div>
        )
    }

    // Weekly chart helpers
    const weeklyChart = statsData?.weeklyChart || []
    const maxWeeklyValue = Math.max(...weeklyChart.map(d => d.total), 1)
    const botActivity = statsData?.botActivity || []

    return (
        <div className="animate-fade-in">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">
                        Real-time analytics & bot activity
                        {lastRefresh && (
                            <span style={{ marginLeft: '8px', fontSize: '0.7rem', opacity: 0.6 }}>
                                Last updated: {lastRefresh.toLocaleTimeString()} • Auto-refreshes every 30s
                            </span>
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing}>
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={() => navigate('/wallet')}
                        style={{ fontWeight: 700, fontSize: '0.95rem', gap: 'var(--spacing-sm)' }}
                    >
                        <Wallet size={18} />
                        Top-Up Credit
                    </button>
                </div>
            </div>

            {/* Credit & Device Quick Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-lg)'
            }}>
                {/* Credit Balance */}
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/wallet')}>
                    <div className="stat-card-header">
                        <div className="stat-icon primary">
                            <CreditCard size={24} />
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--primary-500)' }}>
                        ${(statsData?.creditBalance || 0).toFixed(2)}
                    </div>
                    <div className="stat-label">Credit Balance</div>
                </div>

                {/* Sent Today */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon info">
                            <SendHorizontal size={24} />
                        </div>
                        <div className={`stat-trend up`}>
                            <ArrowUpRight size={14} />
                            today
                        </div>
                    </div>
                    <div className="stat-value">{statsData?.sentToday || 0}</div>
                    <div className="stat-label">Messages Sent</div>
                </div>

                {/* Received Today */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon success">
                            <Inbox size={24} />
                        </div>
                        <div className={`stat-trend up`}>
                            <ArrowUpRight size={14} />
                            today
                        </div>
                    </div>
                    <div className="stat-value">{statsData?.receivedToday || 0}</div>
                    <div className="stat-label">Messages Received</div>
                </div>

                {/* Success Rate */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon success">
                            <CheckCircle size={24} />
                        </div>
                        <div className={`stat-trend ${(statsData?.successRate || 0) >= 90 ? 'up' : 'down'}`}>
                            {(statsData?.successRate || 0) >= 90 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {statsData?.successRate || 0}%
                        </div>
                    </div>
                    <div className="stat-value">{statsData?.successfulMessages?.toLocaleString() || 0}</div>
                    <div className="stat-label">Successful Messages</div>
                </div>

                {/* Failed Messages */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-icon error">
                            <XCircle size={24} />
                        </div>
                        <div className={`stat-trend ${(statsData?.failedMessages || 0) === 0 ? 'up' : 'down'}`}>
                            {(statsData?.failedChange || 0) <= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                            {statsData?.failedChange || 0}%
                        </div>
                    </div>
                    <div className="stat-value">{statsData?.failedMessages?.toLocaleString() || 0}</div>
                    <div className="stat-label">Failed Messages</div>
                </div>

                {/* Active / Offline Devices */}
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/devices')}>
                    <div className="stat-card-header">
                        <div className="stat-icon primary">
                            <Smartphone size={24} />
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-md)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Signal size={14} style={{ color: 'var(--success)' }} />
                            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{statsData?.activeDevices || 0}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>online</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <SignalZero size={14} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>{statsData?.offlineDevices || 0}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>offline</span>
                        </div>
                    </div>
                    <div className="stat-label" style={{ marginTop: 'var(--spacing-xs)' }}>
                        {statsData?.totalDevices || 0} Total Devices
                    </div>
                </div>
            </div>

            {/* Main Content: Weekly Chart + Recent Activity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)' }}>

                {/* Weekly Message Chart */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Weekly Message Summary</h3>
                            <p className="card-subtitle">Last 7 days activity breakdown</p>
                        </div>
                        <BarChart3 size={20} style={{ color: 'var(--primary-500)' }} />
                    </div>
                    <div style={{
                        display: 'flex',
                        gap: 'var(--spacing-md)',
                        marginBottom: 'var(--spacing-lg)',
                        flexWrap: 'wrap'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--primary-500)' }}></div>
                            Sent
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--info)' }}></div>
                            Received
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--error)' }}></div>
                            Failed
                        </div>
                    </div>
                    {/* Bar Chart */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 'var(--spacing-sm)',
                        height: '200px',
                        padding: '0 var(--spacing-sm)'
                    }}>
                        {weeklyChart.map((day, i) => {
                            const sentH = (day.sent / maxWeeklyValue) * 160
                            const receivedH = (day.received / maxWeeklyValue) * 160
                            const failedH = (day.failed / maxWeeklyValue) * 160
                            const isToday = i === weeklyChart.length - 1

                            return (
                                <div key={day.date} style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    <span style={{
                                        fontSize: '0.625rem',
                                        color: 'var(--text-muted)',
                                        fontWeight: 500
                                    }}>
                                        {day.total}
                                    </span>
                                    <div style={{
                                        display: 'flex',
                                        gap: '2px',
                                        alignItems: 'flex-end',
                                        height: '160px',
                                        width: '100%',
                                        justifyContent: 'center'
                                    }}>
                                        <div style={{
                                            width: '30%',
                                            height: `${Math.max(sentH, 3)}px`,
                                            background: 'var(--primary-500)',
                                            borderRadius: '3px 3px 0 0',
                                            minHeight: '3px',
                                            transition: 'height 0.5s ease',
                                            opacity: isToday ? 1 : 0.7
                                        }} title={`Sent: ${day.sent}`} />
                                        <div style={{
                                            width: '30%',
                                            height: `${Math.max(receivedH, 3)}px`,
                                            background: 'var(--info)',
                                            borderRadius: '3px 3px 0 0',
                                            minHeight: '3px',
                                            transition: 'height 0.5s ease',
                                            opacity: isToday ? 1 : 0.7
                                        }} title={`Received: ${day.received}`} />
                                        {day.failed > 0 && (
                                            <div style={{
                                                width: '20%',
                                                height: `${Math.max(failedH, 3)}px`,
                                                background: 'var(--error)',
                                                borderRadius: '3px 3px 0 0',
                                                minHeight: '3px',
                                                transition: 'height 0.5s ease'
                                            }} title={`Failed: ${day.failed}`} />
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: '0.6875rem',
                                        color: isToday ? 'var(--primary-500)' : 'var(--text-muted)',
                                        fontWeight: isToday ? 700 : 500
                                    }}>
                                        {isToday ? 'Today' : day.day}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Quick Stats Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                    {/* Messages Today */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">Messages Today</h3>
                                <p className="card-subtitle">24-hour activity</p>
                            </div>
                            <Activity size={20} style={{ color: 'var(--primary-500)' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 700 }}>{statsData?.messagesToday || 0}</span>
                            <span className={`badge ${(statsData?.messagesChange || 0) >= 0 ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.625rem' }}>
                                {(statsData?.messagesChange || 0) >= 0 ? <ArrowUpRight size={10} /> : <TrendingDown size={10} />}
                                {statsData?.messagesChange >= 0 ? '+' : ''}{statsData?.messagesChange || 0}% vs yesterday
                            </span>
                        </div>
                        <div style={{
                            height: '50px',
                            background: 'linear-gradient(to top, rgba(37, 211, 102, 0.2), transparent)',
                            borderRadius: 'var(--radius-md)',
                            marginTop: 'var(--spacing-md)'
                        }}></div>
                    </div>

                    {/* Auto Reply + Webhook */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)' }}>
                        <div className="card">
                            <div className="card-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                <div>
                                    <h3 className="card-title" style={{ fontSize: '0.875rem' }}>Bot Responses</h3>
                                </div>
                                <Bot size={18} style={{ color: 'var(--info)' }} />
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                                {statsData?.autoReplyTriggers || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto replies triggered</div>
                        </div>
                        <div className="card">
                            <div className="card-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                <div>
                                    <h3 className="card-title" style={{ fontSize: '0.875rem' }}>Webhooks</h3>
                                </div>
                                <Zap size={18} style={{ color: 'var(--warning)' }} />
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                                {statsData?.webhookCalls || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>API calls today</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Recent Bot Activity + Device Status */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: 'var(--spacing-lg)',
                marginTop: 'var(--spacing-lg)'
            }}>
                {/* Recent Bot Activity Panel */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Recent Bot Activity</h3>
                            <p className="card-subtitle">Latest bot command activity with order details</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder="Search activity..."
                                    value={activitySearch}
                                    onChange={(e) => setActivitySearch(e.target.value)}
                                    style={{
                                        padding: '0.375rem 0.5rem 0.375rem 28px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.75rem',
                                        width: '160px',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>
                                View All Orders <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Panel</th>
                                    <th>Provider</th>
                                    <th>Command</th>
                                    <th>Status</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {botActivity.length > 0 ? botActivity
                                    .filter(activity => {
                                        if (!activitySearch.trim()) return true;
                                        const q = activitySearch.toLowerCase();
                                        return (activity.orderId || '').toString().toLowerCase().includes(q) ||
                                            (activity.panelName || '').toLowerCase().includes(q) ||
                                            (activity.providerAlias || '').toLowerCase().includes(q) ||
                                            (activity.command || '').toLowerCase().includes(q) ||
                                            (activity.status || '').toLowerCase().includes(q);
                                    })
                                    .map((activity) => (
                                        <tr key={activity.id}>
                                            <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                #{activity.orderId}
                                            </td>
                                            <td>
                                                <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                                                    <Package size={10} /> {activity.panelName}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {activity.providerAlias}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    textTransform: 'uppercase',
                                                    color: activity.command === 'refill' ? 'var(--info)' :
                                                        activity.command === 'cancel' ? 'var(--error)' :
                                                            activity.command === 'status' ? 'var(--warning)' :
                                                                'var(--primary-500)'
                                                }}>
                                                    {activity.command}
                                                </span>
                                            </td>
                                            <td>{getCommandStatusBadge(activity.status)}</td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                            </td>
                                        </tr>
                                    )) : (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--text-muted)' }}>
                                            <Bot size={32} style={{ marginBottom: '8px', opacity: 0.3 }} /><br />
                                            No bot activity yet. Start by connecting your SMM panel.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Device Status + Recent Messages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                    {/* Device Status */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">Device Status</h3>
                                <p className="card-subtitle">Active WhatsApp sessions</p>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/devices')}>Manage</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {deviceList.length > 0 ? deviceList.map((device) => (
                                <div
                                    key={device.id}
                                    className={`device-card ${device.status === 'connected' ? 'connected' : ''}`}
                                    style={{ padding: 'var(--spacing-md)' }}
                                >
                                    <div className="device-header" style={{ marginBottom: 0 }}>
                                        <div className="device-info">
                                            <div className="device-avatar" style={{ width: '40px', height: '40px' }}>
                                                <Smartphone size={20} />
                                            </div>
                                            <div>
                                                <div className="device-name" style={{ fontSize: '0.875rem' }}>{device.name}</div>
                                                <div className="device-number" style={{ fontSize: '0.75rem' }}>{device.phone || 'Not connected'}</div>
                                            </div>
                                        </div>
                                        <span className={`badge ${device.status === 'connected' ? 'badge-success' : 'badge-error'}`}>
                                            <span className={`status-dot ${device.status === 'connected' ? 'online' : 'offline'}`}></span>
                                            {device.status === 'connected' ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            )) : (
                                <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)', color: 'var(--text-muted)' }}>
                                    <Smartphone size={24} style={{ opacity: 0.3, marginBottom: '8px' }} /><br />
                                    No devices connected
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent Messages Compact */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">Recent Messages</h3>
                                <p className="card-subtitle">Latest activity</p>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/messages')}>View All</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            {recentMsgs.length > 0 ? recentMsgs.slice(0, 4).map((msg) => (
                                <div key={msg.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--spacing-md)',
                                    padding: 'var(--spacing-sm) var(--spacing-md)',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-md)',
                                    fontSize: '0.8rem'
                                }}>
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
                                        background: msg.type === 'outgoing' ? 'rgba(37, 211, 102, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {msg.type === 'outgoing'
                                            ? <SendHorizontal size={12} style={{ color: 'var(--primary-500)' }} />
                                            : <Inbox size={12} style={{ color: 'var(--info)' }} />
                                        }
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {msg.to || msg.from}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {msg.content}
                                        </div>
                                    </div>
                                    {getStatusBadge(msg.status)}
                                </div>
                            )) : (
                                <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    No recent messages
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Referral Card (Section 6.7) */}
            {referralCode && (
                <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
                    <div className="card-header">
                        <div>
                            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                🎁 Invite & Earn
                            </h3>
                            <p className="card-subtitle">Share your referral link to earn commission on their payments</p>
                        </div>
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem'
                    }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {`${window.location.origin}/register?ref=${referralCode}`}
                        </span>
                        <button
                            className="btn btn-primary btn-sm"
                            style={{ flexShrink: 0, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/register?ref=${referralCode}`)
                                setRefCopied(true)
                                setTimeout(() => setRefCopied(false), 2000)
                            }}
                        >
                            {refCopied ? '✓ Copied' : 'Copy Link'}
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Support Icons (Section 6.6) */}
            {(supportLinks.whatsapp || supportLinks.telegram) && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 999
                }}>
                    {supportLinks.whatsapp && (
                        <a
                            href={supportLinks.whatsapp.startsWith('http') ? supportLinks.whatsapp : `https://wa.me/${supportLinks.whatsapp.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp Support"
                            style={{
                                width: '48px', height: '48px',
                                borderRadius: '50%',
                                background: '#25D366',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 14px rgba(37,211,102,0.4)',
                                transition: 'transform 0.2s',
                                cursor: 'pointer'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                        </a>
                    )}
                    {supportLinks.telegram && (
                        <a
                            href={supportLinks.telegram.startsWith('http') ? supportLinks.telegram : `https://t.me/${supportLinks.telegram.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Telegram Support"
                            style={{
                                width: '48px', height: '48px',
                                borderRadius: '50%',
                                background: '#0088cc',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 14px rgba(0,136,204,0.4)',
                                transition: 'transform 0.2s',
                                cursor: 'pointer'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                                <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                            </svg>
                        </a>
                    )}
                </div>
            )}
        </div>
    )
}

import { useState, useEffect } from 'react'
import {
    MessageSquare,
    Users,
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
    ArrowDownRight,
    Zap,
    RefreshCw,
    Loader2,
    ArrowRight
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

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
    const [statsData, setStatsData] = useState(null)
    const [recentMsgs, setRecentMsgs] = useState([])
    const [deviceList, setDeviceList] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const fetchData = async () => {
        try {
            const [statsRes, messagesRes, devicesRes] = await Promise.all([
                api.get('/settings/stats/dashboard'),
                api.get('/messages?limit=5'),
                api.get('/devices')
            ])

            setStatsData(statsRes.data)
            setRecentMsgs(messagesRes.data || [])
            setDeviceList(devicesRes.data || [])
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000) // Auto refresh every 30s
        return () => clearInterval(interval)
    }, [])

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

    const mainStats = [
        {
            label: 'Total Messages',
            value: statsData?.totalMessages?.toLocaleString() || '0',
            trend: statsData?.messagesChange > 0 ? `+${statsData.messagesChange}%` : `${statsData.messagesChange}%`,
            trendUp: statsData?.messagesChange >= 0,
            icon: MessageSquare,
            iconClass: 'primary'
        },
        {
            label: 'Active Devices',
            value: statsData?.activeDevices || '0',
            trend: statsData?.devicesChange >= 0 ? `+${statsData.devicesChange}` : statsData.devicesChange,
            trendUp: statsData?.devicesChange >= 0,
            icon: Smartphone,
            iconClass: 'success'
        },
        {
            label: 'Success Rate',
            value: `${statsData?.successRate || 0}%`,
            trend: statsData?.successRateChange >= 0 ? `+${statsData.successRateChange}%` : `${statsData.successRateChange}%`,
            trendUp: statsData?.successRateChange >= 0,
            icon: CheckCircle,
            iconClass: 'info'
        },
        {
            label: 'Failed Messages',
            value: statsData?.failedMessages?.toLocaleString() || '0',
            trend: statsData?.failedChange >= 0 ? `+${statsData.failedChange}%` : `${statsData.failedChange}%`,
            trendUp: statsData?.failedChange < 0, // Failed going down is good
            icon: XCircle,
            iconClass: 'error'
        },
    ]

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Welcome back! Here's what's happening with your WhatsApp Gateway</p>
                </div>
                <div className="flex gap-md">
                    <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button className="btn btn-primary">
                        <Zap size={16} />
                        Quick Send
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid stagger">
                {mainStats.map((stat, index) => (
                    <div key={index} className="stat-card">
                        <div className="stat-card-header">
                            <div className={`stat-icon ${stat.iconClass}`}>
                                <stat.icon size={24} />
                            </div>
                            <div className={`stat-trend ${stat.trendUp ? 'up' : 'down'}`}>
                                {stat.trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {stat.trend}
                            </div>
                        </div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Main Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-lg)' }}>
                {/* Recent Messages */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Recent Messages</h3>
                            <p className="card-subtitle">Latest message activity from all devices</p>
                        </div>
                        <button className="btn btn-ghost btn-sm">View All</button>
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Recipient</th>
                                    <th>Message</th>
                                    <th>Status</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentMsgs.length > 0 ? recentMsgs.map((msg) => (
                                    <tr key={msg.id}>
                                        <td style={{ fontWeight: 500 }}>{msg.to || msg.from}</td>
                                        <td className="truncate" style={{ maxWidth: '250px' }}>{msg.content}</td>
                                        <td>{getStatusBadge(msg.status)}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                                            No recent messages
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Device Status */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Device Status</h3>
                            <p className="card-subtitle">Active WhatsApp sessions</p>
                        </div>
                        <button className="btn btn-ghost btn-sm">Manage</button>
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
                            <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--text-muted)' }}>
                                No devices found
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Stats Row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--spacing-lg)',
                marginTop: 'var(--spacing-lg)'
            }}>
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
                        <span className="badge badge-success" style={{ fontSize: '0.625rem' }}>
                            <ArrowUpRight size={10} /> +0%
                        </span>
                    </div>
                    <div style={{
                        height: '60px',
                        background: 'linear-gradient(to top, rgba(37, 211, 102, 0.2), transparent)',
                        borderRadius: 'var(--radius-md)',
                        marginTop: 'var(--spacing-md)'
                    }}></div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Auto Reply Triggers</h3>
                            <p className="card-subtitle">Bot responses today</p>
                        </div>
                        <BarChart3 size={20} style={{ color: 'var(--info)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: '2rem', fontWeight: 700 }}>{statsData?.autoReplyTriggers || 0}</span>
                        <span className="badge badge-info" style={{ fontSize: '0.625rem' }}>
                            <ArrowUpRight size={10} /> +0%
                        </span>
                    </div>
                    <div style={{
                        height: '60px',
                        background: 'linear-gradient(to top, rgba(59, 130, 246, 0.2), transparent)',
                        borderRadius: 'var(--radius-md)',
                        marginTop: 'var(--spacing-md)'
                    }}></div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Webhook Calls</h3>
                            <p className="card-subtitle">API requests today</p>
                        </div>
                        <Zap size={20} style={{ color: 'var(--warning)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: '2rem', fontWeight: 700 }}>{statsData?.webhookCalls || 0}</span>
                        <span className="badge badge-warning" style={{ fontSize: '0.625rem' }}>
                            <ArrowRight size={10} /> 0%
                        </span>
                    </div>
                    <div style={{
                        height: '60px',
                        background: 'linear-gradient(to top, rgba(245, 158, 11, 0.2), transparent)',
                        borderRadius: 'var(--radius-md)',
                        marginTop: 'var(--spacing-md)'
                    }}></div>
                </div>
            </div>
        </div>
    )
}

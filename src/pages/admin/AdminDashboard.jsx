import { useState, useEffect, useRef } from 'react';
import {
    LayoutDashboard, Users, Smartphone, Globe, Package, MessageSquare,
    DollarSign, Activity, Clock, Server, Cpu, HardDrive,
    RefreshCw, AlertTriangle, UserPlus,
    SendHorizontal, BarChart3, Shield, Wallet
} from 'lucide-react';
import api from '../../services/api';

const AdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(null);
    const intervalRef = useRef(null);

    useEffect(() => {
        fetchStats();
        // Auto-refresh every 30 seconds
        intervalRef.current = setInterval(fetchStats, 30000);
        return () => clearInterval(intervalRef.current);
    }, []);

    const fetchStats = async () => {
        try {
            const res = await api.get('/admin/dashboard-stats');
            setStats(res.data);
            setLastRefresh(new Date());
            setError('');
        } catch (err) {
            setError('Failed to load dashboard stats');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading admin dashboard...</p>
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="page-container">
                <div className="empty-state">
                    <AlertTriangle size={48} />
                    <h3>Failed to load dashboard</h3>
                    <p>{error}</p>
                    <button className="btn btn-primary" onClick={fetchStats}>Retry</button>
                </div>
            </div>
        );
    }

    const users = stats.users || {};
    const devices = stats.devices || { whatsapp: {}, telegram: {} };
    const panels = stats.panels || {};
    const orders = stats.orders || {};
    const messages = stats.messages || {};
    const finance = stats.finance || {};
    const weeklyTrend = stats.weeklyTrend || [];
    const recentPayments = stats.recentPayments || [];
    const recentRegistrations = stats.recentRegistrations || [];
    const systemHealth = stats.systemHealth || { memory: {}, uptimeHuman: '0m', nodeVersion: 'N/A' };

    // Calculate chart max values
    const maxSent = Math.max(...(weeklyTrend || []).map(d => d.sent), 1);
    const maxReceived = Math.max(...(weeklyTrend || []).map(d => d.received), 1);
    const maxChartVal = Math.max(maxSent, maxReceived, 1);

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1><LayoutDashboard size={28} /> Admin Dashboard</h1>
                    <p className="header-subtitle">
                        System-wide overview • Last updated: {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={fetchStats}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}

            {/* ── PRIMARY STATS ── */}
            <div className="ad-stats-grid">
                <StatCard
                    icon={Users} label="Total Users" value={users.total}
                    sub={`${users.active} active • ${users.newToday} today`}
                    color="#6366f1"
                />
                <StatCard
                    icon={Smartphone} label="WhatsApp Devices"
                    value={`${devices.whatsapp.connected}/${devices.whatsapp.total}`}
                    sub={`${devices.whatsapp.offline} offline`}
                    color="#10b981"
                />
                <StatCard
                    icon={SendHorizontal} label="Telegram Bots"
                    value={`${devices.telegram.active}/${devices.telegram.total}`}
                    sub={`${devices.systemBots} system bots`}
                    color="#3b82f6"
                />
                <StatCard
                    icon={Globe} label="SMM Panels" value={panels.total}
                    sub="Connected panels" color="#8b5cf6"
                />
                <StatCard
                    icon={DollarSign} label="Total Received"
                    value={`$${(finance.totalReceived || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    sub={`$${(finance.monthlyRevenue || 0).toFixed(2)} this month`}
                    color="#f59e0b"
                />
                <StatCard
                    icon={Package} label="Total Orders" value={orders.total.toLocaleString()}
                    sub={`${orders.today} today`}
                    color="#ec4899"
                />
                <StatCard
                    icon={MessageSquare} label="Messages Today"
                    value={(messages.todaySent + messages.todayReceived).toLocaleString()}
                    sub={`↑${messages.todaySent} sent • ↓${messages.todayReceived} recv`}
                    color="#14b8a6"
                />
                <StatCard
                    icon={Shield} label="Users with Active Bots"
                    value={users.withActiveBots}
                    sub={`${users.newThisWeek} new this week`}
                    color="#f97316"
                />
            </div>

            {/* ── FINANCIAL + SYSTEM HEALTH ROW ── */}
            <div className="ad-row">
                {/* Financial Overview */}
                <div className="card ad-card" style={{ flex: 2 }}>
                    <div className="ad-card-header">
                        <h3><Wallet size={18} /> Financial Overview</h3>
                    </div>
                    <div className="ad-finance-grid">
                        <div className="ad-finance-item">
                            <span className="ad-finance-label">Total Received</span>
                            <span className="ad-finance-value" style={{ color: '#10b981' }}>
                                ${(finance.totalReceived || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="ad-finance-item">
                            <span className="ad-finance-label">Credits Used</span>
                            <span className="ad-finance-value" style={{ color: '#ef4444' }}>
                                ${(finance.totalCreditsUsed || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="ad-finance-item">
                            <span className="ad-finance-label">Monthly Revenue (30d)</span>
                            <span className="ad-finance-value" style={{ color: '#6366f1' }}>
                                ${(finance.monthlyRevenue || 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="ad-finance-item">
                            <span className="ad-finance-label">Pending Payments</span>
                            <span className="ad-finance-value" style={{ color: '#f59e0b' }}>
                                {finance.pendingPayments}
                            </span>
                        </div>
                        <div className="ad-finance-item">
                            <span className="ad-finance-label">Active Subscriptions</span>
                            <span className="ad-finance-value">{finance.subscriptions?.active || 0}</span>
                        </div>
                        <div className="ad-finance-item">
                            <span className="ad-finance-label">System Bot Subs</span>
                            <span className="ad-finance-value">{finance.systemBots?.activeSubscribers || 0}</span>
                        </div>
                    </div>
                </div>

                {/* System Health */}
                <div className="card ad-card" style={{ flex: 1 }}>
                    <div className="ad-card-header">
                        <h3><Server size={18} /> System Health</h3>
                        <span className="badge badge-success">Online</span>
                    </div>
                    <div className="ad-health-list">
                        <div className="ad-health-item">
                            <Clock size={16} />
                            <span>Uptime</span>
                            <strong>{systemHealth.uptimeHuman}</strong>
                        </div>
                        <div className="ad-health-item">
                            <HardDrive size={16} />
                            <span>Memory (RSS)</span>
                            <strong>{systemHealth.memory.rss} MB</strong>
                        </div>
                        <div className="ad-health-item">
                            <Cpu size={16} />
                            <span>Heap Used</span>
                            <strong>{systemHealth.memory.heapUsed}/{systemHealth.memory.heapTotal} MB</strong>
                        </div>
                        <div className="ad-health-item">
                            <Activity size={16} />
                            <span>Heap Usage</span>
                            <div className="ad-health-bar-wrap">
                                <div className="ad-health-bar">
                                    <div
                                        className="ad-health-bar-fill"
                                        style={{
                                            width: `${systemHealth.memory.heapPercent}%`,
                                            background: systemHealth.memory.heapPercent > 80 ? '#ef4444' :
                                                systemHealth.memory.heapPercent > 60 ? '#f59e0b' : '#10b981'
                                        }}
                                    />
                                </div>
                                <small>{systemHealth.memory.heapPercent}%</small>
                            </div>
                        </div>
                        <div className="ad-health-item">
                            <Server size={16} />
                            <span>Node.js</span>
                            <strong>{systemHealth.nodeVersion}</strong>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── WEEKLY TREND CHART ── */}
            <div className="card ad-card">
                <div className="ad-card-header">
                    <h3><BarChart3 size={18} /> 7-Day Activity Trend</h3>
                </div>
                <div className="ad-chart">
                    {(weeklyTrend || []).map((day, i) => (
                        <div key={i} className="ad-chart-col">
                            <div className="ad-chart-bars">
                                <div
                                    className="ad-chart-bar sent"
                                    style={{ height: `${(day.sent / maxChartVal) * 100}%` }}
                                    title={`Sent: ${day.sent}`}
                                >
                                    {day.sent > 0 && <span className="ad-chart-val">{day.sent}</span>}
                                </div>
                                <div
                                    className="ad-chart-bar received"
                                    style={{ height: `${(day.received / maxChartVal) * 100}%` }}
                                    title={`Received: ${day.received}`}
                                >
                                    {day.received > 0 && <span className="ad-chart-val">{day.received}</span>}
                                </div>
                            </div>
                            <span className="ad-chart-label">{day.label}</span>
                            <span className="ad-chart-sub">{day.orders} ord</span>
                        </div>
                    ))}
                </div>
                <div className="ad-chart-legend">
                    <span><span className="ad-legend-dot" style={{ background: '#6366f1' }}></span> Sent</span>
                    <span><span className="ad-legend-dot" style={{ background: '#10b981' }}></span> Received</span>
                </div>
            </div>

            {/* ── RECENT ACTIVITY ROW ── */}
            <div className="ad-row">
                {/* Recent Payments */}
                <div className="card ad-card" style={{ flex: 1 }}>
                    <div className="ad-card-header">
                        <h3><DollarSign size={18} /> Recent Payments</h3>
                    </div>
                    {recentPayments && recentPayments.length > 0 ? (
                        <div className="ad-list">
                            {recentPayments.map((p, i) => (
                                <div key={i} className="ad-list-item">
                                    <div className="ad-list-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                        <DollarSign size={16} />
                                    </div>
                                    <div className="ad-list-info">
                                        <strong>{p.user?.username || p.user?.name}</strong>
                                        <small>{p.method}</small>
                                    </div>
                                    <div className="ad-list-value" style={{ color: '#10b981' }}>
                                        +${p.amount.toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="ad-empty">No recent payments</div>
                    )}
                </div>

                {/* Recent Registrations */}
                <div className="card ad-card" style={{ flex: 1 }}>
                    <div className="ad-card-header">
                        <h3><UserPlus size={18} /> Recent Registrations</h3>
                    </div>
                    {recentRegistrations && recentRegistrations.length > 0 ? (
                        <div className="ad-list">
                            {recentRegistrations.map((u, i) => (
                                <div key={i} className="ad-list-item">
                                    <div className="ad-list-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
                                        <Users size={16} />
                                    </div>
                                    <div className="ad-list-info">
                                        <strong>{u.username}</strong>
                                        <small>{u.email}</small>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span className={`badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>{u.status}</span>
                                        <br />
                                        <small style={{ color: 'var(--text-secondary)' }}>{new Date(u.createdAt).toLocaleDateString()}</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="ad-empty">No recent registrations</div>
                    )}
                </div>
            </div>

            <style>{`
                .ad-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .ad-stat-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 1.25rem;
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                    transition: all 0.25s ease;
                    position: relative;
                    overflow: hidden;
                }
                .ad-stat-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                }
                .ad-stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
                }
                .ad-stat-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .ad-stat-info {
                    flex: 1;
                    min-width: 0;
                }
                .ad-stat-label {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    display: block;
                    margin-bottom: 0.25rem;
                }
                .ad-stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    line-height: 1.2;
                    display: block;
                }
                .ad-stat-sub {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    margin-top: 0.15rem;
                }
                .ad-row {
                    display: flex;
                    gap: 1.5rem;
                    margin-bottom: 1.5rem;
                }
                @media (max-width: 768px) {
                    .ad-row { flex-direction: column; }
                }
                .ad-card {
                    padding: 1.25rem;
                    margin-bottom: 1.5rem;
                }
                .ad-card-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1rem;
                }
                .ad-card-header h3 {
                    margin: 0;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .ad-finance-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1rem;
                }
                @media (max-width: 600px) {
                    .ad-finance-grid { grid-template-columns: repeat(2, 1fr); }
                }
                .ad-finance-item {
                    text-align: center;
                    padding: 0.75rem;
                    background: var(--bg-secondary);
                    border-radius: 10px;
                }
                .ad-finance-label {
                    display: block;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.35rem;
                }
                .ad-finance-value {
                    display: block;
                    font-size: 1.35rem;
                    font-weight: 700;
                }
                .ad-health-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .ad-health-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                }
                .ad-health-item strong {
                    margin-left: auto;
                    color: var(--text-primary);
                }
                .ad-health-bar-wrap {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .ad-health-bar {
                    width: 80px;
                    height: 8px;
                    background: var(--border-color);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .ad-health-bar-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }
                .ad-chart {
                    display: flex;
                    align-items: flex-end;
                    gap: 0.5rem;
                    height: 200px;
                    padding: 0 0.5rem;
                }
                .ad-chart-col {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                }
                .ad-chart-bars {
                    flex: 1;
                    display: flex;
                    align-items: flex-end;
                    gap: 3px;
                    width: 100%;
                }
                .ad-chart-bar {
                    flex: 1;
                    border-radius: 4px 4px 0 0;
                    min-height: 4px;
                    position: relative;
                    transition: height 0.5s ease;
                }
                .ad-chart-bar.sent {
                    background: linear-gradient(180deg, #6366f1, #818cf8);
                }
                .ad-chart-bar.received {
                    background: linear-gradient(180deg, #10b981, #34d399);
                }
                .ad-chart-val {
                    position: absolute;
                    top: -18px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 0.65rem;
                    color: var(--text-secondary);
                    white-space: nowrap;
                }
                .ad-chart-label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    margin-top: 0.5rem;
                    color: var(--text-primary);
                }
                .ad-chart-sub {
                    font-size: 0.65rem;
                    color: var(--text-secondary);
                }
                .ad-chart-legend {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 1.5rem;
                    margin-top: 1rem;
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                }
                .ad-legend-dot {
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    border-radius: 3px;
                    margin-right: 0.35rem;
                    vertical-align: middle;
                }
                .ad-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .ad-list-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.65rem 0.75rem;
                    background: var(--bg-secondary);
                    border-radius: 10px;
                    transition: background 0.2s;
                }
                .ad-list-item:hover {
                    background: var(--border-color);
                }
                .ad-list-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .ad-list-info {
                    flex: 1;
                    min-width: 0;
                }
                .ad-list-info strong {
                    display: block;
                    font-size: 0.9rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .ad-list-info small {
                    color: var(--text-secondary);
                    font-size: 0.75rem;
                }
                .ad-list-value {
                    font-weight: 700;
                    font-size: 0.95rem;
                    flex-shrink: 0;
                }
                .ad-empty {
                    text-align: center;
                    color: var(--text-secondary);
                    padding: 2rem;
                    font-size: 0.9rem;
                }
            `}</style>
        </div>
    );
};

// Reusable stat card component
const StatCard = ({ icon: Icon, label, value, sub, color }) => (
    <div className="ad-stat-card" style={{ borderTop: `3px solid ${color}` }}>
        <div className="ad-stat-icon" style={{ background: `${color}18`, color }}>
            <Icon size={22} />
        </div>
        <div className="ad-stat-info">
            <span className="ad-stat-label">{label}</span>
            <span className="ad-stat-value">{value}</span>
            {sub && <span className="ad-stat-sub">{sub}</span>}
        </div>
    </div>
);

export default AdminDashboard;

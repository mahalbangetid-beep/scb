import { useState, useEffect } from 'react'
import {
    BarChart3, TrendingUp, Package, MessageSquare,
    DollarSign, Users, Calendar, RefreshCw, Loader2,
    CheckCircle2, Clock, XCircle, AlertCircle
} from 'lucide-react'
import api from '../services/api'

export default function Reports() {
    const [loading, setLoading] = useState(true)
    const [dashboard, setDashboard] = useState(null)
    const [orderStats, setOrderStats] = useState(null)
    const [commandStats, setCommandStats] = useState(null)
    const [creditStats, setCreditStats] = useState(null)
    const [activeTab, setActiveTab] = useState('overview')
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [dashboardRes, ordersRes, commandsRes, creditsRes] = await Promise.all([
                api.get('/reports/dashboard'),
                api.get('/reports/orders'),
                api.get('/reports/commands'),
                api.get('/reports/credits')
            ])
            setDashboard(dashboardRes)
            setOrderStats(ordersRes)
            setCommandStats(commandsRes)
            setCreditStats(creditsRes)
        } catch (err) {
            console.error('Failed to fetch reports:', err)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (amount) => `$${(amount || 0).toFixed(2)}`

    const getStatusColor = (status) => {
        const colors = {
            COMPLETED: '#22c55e',
            PENDING: '#fbbf24',
            IN_PROGRESS: '#3b82f6',
            PROCESSING: '#3b82f6',
            CANCELLED: '#ef4444',
            REFUNDED: '#ef4444',
            SUCCESS: '#22c55e',
            FAILED: '#ef4444'
        }
        return colors[status] || '#6b7280'
    }

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading reports...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Reports & Analytics</h1>
                    <p className="page-subtitle">View your usage statistics and performance metrics</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={18} />
                    Refresh
                </button>
            </div>

            {/* Overview Stats */}
            <div className="stats-grid">
                <div className="stat-card gradient-primary">
                    <div className="stat-icon">
                        <Package size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{dashboard?.orders?.total || 0}</span>
                        <span className="stat-label">Total Orders</span>
                    </div>
                    <div className="stat-footer">
                        <span className="stat-today">+{dashboard?.orders?.today || 0} today</span>
                    </div>
                </div>

                <div className="stat-card gradient-success">
                    <div className="stat-icon">
                        <CheckCircle2 size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{dashboard?.orders?.successRate || 0}%</span>
                        <span className="stat-label">Success Rate</span>
                    </div>
                    <div className="stat-footer">
                        <span>{dashboard?.orders?.completed || 0} completed</span>
                    </div>
                </div>

                <div className="stat-card gradient-info">
                    <div className="stat-icon">
                        <MessageSquare size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{dashboard?.commands?.total || 0}</span>
                        <span className="stat-label">Bot Commands</span>
                    </div>
                    <div className="stat-footer">
                        <span className="stat-today">+{dashboard?.commands?.today || 0} today</span>
                    </div>
                </div>

                <div className="stat-card gradient-warning">
                    <div className="stat-icon">
                        <DollarSign size={24} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{formatCurrency(dashboard?.credit?.balance)}</span>
                        <span className="stat-label">Current Balance</span>
                    </div>
                    <div className="stat-footer">
                        <span>{formatCurrency(dashboard?.credit?.monthlySpent)} spent this month</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    <BarChart3 size={16} />
                    Overview
                </button>
                <button
                    className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
                    onClick={() => setActiveTab('orders')}
                >
                    <Package size={16} />
                    Orders
                </button>
                <button
                    className={`tab ${activeTab === 'commands' ? 'active' : ''}`}
                    onClick={() => setActiveTab('commands')}
                >
                    <MessageSquare size={16} />
                    Commands
                </button>
                <button
                    className={`tab ${activeTab === 'credits' ? 'active' : ''}`}
                    onClick={() => setActiveTab('credits')}
                >
                    <DollarSign size={16} />
                    Credits
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="reports-grid">
                    {/* Order Status Breakdown */}
                    <div className="report-card">
                        <h3>Order Status Breakdown</h3>
                        <div className="status-bars">
                            {orderStats?.byStatus?.map(item => (
                                <div key={item.status} className="status-bar-item">
                                    <div className="status-bar-header">
                                        <span className="status-name">{item.status}</span>
                                        <span className="status-count">{item.count}</span>
                                    </div>
                                    <div className="status-bar">
                                        <div
                                            className="status-bar-fill"
                                            style={{
                                                width: `${(item.count / (dashboard?.orders?.total || 1)) * 100}%`,
                                                backgroundColor: getStatusColor(item.status)
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Command Types */}
                    <div className="report-card">
                        <h3>Command Types</h3>
                        <div className="pie-chart-placeholder">
                            {commandStats?.byCommand?.map(item => (
                                <div key={item.command} className="command-item">
                                    <span className="command-name">{item.command}</span>
                                    <span className="command-count">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Resources */}
                    <div className="report-card">
                        <h3>Active Resources</h3>
                        <div className="resources-grid">
                            <div className="resource-item">
                                <div className="resource-icon online">
                                    <Users size={20} />
                                </div>
                                <div className="resource-info">
                                    <span className="resource-value">{dashboard?.resources?.connectedDevices || 0}</span>
                                    <span className="resource-label">Connected Devices</span>
                                </div>
                            </div>
                            <div className="resource-item">
                                <div className="resource-icon active">
                                    <Package size={20} />
                                </div>
                                <div className="resource-info">
                                    <span className="resource-value">{dashboard?.resources?.activePanels || 0}</span>
                                    <span className="resource-label">Active Panels</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Orders Tab */}
            {activeTab === 'orders' && (
                <div className="reports-grid">
                    <div className="report-card full-width">
                        <h3>Orders by Panel</h3>
                        <div className="panel-stats">
                            {orderStats?.byPanel?.length === 0 ? (
                                <p className="empty-text">No order data available</p>
                            ) : (
                                orderStats?.byPanel?.map(item => (
                                    <div key={item.panelId} className="panel-stat-item">
                                        <div className="panel-info">
                                            <span className="panel-alias">{item.panelAlias}</span>
                                            <span className="panel-order-count">{item.count} orders</span>
                                        </div>
                                        <div className="panel-bar">
                                            <div
                                                className="panel-bar-fill"
                                                style={{
                                                    width: `${(item.count / (dashboard?.orders?.total || 1)) * 100}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="report-card">
                        <h3>Order Summary</h3>
                        <div className="summary-list">
                            <div className="summary-item">
                                <span>Total Orders</span>
                                <span className="value">{dashboard?.orders?.total || 0}</span>
                            </div>
                            <div className="summary-item">
                                <span>This Month</span>
                                <span className="value">{dashboard?.orders?.thisMonth || 0}</span>
                            </div>
                            <div className="summary-item">
                                <span>Today</span>
                                <span className="value">{dashboard?.orders?.today || 0}</span>
                            </div>
                            <div className="summary-item success">
                                <span>Completed</span>
                                <span className="value">{dashboard?.orders?.completed || 0}</span>
                            </div>
                            <div className="summary-item warning">
                                <span>Pending</span>
                                <span className="value">{dashboard?.orders?.pending || 0}</span>
                            </div>
                            <div className="summary-item danger">
                                <span>Failed/Cancelled</span>
                                <span className="value">{dashboard?.orders?.failed || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Commands Tab */}
            {activeTab === 'commands' && (
                <div className="reports-grid">
                    <div className="report-card">
                        <h3>Command Statistics</h3>
                        <div className="command-stats">
                            {commandStats?.byCommand?.map(item => (
                                <div key={item.command} className="command-stat-item">
                                    <div className="command-icon">
                                        <MessageSquare size={18} />
                                    </div>
                                    <span className="command-label">{item.command}</span>
                                    <span className="command-value">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="report-card">
                        <h3>Command Status</h3>
                        <div className="status-stats">
                            {commandStats?.byStatus?.map(item => (
                                <div key={item.status} className="status-stat-item">
                                    <span
                                        className="status-dot"
                                        style={{ backgroundColor: getStatusColor(item.status) }}
                                    />
                                    <span className="status-label">{item.status}</span>
                                    <span className="status-value">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="report-card full-width">
                        <h3>Recent Commands</h3>
                        <div className="recent-commands">
                            {commandStats?.recent?.length === 0 ? (
                                <p className="empty-text">No recent commands</p>
                            ) : (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Order ID</th>
                                            <th>Command</th>
                                            <th>Panel</th>
                                            <th>Status</th>
                                            <th>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {commandStats?.recent?.map(cmd => (
                                            <tr key={cmd.id}>
                                                <td>{cmd.orderId || '-'}</td>
                                                <td><span className="badge">{cmd.command}</span></td>
                                                <td>{cmd.panelAlias || '-'}</td>
                                                <td>
                                                    <span
                                                        className="status-badge"
                                                        style={{
                                                            backgroundColor: `${getStatusColor(cmd.status)}20`,
                                                            color: getStatusColor(cmd.status)
                                                        }}
                                                    >
                                                        {cmd.status}
                                                    </span>
                                                </td>
                                                <td>{new Date(cmd.createdAt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Credits Tab */}
            {activeTab === 'credits' && (
                <div className="reports-grid">
                    <div className="report-card">
                        <h3>Credit Summary</h3>
                        <div className="credit-summary">
                            <div className="credit-stat credit">
                                <span className="label">Total Deposited</span>
                                <span className="value">{formatCurrency(creditStats?.summary?.totalCredit)}</span>
                            </div>
                            <div className="credit-stat debit">
                                <span className="label">Total Spent</span>
                                <span className="value">{formatCurrency(creditStats?.summary?.totalDebit)}</span>
                            </div>
                            <div className="credit-stat">
                                <span className="label">Deposit Count</span>
                                <span className="value">{creditStats?.summary?.creditCount || 0}</span>
                            </div>
                            <div className="credit-stat">
                                <span className="label">Transaction Count</span>
                                <span className="value">{creditStats?.summary?.debitCount || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="report-card">
                        <h3>Spending by Category</h3>
                        <div className="category-stats">
                            {creditStats?.byCategory?.length === 0 ? (
                                <p className="empty-text">No spending data</p>
                            ) : (
                                creditStats?.byCategory?.map(cat => (
                                    <div key={cat.category} className="category-item">
                                        <span className="category-name">{cat.category}</span>
                                        <span className="category-amount">{formatCurrency(cat.amount)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="report-card full-width">
                        <h3>Recent Transactions</h3>
                        <div className="transactions-list">
                            {creditStats?.recent?.map(tx => (
                                <div key={tx.id} className="transaction-item">
                                    <div className={`tx-type ${tx.type.toLowerCase()}`}>
                                        {tx.type === 'CREDIT' ? '+' : '-'}
                                    </div>
                                    <div className="tx-info">
                                        <span className="tx-desc">{tx.description}</span>
                                        <span className="tx-date">{new Date(tx.createdAt).toLocaleString()}</span>
                                    </div>
                                    <span className={`tx-amount ${tx.type.toLowerCase()}`}>
                                        {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: var(--spacing-lg);
                    margin-bottom: var(--spacing-xl);
                }

                @media (max-width: 1024px) {
                    .stats-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 640px) {
                    .stats-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .stat-card {
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .gradient-primary {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                }

                .gradient-success {
                    background: linear-gradient(135deg, #22c55e, #15803d);
                }

                .gradient-info {
                    background: linear-gradient(135deg, #06b6d4, #0284c7);
                }

                .gradient-warning {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                }

                .stat-icon {
                    opacity: 0.8;
                }

                .stat-content {
                    display: flex;
                    flex-direction: column;
                }

                .stat-value {
                    font-size: 1.75rem;
                    font-weight: 700;
                }

                .stat-label {
                    opacity: 0.9;
                    font-size: 0.875rem;
                }

                .stat-footer {
                    margin-top: auto;
                    opacity: 0.8;
                    font-size: 0.75rem;
                }

                .tabs {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                    overflow-x: auto;
                }

                .tab {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    white-space: nowrap;
                }

                .tab:hover {
                    color: var(--text-primary);
                }

                .tab.active {
                    color: var(--primary-500);
                    border-bottom-color: var(--primary-500);
                }

                .reports-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-lg);
                }

                @media (max-width: 768px) {
                    .reports-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .report-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                }

                .report-card.full-width {
                    grid-column: span 2;
                }

                @media (max-width: 768px) {
                    .report-card.full-width {
                        grid-column: span 1;
                    }
                }

                .report-card h3 {
                    margin-bottom: var(--spacing-md);
                    font-size: 1rem;
                }

                .status-bars {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .status-bar-item {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .status-bar-header {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.875rem;
                }

                .status-bar {
                    height: 8px;
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .status-bar-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }

                .command-item, .category-item {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-color);
                }

                .command-item:last-child, .category-item:last-child {
                    border-bottom: none;
                }

                .resources-grid {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .resource-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .resource-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .resource-icon.online {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .resource-icon.active {
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }

                .resource-info {
                    display: flex;
                    flex-direction: column;
                }

                .resource-value {
                    font-size: 1.25rem;
                    font-weight: 600;
                }

                .resource-label {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .summary-list {
                    display: flex;
                    flex-direction: column;
                }

                .summary-item {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-color);
                }

                .summary-item .value {
                    font-weight: 600;
                }

                .summary-item.success .value {
                    color: #22c55e;
                }

                .summary-item.warning .value {
                    color: #fbbf24;
                }

                .summary-item.danger .value {
                    color: #ef4444;
                }

                .command-stats, .status-stats {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .command-stat-item, .status-stat-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .command-stat-item .command-label,
                .status-stat-item .status-label {
                    flex: 1;
                }

                .command-stat-item .command-value,
                .status-stat-item .status-value {
                    font-weight: 600;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .data-table th, .data-table td {
                    padding: var(--spacing-sm) var(--spacing-md);
                    text-align: left;
                    border-bottom: 1px solid var(--border-color);
                }

                .data-table th {
                    font-weight: 500;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .badge {
                    padding: 2px 8px;
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-500);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .status-badge {
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .credit-summary {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-md);
                }

                .credit-stat {
                    padding: var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .credit-stat .label {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .credit-stat .value {
                    font-size: 1.25rem;
                    font-weight: 600;
                }

                .credit-stat.credit .value {
                    color: #22c55e;
                }

                .credit-stat.debit .value {
                    color: #ef4444;
                }

                .transactions-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .transaction-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-sm);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .tx-type {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                }

                .tx-type.credit {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .tx-type.debit {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .tx-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .tx-desc {
                    font-weight: 500;
                }

                .tx-date {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .tx-amount {
                    font-weight: 600;
                }

                .tx-amount.credit {
                    color: #22c55e;
                }

                .tx-amount.debit {
                    color: #ef4444;
                }

                .empty-text {
                    color: var(--text-secondary);
                    text-align: center;
                    padding: var(--spacing-lg);
                }

                .panel-stats {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .panel-stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .panel-info {
                    display: flex;
                    justify-content: space-between;
                }

                .panel-alias {
                    font-weight: 500;
                }

                .panel-order-count {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .panel-bar {
                    height: 8px;
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .panel-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--primary-500), var(--primary-400));
                    border-radius: 4px;
                }
            `}</style>
        </div>
    )
}

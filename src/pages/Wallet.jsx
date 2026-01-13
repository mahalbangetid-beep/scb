import { useState, useEffect } from 'react'
import {
    Wallet, CreditCard, ArrowUpRight, ArrowDownLeft,
    Gift, Clock, CheckCircle2, XCircle, AlertCircle,
    Plus, Loader2, X, RefreshCw, DollarSign, TrendingUp
} from 'lucide-react'
import api from '../services/api'

export default function WalletPage() {
    const [walletInfo, setWalletInfo] = useState(null)
    const [summary, setSummary] = useState(null)
    const [transactions, setTransactions] = useState([])
    const [payments, setPayments] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('overview')
    const [showTopUpModal, setShowTopUpModal] = useState(false)
    const [showVoucherModal, setShowVoucherModal] = useState(false)
    const [topUpForm, setTopUpForm] = useState({ amount: '', method: 'BANK_TRANSFER' })
    const [voucherCode, setVoucherCode] = useState('')
    const [formLoading, setFormLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [walletRes, summaryRes, txRes, payRes] = await Promise.all([
                api.get('/wallet'),
                api.get('/wallet/summary'),
                api.get('/wallet/transactions?limit=10'),
                api.get('/wallet/payments?limit=10')
            ])
            // API returns { success, message, data } - extract .data
            setWalletInfo(walletRes.data || walletRes)
            setSummary(summaryRes.data || summaryRes)
            setTransactions(txRes.data || [])
            setPayments(payRes.data || [])
        } catch (err) {
            setError(err.message || 'Failed to load wallet data')
        } finally {
            setLoading(false)
        }
    }

    const handleTopUp = async (e) => {
        e.preventDefault()
        if (!topUpForm.amount || parseFloat(topUpForm.amount) <= 0) {
            setError('Please enter a valid amount')
            return
        }

        setFormLoading(true)
        setError(null)

        try {
            await api.post('/wallet/payments', {
                amount: parseFloat(topUpForm.amount),
                method: topUpForm.method
            })
            setSuccess('Payment request created! Please complete the payment.')
            setShowTopUpModal(false)
            setTopUpForm({ amount: '', method: 'BANK_TRANSFER' })
            fetchData()
            // Dispatch event to refresh sidebar
            window.dispatchEvent(new CustomEvent('user-data-updated'))
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to create payment')
        } finally {
            setFormLoading(false)
        }
    }

    const handleRedeemVoucher = async (e) => {
        e.preventDefault()
        if (!voucherCode.trim()) {
            setError('Please enter a voucher code')
            return
        }

        setFormLoading(true)
        setError(null)

        try {
            const res = await api.post('/wallet/vouchers/redeem', { code: voucherCode.trim() })
            setSuccess(res.message || `Voucher redeemed! +$${res.amount}`)
            setShowVoucherModal(false)
            setVoucherCode('')
            fetchData()
            // Dispatch event to refresh sidebar
            window.dispatchEvent(new CustomEvent('user-data-updated'))
        } catch (err) {
            setError(err.error?.message || err.message || 'Invalid voucher code')
        } finally {
            setFormLoading(false)
        }
    }

    const formatCurrency = (amount) => {
        return `$${(amount || 0).toFixed(2)}`
    }

    const getTransactionIcon = (type) => {
        return type === 'CREDIT' ? (
            <ArrowDownLeft className="text-success" size={18} />
        ) : (
            <ArrowUpRight className="text-danger" size={18} />
        )
    }

    const getPaymentStatusBadge = (status) => {
        const styles = {
            PENDING: { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', icon: Clock },
            COMPLETED: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', icon: CheckCircle2 },
            REJECTED: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', icon: XCircle }
        }
        const style = styles[status] || styles.PENDING
        const Icon = style.icon

        return (
            <span className="status-badge" style={{ background: style.bg, color: style.color }}>
                <Icon size={12} />
                {status}
            </span>
        )
    }

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading wallet...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Wallet</h1>
                    <p className="page-subtitle">Manage your credit balance and payments</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchData}>
                        <RefreshCw size={18} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <CheckCircle2 size={18} />
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={16} /></button>
                </div>
            )}

            {/* Balance Card */}
            <div className="balance-section">
                <div className="balance-card">
                    <div className="balance-header">
                        <Wallet size={24} />
                        <span>Current Balance</span>
                    </div>
                    <div className="balance-amount">
                        {formatCurrency(walletInfo?.balance)}
                    </div>
                    {walletInfo?.discountRate > 0 && (
                        <div className="discount-badge">
                            {walletInfo.discountRate}% Discount Applied
                        </div>
                    )}
                    <div className="balance-actions">
                        <button className="btn btn-primary" onClick={() => setShowTopUpModal(true)}>
                            <Plus size={18} />
                            Top Up
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowVoucherModal(true)}>
                            <Gift size={18} />
                            Redeem Voucher
                        </button>
                    </div>
                </div>

                <div className="stats-cards">
                    <div className="stat-card">
                        <div className="stat-icon">
                            <TrendingUp size={20} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-label">Today's Usage</span>
                            <span className="stat-value">{formatCurrency(walletInfo?.todayUsage)}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">
                            <DollarSign size={20} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-label">This Week</span>
                            <span className="stat-value">{formatCurrency(summary?.weekly?.amount)}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">
                            <CreditCard size={20} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-label">This Month</span>
                            <span className="stat-value">{formatCurrency(summary?.monthly?.amount)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rates Info */}
            <div className="rates-card">
                <h3>Message Rates</h3>
                <div className="rates-grid">
                    <div className="rate-item">
                        <span>WhatsApp Message</span>
                        <span className="rate-value">{formatCurrency(walletInfo?.rates?.waMessage)}</span>
                    </div>
                    <div className="rate-item">
                        <span>Telegram Message</span>
                        <span className="rate-value">{formatCurrency(walletInfo?.rates?.tgMessage)}</span>
                    </div>
                    <div className="rate-item">
                        <span>Group Message</span>
                        <span className="rate-value">{formatCurrency(walletInfo?.rates?.groupMessage)}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    Recent Activity
                </button>
                <button
                    className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('payments')}
                >
                    Payments
                </button>
            </div>

            {/* Recent Transactions */}
            {activeTab === 'overview' && (
                <div className="section">
                    <h3>Recent Transactions</h3>
                    {transactions.length === 0 ? (
                        <div className="empty-state-sm">
                            <p>No transactions yet</p>
                        </div>
                    ) : (
                        <div className="transactions-list">
                            {transactions.map(tx => (
                                <div key={tx.id} className="transaction-item">
                                    <div className="tx-icon">
                                        {getTransactionIcon(tx.type)}
                                    </div>
                                    <div className="tx-info">
                                        <span className="tx-description">{tx.description}</span>
                                        <span className="tx-date">
                                            {new Date(tx.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className={`tx-amount ${tx.type === 'CREDIT' ? 'credit' : 'debit'}`}>
                                        {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Payments */}
            {activeTab === 'payments' && (
                <div className="section">
                    <h3>Payment History</h3>
                    {payments.length === 0 ? (
                        <div className="empty-state-sm">
                            <p>No payments yet</p>
                        </div>
                    ) : (
                        <div className="payments-list">
                            {payments.map(payment => (
                                <div key={payment.id} className="payment-item">
                                    <div className="payment-icon">
                                        <CreditCard size={20} />
                                    </div>
                                    <div className="payment-info">
                                        <span className="payment-ref">{payment.reference}</span>
                                        <span className="payment-method">{payment.method}</span>
                                    </div>
                                    <div className="payment-amount">{formatCurrency(payment.amount)}</div>
                                    <div className="payment-status">
                                        {getPaymentStatusBadge(payment.status)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Top Up Modal */}
            {showTopUpModal && (
                <div className="modal-overlay open" onClick={() => setShowTopUpModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Top Up Balance</h2>
                            <button className="modal-close" onClick={() => setShowTopUpModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleTopUp}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Amount ($)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="Enter amount"
                                        value={topUpForm.amount}
                                        onChange={(e) => setTopUpForm({ ...topUpForm, amount: e.target.value })}
                                        min="1"
                                        step="0.01"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Payment Method</label>
                                    <select
                                        className="form-select"
                                        value={topUpForm.method}
                                        onChange={(e) => setTopUpForm({ ...topUpForm, method: e.target.value })}
                                    >
                                        <option value="BANK_TRANSFER">Bank Transfer</option>
                                        <option value="CRYPTO">Cryptocurrency</option>
                                        <option value="BINANCE">Binance Pay</option>
                                        <option value="CRYPTOMUS">Cryptomus</option>
                                        <option value="MANUAL">Manual Payment</option>
                                    </select>
                                </div>
                                <div className="quick-amounts">
                                    {[10, 25, 50, 100].map(amt => (
                                        <button
                                            key={amt}
                                            type="button"
                                            className="quick-amount-btn"
                                            onClick={() => setTopUpForm({ ...topUpForm, amount: amt.toString() })}
                                        >
                                            ${amt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowTopUpModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Request Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Voucher Modal */}
            {showVoucherModal && (
                <div className="modal-overlay open" onClick={() => setShowVoucherModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Redeem Voucher</h2>
                            <button className="modal-close" onClick={() => setShowVoucherModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleRedeemVoucher}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Voucher Code</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Enter voucher code"
                                        value={voucherCode}
                                        onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowVoucherModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Redeem'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .balance-section {
                    display: grid;
                    grid-template-columns: 1fr 2fr;
                    gap: var(--spacing-lg);
                    margin-bottom: var(--spacing-xl);
                }

                @media (max-width: 768px) {
                    .balance-section {
                        grid-template-columns: 1fr;
                    }
                }

                .balance-card {
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xl);
                    color: white;
                }

                .balance-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-md);
                    opacity: 0.9;
                }

                .balance-amount {
                    font-size: 2.5rem;
                    font-weight: 700;
                    margin-bottom: var(--spacing-md);
                }

                .discount-badge {
                    display: inline-block;
                    background: rgba(255, 255, 255, 0.2);
                    padding: 4px 12px;
                    border-radius: var(--radius-md);
                    font-size: 0.875rem;
                    margin-bottom: var(--spacing-lg);
                }

                .balance-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .balance-actions .btn {
                    flex: 1;
                }

                .balance-actions .btn-primary {
                    background: white;
                    color: var(--primary-600);
                    border: none;
                    font-weight: 600;
                }

                .balance-actions .btn-primary:hover {
                    background: rgba(255, 255, 255, 0.9);
                    transform: translateY(-2px);
                }

                .balance-actions .btn-secondary {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }

                .balance-actions .btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                .stats-cards {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .stat-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .stat-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(37, 211, 102, 0.1);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-500);
                }

                .stat-content {
                    display: flex;
                    flex-direction: column;
                }

                .stat-label {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .stat-value {
                    font-size: 1.25rem;
                    font-weight: 600;
                }

                .rates-card {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    margin-bottom: var(--spacing-xl);
                }

                .rates-card h3 {
                    margin-bottom: var(--spacing-md);
                }

                .rates-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--spacing-md);
                }

                @media (max-width: 768px) {
                    .rates-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .rate-item {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-color);
                }

                .rate-value {
                    font-weight: 600;
                    color: var(--primary-500);
                }

                .tabs {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                }

                .tab {
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }

                .tab:hover {
                    color: var(--text-primary);
                }

                .tab.active {
                    color: var(--primary-500);
                    border-bottom-color: var(--primary-500);
                }

                .section h3 {
                    margin-bottom: var(--spacing-md);
                }

                .transactions-list, .payments-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .transaction-item, .payment-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                }

                .tx-icon, .payment-icon {
                    width: 36px;
                    height: 36px;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .tx-info, .payment-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .tx-description, .payment-ref {
                    font-weight: 500;
                }

                .tx-date, .payment-method {
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

                .payment-amount {
                    font-weight: 600;
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .empty-state-sm {
                    padding: var(--spacing-xl);
                    text-align: center;
                    color: var(--text-secondary);
                }

                .quick-amounts {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-md);
                }

                .quick-amount-btn {
                    flex: 1;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .quick-amount-btn:hover {
                    border-color: var(--primary-500);
                    color: var(--primary-500);
                }

                .text-success {
                    color: #22c55e;
                }

                .text-danger {
                    color: #ef4444;
                }

                .alert {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .alert-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .alert-success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                }

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .header-actions {
                    display: flex;
                    gap: var(--spacing-md);
                }
            `}</style>
        </div>
    )
}

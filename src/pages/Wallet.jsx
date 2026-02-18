import { useState, useEffect } from 'react'
import {
    Wallet, CreditCard, ArrowUpRight, ArrowDownLeft,
    Gift, Clock, CheckCircle2, XCircle, AlertCircle,
    Plus, Loader2, X, RefreshCw, DollarSign, TrendingUp, Package, Star, QrCode, Copy,
    MessageSquare, Zap, Search
} from 'lucide-react'
import api from '../services/api'

export default function WalletPage() {
    const [walletInfo, setWalletInfo] = useState(null)
    const [summary, setSummary] = useState(null)
    const [transactions, setTransactions] = useState([])
    const [payments, setPayments] = useState([])
    const [creditPackages, setCreditPackages] = useState([])
    const [packageCategory, setPackageCategory] = useState('support')
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('overview')
    const [showTopUpModal, setShowTopUpModal] = useState(false)
    const [showVoucherModal, setShowVoucherModal] = useState(false)
    const [showPackagesModal, setShowPackagesModal] = useState(false)
    const [topUpForm, setTopUpForm] = useState({ amount: '', method: 'ESEWA' })
    const [voucherCode, setVoucherCode] = useState('')
    const [formLoading, setFormLoading] = useState(false)
    const [purchaseLoading, setPurchaseLoading] = useState(null)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    // Binance payment state
    const [showBinanceModal, setShowBinanceModal] = useState(false)
    const [binanceStep, setBinanceStep] = useState('amount') // 'amount', 'pay', 'verify'
    const [binanceInfo, setBinanceInfo] = useState(null)
    const [binancePayment, setBinancePayment] = useState(null)
    const [binanceAmount, setBinanceAmount] = useState('')
    const [binanceTxnId, setBinanceTxnId] = useState('')

    // Message Credits state
    const [messageCreditInfo, setMessageCreditInfo] = useState(null)

    const [billingMode, setBillingMode] = useState('CREDITS') // CREDITS or DOLLARS
    const [txSearchQuery, setTxSearchQuery] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [walletRes, summaryRes, txRes, payRes, packagesRes, creditRes, modeRes] = await Promise.all([
                api.get('/wallet'),
                api.get('/wallet/summary'),
                api.get('/wallet/transactions?limit=10'),
                api.get('/wallet/payments?limit=10'),
                api.get('/credit-packages').catch(() => ({ data: { data: [] } })),
                api.get('/message-credits/balance').catch(() => ({ data: null })),
                api.get('/billing-mode').catch(() => ({ data: { mode: 'CREDITS' } }))
            ])
            // API returns { success, message, data } - extract .data
            setWalletInfo(walletRes.data || walletRes)
            setSummary(summaryRes.data || summaryRes)
            setTransactions(txRes.data || [])
            setPayments(payRes.data || [])
            setCreditPackages(packagesRes.data || [])
            setMessageCreditInfo(creditRes.data || null)
            setBillingMode(modeRes.data?.mode || 'CREDITS')
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

        // If Binance selected, redirect to Binance flow
        if (topUpForm.method === 'BINANCE') {
            setBinanceAmount(topUpForm.amount)
            setShowTopUpModal(false)
            openBinanceModal()
            return
        }

        // If Cryptomus selected, create payment and redirect
        if (topUpForm.method === 'CRYPTOMUS') {
            setFormLoading(true)
            setError(null)
            try {
                const res = await api.post('/payments/cryptomus/create', {
                    amount: parseFloat(topUpForm.amount)
                })
                if (res.data?.paymentUrl) {
                    // Redirect to Cryptomus payment page
                    window.location.href = res.data.paymentUrl
                } else {
                    setError('Failed to initialize Cryptomus payment')
                }
            } catch (err) {
                setError(err.error?.message || err.message || 'Failed to create Cryptomus payment')
            } finally {
                setFormLoading(false)
            }
            return
        }

        // If eSewa selected, create payment and redirect
        if (topUpForm.method === 'ESEWA') {
            setFormLoading(true)
            setError(null)
            try {
                const res = await api.post('/payments/esewa/create', {
                    amount: parseFloat(topUpForm.amount)
                })
                if (res.data?.gatewayUrl && res.data?.formData) {
                    // Create form and submit to eSewa
                    const form = document.createElement('form')
                    form.method = 'POST'
                    form.action = res.data.gatewayUrl
                    Object.entries(res.data.formData).forEach(([key, value]) => {
                        const input = document.createElement('input')
                        input.type = 'hidden'
                        input.name = key
                        input.value = value
                        form.appendChild(input)
                    })
                    document.body.appendChild(form)
                    form.submit()
                } else {
                    setError('Failed to initialize eSewa payment')
                }
            } catch (err) {
                setError(err.error?.message || err.message || 'Failed to create eSewa payment')
            } finally {
                setFormLoading(false)
            }
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
            setTopUpForm({ amount: '', method: 'ESEWA' })
            fetchData()
            // Dispatch event to refresh sidebar
            window.dispatchEvent(new CustomEvent('user-data-updated'))
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to create payment')
        } finally {
            setFormLoading(false)
        }
    }

    // Binance Payment Handlers
    const openBinanceModal = async () => {
        setFormLoading(true)
        setError(null)
        try {
            const res = await api.get('/wallet/binance/info')
            if (!res.data?.available) {
                setError(res.data?.message || 'Binance payment is not available')
                return
            }
            setBinanceInfo(res.data)
            setBinanceStep('amount')
            setShowBinanceModal(true)
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to load Binance info')
        } finally {
            setFormLoading(false)
        }
    }

    const handleBinanceCreatePayment = async () => {
        if (!binanceAmount || parseFloat(binanceAmount) <= 0) {
            setError('Please enter a valid amount')
            return
        }

        setFormLoading(true)
        setError(null)
        try {
            const res = await api.post('/wallet/binance/create', {
                amount: parseFloat(binanceAmount)
            })
            setBinancePayment(res.data)
            setBinanceStep('pay')
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to create payment')
        } finally {
            setFormLoading(false)
        }
    }

    const handleBinanceVerify = async () => {
        if (!binanceTxnId.trim()) {
            setError('Please enter the Transaction ID')
            return
        }

        setFormLoading(true)
        setError(null)
        try {
            const res = await api.post('/wallet/binance/verify', {
                paymentId: binancePayment.paymentId,
                transactionId: binanceTxnId.trim()
            })
            if (res.data?.success) {
                const bonusText = res.data.bonus > 0 ? ` (+$${res.data.bonus.toFixed(2)} bonus!)` : ''
                setSuccess(`Payment verified! +$${res.data.credited.toFixed(2)}${bonusText}`)
                setShowBinanceModal(false)
                resetBinanceState()
                fetchData()
                window.dispatchEvent(new CustomEvent('user-data-updated'))
            } else {
                setError(res.data?.message || 'Verification failed')
            }
        } catch (err) {
            setError(err.error?.message || err.message || 'Verification failed')
        } finally {
            setFormLoading(false)
        }
    }

    const resetBinanceState = () => {
        setBinanceStep('amount')
        setBinanceInfo(null)
        setBinancePayment(null)
        setBinanceAmount('')
        setBinanceTxnId('')
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
        setSuccess('Copied to clipboard!')
        setTimeout(() => setSuccess(null), 2000)
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

    const handlePurchasePackage = async (packageId) => {
        // Find the package info to show in confirmation
        const pkg = creditPackages.find(p => p.id === packageId)
        if (!pkg) return

        const totalCredits = (pkg.credits || 0) + (pkg.bonusCredits || 0)
        if (!window.confirm(
            `Purchase "${pkg.name}" for $${pkg.price.toFixed(2)}?\n\n` +
            `You'll receive ${totalCredits.toLocaleString()} message credits.\n` +
            `Amount will be deducted from your wallet balance.`
        )) return

        setPurchaseLoading(packageId)
        setError(null)
        try {
            const res = await api.post(`/credit-packages/${packageId}/purchase`)
            setSuccess(res.data?.message || 'Package purchased successfully!')
            setShowPackagesModal(false)
            fetchData()
            window.dispatchEvent(new CustomEvent('user-data-updated'))
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to purchase package')
        } finally {
            setPurchaseLoading(null)
        }
    }

    const openPackagesModal = async (category = 'support') => {
        setPackageCategory(category)
        setShowPackagesModal(true)
        try {
            const res = await api.get(`/credit-packages?category=${category}`)
            setCreditPackages(res.data || [])
        } catch {
            setCreditPackages([])
        }
    }

    const handleCategoryChange = async (category) => {
        setPackageCategory(category)
        try {
            const res = await api.get(`/credit-packages?category=${category}`)
            setCreditPackages(res.data || [])
        } catch {
            setCreditPackages([])
        }
    }

    const getTransactionCategory = (description) => {
        if (!description) return null
        const d = description.toLowerCase()
        if (d.includes('system bot') || d.includes('systembot')) return { label: 'System Bot', color: '#8b5cf6' }
        if (d.includes('whatsapp') && d.includes('market')) return { label: 'WA Marketing', color: '#22c55e' }
        if (d.includes('telegram') && d.includes('market')) return { label: 'TG Marketing', color: '#0088cc' }
        if (d.includes('support')) return { label: 'Support', color: '#3b82f6' }
        if (d.includes('package') || d.includes('purchased')) return { label: 'Package', color: '#f59e0b' }
        if (d.includes('voucher')) return { label: 'Voucher', color: '#ec4899' }
        if (d.includes('payment') || d.includes('top-up') || d.includes('topup') || d.includes('deposit')) return { label: 'Top-Up', color: '#10b981' }
        if (d.includes('renewal') || d.includes('subscription')) return { label: 'Renewal', color: '#6366f1' }
        if (d.includes('device') || d.includes('number')) return { label: 'Device', color: '#f97316' }
        if (d.includes('convert') || d.includes('conversion')) return { label: 'Conversion', color: '#14b8a6' }
        return null
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
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            value={txSearchQuery}
                            onChange={(e) => setTxSearchQuery(e.target.value)}
                            style={{
                                padding: '0.5rem 0.75rem 0.5rem 34px',
                                borderRadius: 'var(--radius-md, 8px)',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '0.875rem',
                                width: '220px',
                                outline: 'none'
                            }}
                        />
                    </div>
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

            {/* Balance Card - Based on Billing Mode */}
            <div className="balance-section single-card">
                {billingMode === 'DOLLARS' ? (
                    /* DOLLARS MODE: Show Dollar Balance Card */
                    <div className="balance-card">
                        <div className="balance-header">
                            <Wallet size={24} />
                            <span>Credit Balance</span>
                        </div>
                        <div className="balance-amount">
                            {formatCurrency(walletInfo?.balance)}
                        </div>
                        {walletInfo?.discountRate > 0 && (
                            <div className="discount-badge">
                                {walletInfo.discountRate}% Discount Applied
                            </div>
                        )}
                        <div className="balance-info">
                            <small>Bot messages charged per message rate</small>
                        </div>
                        <div className="balance-actions">
                            <button className="btn btn-primary" onClick={() => setShowTopUpModal(true)}>
                                <Plus size={18} />
                                Top Up
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowVoucherModal(true)}>
                                <Gift size={18} />
                                Voucher
                            </button>
                            <button className="btn btn-secondary" onClick={() => openPackagesModal('support')}>
                                <Package size={18} />
                                Packages
                            </button>
                        </div>
                    </div>
                ) : (
                    /* CREDITS MODE: Show Message Credits Card */
                    <div className="balance-card message-credits-card">
                        <div className="balance-header">
                            <MessageSquare size={24} />
                            <span>Message Credits</span>
                            <Zap size={16} className="credits-icon" />
                        </div>
                        <div className="balance-amount credits-amount">
                            {(messageCreditInfo?.messageCredits || 0).toLocaleString()}
                            <span className="credits-label">credits</span>
                        </div>
                        <div className="credits-info">
                            <small>
                                1 credit = 1 bot message •
                                Wallet: ${walletInfo?.balance?.toFixed(2) || '0.00'}
                            </small>
                        </div>
                        <div className="balance-actions">
                            <button className="btn btn-primary" onClick={() => setShowTopUpModal(true)}>
                                <Plus size={18} />
                                Top Up
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowVoucherModal(true)}>
                                <Gift size={18} />
                                Voucher
                            </button>
                            <button className="btn btn-secondary" onClick={() => openPackagesModal('support')}>
                                <Package size={18} />
                                Packages
                            </button>
                        </div>
                        {messageCreditInfo?.canSendMessages !== undefined && (
                            <div className="credits-estimate">
                                Can send ~{messageCreditInfo.canSendMessages.toLocaleString()} more messages
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Stats Cards - Based on Billing Mode */}
            {billingMode === 'DOLLARS' ? (
                /* DOLLARS MODE: Show dollar-based stats */
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
            ) : (
                /* CREDITS MODE: Show credits-based stats */
                <div className="stats-cards credits-stats">
                    <div className="stat-card">
                        <div className="stat-icon credits-icon-bg">
                            <MessageSquare size={20} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-label">Credits Used Today</span>
                            <span className="stat-value">{messageCreditInfo?.todayUsage || 0} credits</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon credits-icon-bg">
                            <Zap size={20} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-label">Messages Remaining</span>
                            <span className="stat-value">{(messageCreditInfo?.messageCredits || 0).toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon credits-icon-bg">
                            <DollarSign size={20} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-label">Wallet Balance</span>
                            <span className="stat-value">{formatCurrency(walletInfo?.balance)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Rates Info - Only show for DOLLARS mode */}
            {billingMode === 'DOLLARS' && (
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
            )}

            {/* Credits Info - Only show for CREDITS mode */}
            {billingMode === 'CREDITS' && (
                <div className="rates-card credits-info-card">
                    <h3>Message Credits</h3>
                    <div className="rates-grid">
                        <div className="rate-item">
                            <span>Cost per Message</span>
                            <span className="rate-value">1 credit</span>
                        </div>
                        <div className="rate-item">
                            <span>Your Credits</span>
                            <span className="rate-value">{(messageCreditInfo?.messageCredits || 0).toLocaleString()}</span>
                        </div>
                        <div className="rate-item">
                            <span>Buy More</span>
                            <span className="rate-value">Top Up → Buy Packages</span>
                        </div>
                    </div>
                </div>
            )}

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
            {
                activeTab === 'overview' && (
                    <div className="section">
                        <h3>Recent Transactions</h3>
                        {transactions.length === 0 ? (
                            <div className="empty-state-sm">
                                <p>No transactions yet</p>
                            </div>
                        ) : (
                            <div className="transactions-list">
                                {transactions
                                    .filter(tx => {
                                        if (!txSearchQuery.trim()) return true;
                                        const q = txSearchQuery.toLowerCase();
                                        return (tx.description || '').toLowerCase().includes(q) ||
                                            (tx.type || '').toLowerCase().includes(q);
                                    })
                                    .map(tx => (
                                        <div key={tx.id} className="transaction-item">
                                            <div className="tx-icon">
                                                {getTransactionIcon(tx.type)}
                                            </div>
                                            <div className="tx-info">
                                                <span className="tx-description">
                                                    {tx.description}
                                                    {(() => {
                                                        const cat = getTransactionCategory(tx.description)
                                                        if (!cat) return null
                                                        return (
                                                            <span className="tx-category-badge" style={{ background: `${cat.color}20`, color: cat.color, padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 600, marginLeft: '6px', verticalAlign: 'middle' }}>
                                                                {cat.label}
                                                            </span>
                                                        )
                                                    })()}
                                                </span>
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
                )
            }

            {/* Payments */}
            {
                activeTab === 'payments' && (
                    <div className="section">
                        <h3>Payment History</h3>
                        {payments.length === 0 ? (
                            <div className="empty-state-sm">
                                <p>No payments yet</p>
                            </div>
                        ) : (
                            <div className="payments-list">
                                {payments
                                    .filter(p => {
                                        if (!txSearchQuery.trim()) return true;
                                        const q = txSearchQuery.toLowerCase();
                                        return (p.reference || '').toLowerCase().includes(q) ||
                                            (p.method || '').toLowerCase().includes(q) ||
                                            (p.status || '').toLowerCase().includes(q);
                                    })
                                    .map(payment => (
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
                )
            }

            {/* Top Up Modal */}
            {
                showTopUpModal && (
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
                                            <option value="ESEWA">eSewa (Nepal)</option>
                                            <option value="BINANCE">Binance (Crypto)</option>
                                            <option value="CRYPTOMUS">Cryptomus (Crypto)</option>
                                            <option value="BANK_TRANSFER">Bank Transfer</option>
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
                )
            }

            {/* Voucher Modal */}
            {
                showVoucherModal && (
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
                )
            }

            {/* Credit Packages Modal */}
            {
                showPackagesModal && (
                    <div className="modal-overlay open" onClick={() => setShowPackagesModal(false)}>
                        <div className="modal packages-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Buy Message Packages</h2>
                                <button className="modal-close" onClick={() => setShowPackagesModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                {/* Category Tabs */}
                                <div className="pkg-category-tabs">
                                    <button
                                        className={`pkg-cat-tab ${packageCategory === 'support' ? 'active' : ''}`}
                                        onClick={() => handleCategoryChange('support')}
                                    >
                                        💬 Support Messages
                                    </button>
                                    <button
                                        className={`pkg-cat-tab ${packageCategory === 'whatsapp_marketing' ? 'active' : ''}`}
                                        onClick={() => handleCategoryChange('whatsapp_marketing')}
                                    >
                                        📱 WhatsApp Marketing
                                    </button>
                                    <button
                                        className={`pkg-cat-tab ${packageCategory === 'telegram_marketing' ? 'active' : ''}`}
                                        onClick={() => handleCategoryChange('telegram_marketing')}
                                    >
                                        ✈️ Telegram Marketing
                                    </button>
                                </div>

                                {/* Notice Banner */}
                                {packageCategory === 'support' && (
                                    <div className="pkg-notice">
                                        <AlertCircle size={16} />
                                        <span>Support packages are for <strong>customer support messages only</strong>, not for marketing purposes.</span>
                                    </div>
                                )}
                                {packageCategory === 'whatsapp_marketing' && (
                                    <div className="pkg-notice pkg-notice-green">
                                        <AlertCircle size={16} />
                                        <span>These packages are for <strong>WhatsApp bulk marketing</strong> messages via bot broadcasting.</span>
                                    </div>
                                )}
                                {packageCategory === 'telegram_marketing' && (
                                    <div className="pkg-notice pkg-notice-blue">
                                        <AlertCircle size={16} />
                                        <span>These packages are for <strong>Telegram marketing</strong> messages via bot broadcasting.</span>
                                    </div>
                                )}

                                <div className="packages-grid-modal">
                                    {creditPackages.length === 0 ? (
                                        <div className="empty-state-sm" style={{ gridColumn: '1 / -1' }}>
                                            <p>No packages available in this category</p>
                                        </div>
                                    ) : (
                                        creditPackages.map(pkg => (
                                            <div key={pkg.id} className={`package-card-modal ${pkg.isFeatured ? 'featured' : ''}`}>
                                                {pkg.isFeatured && (
                                                    <div className="featured-ribbon">
                                                        <Star size={12} /> Popular
                                                    </div>
                                                )}
                                                <div className="pkg-name">{pkg.name}</div>
                                                <div className="pkg-price">${pkg.price}</div>
                                                <div className="pkg-credits">
                                                    <strong>{pkg.credits.toLocaleString()}</strong> credits
                                                    {pkg.bonusCredits > 0 && (
                                                        <span className="pkg-bonus">+{pkg.bonusCredits.toLocaleString()} bonus</span>
                                                    )}
                                                </div>
                                                {pkg.description && (
                                                    <p className="pkg-desc">{pkg.description}</p>
                                                )}
                                                <button
                                                    className="btn btn-primary btn-block"
                                                    onClick={() => handlePurchasePackage(pkg.id)}
                                                    disabled={purchaseLoading === pkg.id || (walletInfo?.balance || 0) < pkg.price}
                                                >
                                                    {purchaseLoading === pkg.id ? (
                                                        <Loader2 className="animate-spin" size={18} />
                                                    ) : (walletInfo?.balance || 0) < pkg.price ? (
                                                        'Insufficient Balance'
                                                    ) : (
                                                        'Purchase'
                                                    )}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Binance Payment Modal */}
            {
                showBinanceModal && binanceInfo && (
                    <div className="modal-overlay open" onClick={() => { setShowBinanceModal(false); resetBinanceState(); }}>
                        <div className="modal binance-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header binance-header">
                                <div className="binance-title">
                                    <span className="binance-icon">💎</span>
                                    <h2>{binanceInfo.name || 'Binance Payment'}</h2>
                                </div>
                                <button className="modal-close" onClick={() => { setShowBinanceModal(false); resetBinanceState(); }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                {binanceStep === 'amount' && (
                                    <div className="binance-step">
                                        <div className="form-group">
                                            <label className="form-label">Amount ({binanceInfo.currency})</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                placeholder={`Min: $${binanceInfo.minAmount}`}
                                                value={binanceAmount}
                                                onChange={(e) => setBinanceAmount(e.target.value)}
                                                min={binanceInfo.minAmount}
                                                step="0.01"
                                            />
                                        </div>
                                        {binanceInfo.bonus > 0 && (
                                            <div className="binance-bonus-badge">
                                                🎁 {binanceInfo.bonus}% Bonus on this payment!
                                            </div>
                                        )}
                                        <div className="quick-amounts">
                                            {[10, 25, 50, 100, 250, 500].map(amt => (
                                                <button
                                                    key={amt}
                                                    type="button"
                                                    className="quick-amount-btn"
                                                    onClick={() => setBinanceAmount(amt.toString())}
                                                >
                                                    ${amt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {binanceStep === 'pay' && binancePayment && (
                                    <div className="binance-step binance-pay-step">
                                        <div className="binance-qr-section">
                                            {binanceInfo.qrUrl ? (
                                                <img src={binanceInfo.qrUrl} alt="Binance QR" className="binance-qr-image" />
                                            ) : (
                                                <div className="binance-qr-placeholder">
                                                    <QrCode size={80} />
                                                    <p>QR Code not configured</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="binance-pay-info">
                                            <div className="binance-amount-display">
                                                <span>Send exactly:</span>
                                                <strong>{binancePayment.amount} {binancePayment.currency}</strong>
                                            </div>
                                            <div className="binance-instructions">
                                                {binanceInfo.instructions?.map((inst, i) => (
                                                    <p key={i}>{inst}</p>
                                                ))}
                                            </div>
                                            <div className="binance-ref">
                                                <span>Reference: </span>
                                                <code>{binancePayment.reference}</code>
                                                <button type="button" className="copy-btn" onClick={() => copyToClipboard(binancePayment.reference)}>
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="form-group" style={{ marginTop: '1rem' }}>
                                            <label className="form-label">Transaction ID / Order ID</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Paste your Binance Transaction ID here"
                                                value={binanceTxnId}
                                                onChange={(e) => setBinanceTxnId(e.target.value)}
                                            />
                                            <small className="form-hint">Find this in your Binance transaction history after payment</small>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => { setShowBinanceModal(false); resetBinanceState(); }}
                                >
                                    Cancel
                                </button>
                                {binanceStep === 'amount' && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleBinanceCreatePayment}
                                        disabled={formLoading || !binanceAmount || parseFloat(binanceAmount) < binanceInfo.minAmount}
                                    >
                                        {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Continue to Payment'}
                                    </button>
                                )}
                                {binanceStep === 'pay' && (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleBinanceVerify}
                                        disabled={formLoading || !binanceTxnId.trim()}
                                    >
                                        {formLoading ? <Loader2 className="animate-spin" size={18} /> : 'Verify Payment'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <style>{`
                .balance-section {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-lg);
                    margin-bottom: var(--spacing-xl);
                }

                .balance-section.single-card {
                    grid-template-columns: 1fr;
                    max-width: 500px;
                }

                @media (max-width: 768px) {
                    .balance-section {
                        grid-template-columns: 1fr;
                    }
                    .balance-section.single-card {
                        max-width: 100%;
                    }
                }

                .balance-info {
                    opacity: 0.8;
                    margin-bottom: var(--spacing-md);
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

                /* Message Credits Card */
                .message-credits-card {
                    background: linear-gradient(135deg, #10b981, #059669);
                }

                .credits-icon {
                    color: #fbbf24;
                    margin-left: auto;
                }

                .credits-amount {
                    display: flex;
                    align-items: baseline;
                    gap: var(--spacing-sm);
                }

                .credits-label {
                    font-size: 1rem;
                    opacity: 0.8;
                }

                .credits-info {
                    opacity: 0.8;
                    margin-bottom: var(--spacing-md);
                }

                .credits-estimate {
                    margin-top: var(--spacing-md);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: var(--radius-md);
                    font-size: 0.875rem;
                    text-align: center;
                }

                /* Credits Mode Stats */
                .credits-stats .stat-card {
                    border-left: 3px solid #10b981;
                }

                .credits-icon-bg {
                    background: rgba(16, 185, 129, 0.15) !important;
                    color: #10b981 !important;
                }

                .credits-info-card {
                    border-left: 3px solid #10b981;
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), transparent);
                }

                .credits-info-card h3 {
                    color: #10b981;
                }

                .stats-cards {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                @media (max-width: 768px) {
                    .stats-cards {
                        grid-template-columns: 1fr;
                    }
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

                .packages-modal {
                    max-width: 800px;
                    width: 92%;
                }

                .modal-subtitle {
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-lg);
                }

                .pkg-category-tabs {
                    display: flex;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: var(--spacing-sm);
                }

                .pkg-cat-tab {
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                    font-size: 0.85rem;
                    white-space: nowrap;
                    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
                }

                .pkg-cat-tab:hover {
                    color: var(--text-primary);
                    background: var(--bg-tertiary);
                }

                .pkg-cat-tab.active {
                    color: var(--primary-500);
                    border-bottom-color: var(--primary-500);
                    font-weight: 600;
                }

                .pkg-notice {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: rgba(59, 130, 246, 0.08);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                    font-size: 0.825rem;
                    color: #3b82f6;
                    line-height: 1.4;
                }

                .pkg-notice-green {
                    background: rgba(34, 197, 94, 0.08);
                    border-color: rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                }

                .pkg-notice-blue {
                    background: rgba(0, 136, 204, 0.08);
                    border-color: rgba(0, 136, 204, 0.2);
                    color: #0088cc;
                }

                @media (max-width: 600px) {
                    .pkg-category-tabs {
                        flex-wrap: wrap;
                    }
                    .pkg-cat-tab {
                        font-size: 0.75rem;
                        padding: var(--spacing-xs) var(--spacing-sm);
                    }
                }

                .packages-grid-modal {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: var(--spacing-md);
                }

                .package-card-modal {
                    background: var(--bg-tertiary);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    position: relative;
                    text-align: center;
                    transition: all 0.2s;
                }

                .package-card-modal:hover {
                    border-color: var(--primary-500);
                }

                .package-card-modal.featured {
                    border-color: #f59e0b;
                    background: linear-gradient(135deg, rgba(245, 158, 11, 0.05), transparent);
                }

                .featured-ribbon {
                    position: absolute;
                    top: -8px;
                    right: 10px;
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    color: white;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 0.7rem;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .pkg-name {
                    font-weight: 600;
                    font-size: 1rem;
                    margin-bottom: var(--spacing-xs);
                }

                .pkg-price {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: var(--primary-500);
                    margin-bottom: var(--spacing-xs);
                }

                .pkg-credits {
                    font-size: 0.9rem;
                    margin-bottom: var(--spacing-sm);
                }

                .pkg-bonus {
                    display: block;
                    color: #22c55e;
                    font-size: 0.8rem;
                }

                .pkg-desc {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-md);
                }

                .btn-block {
                    width: 100%;
                }

                /* Binance Modal Styles */
                .binance-modal {
                    max-width: 480px;
                }

                .binance-header {
                    background: linear-gradient(135deg, #F0B90B, #d4a00a);
                    color: #1E2026;
                }

                .binance-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .binance-icon {
                    font-size: 1.5rem;
                }

                .binance-title h2 {
                    margin: 0;
                    color: #1E2026;
                }

                .binance-step {
                    text-align: center;
                }

                .binance-bonus-badge {
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05));
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin: var(--spacing-md) 0;
                    font-weight: 500;
                }

                .binance-pay-step {
                    text-align: left;
                }

                .binance-qr-section {
                    display: flex;
                    justify-content: center;
                    margin-bottom: var(--spacing-lg);
                }

                .binance-qr-image {
                    max-width: 200px;
                    border-radius: var(--radius-md);
                    border: 3px solid #F0B90B;
                }

                .binance-qr-placeholder {
                    width: 200px;
                    height: 200px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-tertiary);
                    border: 2px dashed var(--border-color);
                    border-radius: var(--radius-md);
                    color: var(--text-secondary);
                }

                .binance-pay-info {
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                }

                .binance-amount-display {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-color);
                    margin-bottom: var(--spacing-sm);
                }

                .binance-amount-display strong {
                    font-size: 1.25rem;
                    color: #F0B90B;
                }

                .binance-instructions {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .binance-instructions p {
                    margin: var(--spacing-xs) 0;
                }

                .binance-ref {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-sm);
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                    font-size: 0.875rem;
                }

                .binance-ref code {
                    background: var(--bg-secondary);
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-family: monospace;
                    flex: 1;
                }

                .copy-btn {
                    background: none;
                    border: none;
                    color: var(--primary-500);
                    cursor: pointer;
                    padding: 4px;
                    transition: transform 0.2s;
                }

                .copy-btn:hover {
                    transform: scale(1.1);
                }

                .form-hint {
                    display: block;
                    margin-top: var(--spacing-xs);
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }
            `}</style>
        </div >
    )
}

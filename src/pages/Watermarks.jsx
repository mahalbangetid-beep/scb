import { useState, useEffect } from 'react'
import {
    Fingerprint,
    Search,
    Shield,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Loader2,
    RefreshCw,
    Clock,
    Copy,
    ChevronLeft,
    ChevronRight,
    Info,
    Send
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow, format } from 'date-fns'

export default function Watermarks() {
    const [activeTab, setActiveTab] = useState('check')
    const [stats, setStats] = useState(null)
    const [watermarks, setWatermarks] = useState([])
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Check tab state
    const [checkText, setCheckText] = useState('')
    const [checkResult, setCheckResult] = useState(null)
    const [checking, setChecking] = useState(false)

    // Embed tab state
    const [embedText, setEmbedText] = useState('')
    const [embedResult, setEmbedResult] = useState(null)
    const [embedding, setEmbedding] = useState(false)
    const [showOnlyDetected, setShowOnlyDetected] = useState(false)

    const fetchStats = async () => {
        try {
            const res = await api.get('/watermarks/stats')
            setStats(res.data)
        } catch (err) {
            console.error('Failed to fetch stats:', err)
        }
    }

    const fetchWatermarks = async (page = 1) => {
        try {
            setLoading(true)
            const params = { page, limit: 20 }
            if (showOnlyDetected) params.onlyDetected = 'true'
            const res = await api.get('/watermarks', { params })
            setWatermarks(res.data || [])
            setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 })
        } catch (err) {
            setError(err.message || 'Failed to fetch watermarks')
        } finally {
            setLoading(false)
        }
    }

    const initialMount = useState(true)

    useEffect(() => {
        fetchStats()
        fetchWatermarks()
    }, [])

    useEffect(() => {
        if (initialMount[0]) {
            initialMount[0] = false
            return
        }
        fetchWatermarks(1)
    }, [showOnlyDetected])

    const handleCheck = async () => {
        if (!checkText.trim()) return
        setChecking(true)
        setCheckResult(null)
        try {
            const res = await api.post('/watermarks/check', { text: checkText })
            setCheckResult(res.data)
        } catch (err) {
            setCheckResult({ error: err.message || 'Check failed' })
        } finally {
            setChecking(false)
        }
    }

    const handleEmbed = async () => {
        if (!embedText.trim()) return
        setEmbedding(true)
        setEmbedResult(null)
        try {
            const res = await api.post('/watermarks/embed', { text: embedText })
            setEmbedResult(res.data)
        } catch (err) {
            setEmbedResult({ error: err.message || 'Embed failed' })
        } finally {
            setEmbedding(false)
        }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
    }

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            fetchWatermarks(newPage)
        }
    }

    const tabStyle = (tab) => ({
        padding: '0.6rem 1.2rem',
        background: activeTab === tab ? 'var(--primary-color)' : 'transparent',
        color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
        border: activeTab === tab ? 'none' : '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.85rem',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem'
    })

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Message Watermarks</h1>
                    <p className="page-subtitle">Anti-spam tracking with invisible watermarks on outbound messages</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={() => { fetchStats(); fetchWatermarks(pagination.page); }}>
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
                        <XCircle size={16} />
                    </button>
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Fingerprint size={12} style={{ color: 'var(--primary-color)' }} />
                            Total Watermarks
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{stats.totalWatermarks?.toLocaleString() || 0}</div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
                            Forwarded Detected
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: stats.detectedForwards > 0 ? '#f59e0b' : 'inherit' }}>
                            {stats.detectedForwards?.toLocaleString() || 0}
                        </div>
                    </div>
                    <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Shield size={12} style={{ color: '#22c55e' }} />
                            Protection Rate
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#22c55e' }}>
                            {stats.totalWatermarks > 0
                                ? `${Math.round(((stats.totalWatermarks - stats.detectedForwards) / stats.totalWatermarks) * 100)}%`
                                : '100%'}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                <button style={tabStyle('check')} onClick={() => setActiveTab('check')}>
                    <Search size={16} /> Check Watermark
                </button>
                <button style={tabStyle('embed')} onClick={() => setActiveTab('embed')}>
                    <Fingerprint size={16} /> Embed Test
                </button>
                <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>
                    <Clock size={16} /> History
                </button>
            </div>

            {/* Check Tab */}
            {activeTab === 'check' && (
                <div className="card" style={{ padding: 'var(--spacing-xl)' }}>
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.1rem' }}>Check for Watermark</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Paste a message to check if it contains a tracking watermark and trace its origin.
                        </p>
                    </div>

                    <textarea
                        className="form-input"
                        rows={6}
                        placeholder="Paste the suspicious message text here..."
                        value={checkText}
                        onChange={(e) => setCheckText(e.target.value)}
                        style={{ marginBottom: 'var(--spacing-md)', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                    />

                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleCheck}
                            disabled={checking || !checkText.trim()}
                        >
                            {checking ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                            {checking ? 'Checking...' : 'Check Watermark'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => { setCheckText(''); setCheckResult(null); }}>
                            Clear
                        </button>
                    </div>

                    {/* Check Result */}
                    {checkResult && (
                        <div style={{
                            padding: 'var(--spacing-lg)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            background: checkResult.error
                                ? 'rgba(239,68,68,0.05)'
                                : checkResult.found
                                    ? 'rgba(245,158,11,0.05)'
                                    : 'rgba(34,197,94,0.05)'
                        }}>
                            {checkResult.error ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', color: '#ef4444' }}>
                                    <XCircle size={20} />
                                    <span style={{ fontWeight: 600 }}>{checkResult.error}</span>
                                </div>
                            ) : checkResult.found ? (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)', color: '#f59e0b' }}>
                                        <AlertTriangle size={20} />
                                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Watermark Detected!</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Code</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{checkResult.watermark.code}</div>
                                        </div>
                                        {checkResult.watermark.sender && (
                                            <div>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Sender</div>
                                                <div style={{ fontWeight: 600 }}>{checkResult.watermark.sender.name || checkResult.watermark.sender.username}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{checkResult.watermark.sender.email}</div>
                                            </div>
                                        )}
                                        {checkResult.watermark.recipientId && (
                                            <div>
                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Original Recipient</div>
                                                <div style={{ fontWeight: 600 }}>{checkResult.watermark.recipientId}</div>
                                            </div>
                                        )}
                                        <div>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Sent At</div>
                                            <div style={{ fontWeight: 600 }}>{checkResult.watermark.sentAt ? format(new Date(checkResult.watermark.sentAt), 'MMM dd, yyyy HH:mm') : '-'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Times Detected</div>
                                            <div style={{ fontWeight: 700, color: '#f59e0b' }}>{checkResult.watermark.detectedCount}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>Platform</div>
                                            <div style={{ fontWeight: 600 }}>{checkResult.watermark.platform}</div>
                                        </div>
                                    </div>
                                    {checkResult.watermark.messagePreview && (
                                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                                            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>Original Message Preview</div>
                                            <div style={{ color: 'var(--text-primary)' }}>{checkResult.watermark.messagePreview}</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', color: '#22c55e' }}>
                                    <CheckCircle size={20} />
                                    <span style={{ fontWeight: 600 }}>{checkResult.message || 'No watermark detected — this text appears clean.'}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Embed Test Tab */}
            {activeTab === 'embed' && (
                <div className="card" style={{ padding: 'var(--spacing-xl)' }}>
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1.1rem' }}>Embed Watermark Test</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Test watermark embedding on any text. The watermark is invisible to the human eye.
                        </p>
                    </div>

                    <textarea
                        className="form-input"
                        rows={4}
                        placeholder="Type a message to embed a watermark..."
                        value={embedText}
                        onChange={(e) => setEmbedText(e.target.value)}
                        style={{ marginBottom: 'var(--spacing-md)', resize: 'vertical' }}
                    />

                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleEmbed}
                            disabled={embedding || !embedText.trim()}
                        >
                            {embedding ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                            {embedding ? 'Embedding...' : 'Embed Watermark'}
                        </button>
                    </div>

                    {embedResult && !embedResult.error && (
                        <div style={{
                            padding: 'var(--spacing-lg)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(99,102,241,0.05)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)', color: '#6366f1' }}>
                                <CheckCircle size={20} />
                                <span style={{ fontWeight: 700 }}>Watermark Embedded Successfully</span>
                            </div>
                            <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                        Watermark Code
                                    </div>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#6366f1', fontSize: '1.1rem' }}>
                                        {embedResult.watermarkCode}
                                    </span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        Watermarked Text
                                        <button
                                            onClick={() => copyToClipboard(embedResult.watermarked)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                                            title="Copy watermarked text"
                                        >
                                            <Copy size={12} />
                                        </button>
                                    </div>
                                    <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
                                        {embedResult.watermarked}
                                    </div>
                                </div>
                                <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)', background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                                    <Info size={14} style={{ flexShrink: 0, marginTop: '2px', color: '#f59e0b' }} />
                                    <span>The text above looks identical to regular text, but contains invisible Zero-Width characters that encode the watermark. If this message is forwarded, the watermark can be detected to trace the source.</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {embedResult && embedResult.error && (
                        <div className="alert alert-error">
                            <XCircle size={18} />
                            <span>{embedResult.error}</span>
                        </div>
                    )}
                </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <div className="card">
                    {/* Filter */}
                    <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Watermark History</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <input
                                type="checkbox"
                                checked={showOnlyDetected}
                                onChange={(e) => setShowOnlyDetected(e.target.checked)}
                            />
                            Show only detected forwards
                        </label>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)' }}>
                            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--primary-color)' }} />
                        </div>
                    ) : watermarks.length > 0 ? (
                        <div>
                            {watermarks.map((wm) => (
                                <div
                                    key={wm.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 'var(--spacing-md)',
                                        padding: 'var(--spacing-md) var(--spacing-lg)',
                                        borderBottom: '1px solid var(--border-color)',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: 'var(--radius-md)',
                                        background: wm.detectedCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}>
                                        {wm.detectedCount > 0
                                            ? <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                                            : <Fingerprint size={18} style={{ color: '#6366f1' }} />}
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: '2px' }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem' }}>
                                                {wm.code}
                                            </span>
                                            {wm.detectedCount > 0 && (
                                                <span style={{
                                                    padding: '1px 8px',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    borderRadius: 'var(--radius-full)',
                                                    background: 'rgba(245,158,11,0.1)',
                                                    color: '#f59e0b'
                                                }}>
                                                    DETECTED {wm.detectedCount}x
                                                </span>
                                            )}
                                            <span style={{
                                                padding: '1px 6px',
                                                fontSize: '0.6rem',
                                                fontWeight: 600,
                                                borderRadius: 'var(--radius-full)',
                                                background: 'rgba(99,102,241,0.1)',
                                                color: '#6366f1',
                                                textTransform: 'uppercase'
                                            }}>
                                                {wm.platform}
                                            </span>
                                        </div>
                                        {wm.messagePreview && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {wm.messagePreview}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {wm.recipientId && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Send size={11} /> {wm.recipientId}
                                                </span>
                                            )}
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Clock size={11} /> {formatDistanceToNow(new Date(wm.createdAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Timestamp */}
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                                        {format(new Date(wm.createdAt), 'MMM dd, yyyy')}
                                        <br />
                                        <span style={{ fontSize: '0.7rem' }}>{format(new Date(wm.createdAt), 'HH:mm:ss')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--text-muted)' }}>
                            <Fingerprint size={48} style={{ marginBottom: 'var(--spacing-md)', opacity: 0.3 }} />
                            <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No watermarks yet</div>
                            <div style={{ fontSize: '0.85rem' }}>
                                {showOnlyDetected
                                    ? 'No forwarded messages detected yet'
                                    : 'Watermarks will appear here as you send messages'}
                            </div>
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-md) var(--spacing-lg)', borderTop: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Showing {watermarks.length} of {pagination.total}
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
            )}
        </div>
    )
}

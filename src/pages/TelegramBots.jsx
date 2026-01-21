import { useState, useEffect } from 'react'
import {
    Bot,
    Plus,
    RefreshCw,
    Trash2,
    Power,
    PowerOff,
    CheckCircle,
    XCircle,
    Clock,
    X,
    Loader2,
    MessageSquare,
    Send,
    Key,
    Eye,
    EyeOff,
    AlertCircle,
    Link2
} from 'lucide-react'
import api from '../services/api'
import { formatDistanceToNow } from 'date-fns'

export default function TelegramBots() {
    const [bots, setBots] = useState([])
    const [panels, setPanels] = useState([])  // Available SMM panels
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showTokenModal, setShowTokenModal] = useState(false)
    const [newBotToken, setNewBotToken] = useState('')
    const [selectedPanelId, setSelectedPanelId] = useState('')  // Selected panel for bot
    const [showToken, setShowToken] = useState(false)
    const [formLoading, setFormLoading] = useState(false)
    const [error, setError] = useState(null)
    const [actionLoading, setActionLoading] = useState(null)

    useEffect(() => {
        fetchBots()
        fetchPanels()  // Fetch panels for the dropdown
    }, [])

    const fetchBots = async () => {
        try {
            setLoading(true)
            const response = await api.get('/telegram/bots')
            setBots(response.data || [])
        } catch (err) {
            setError(err.message || 'Failed to fetch bots')
        } finally {
            setLoading(false)
        }
    }

    const fetchPanels = async () => {
        try {
            const res = await api.get('/panels')
            setPanels(res.data || [])
        } catch (error) {
            console.error('Failed to fetch panels:', error)
        }
    }

    const handleAddBot = async (e) => {
        e.preventDefault()
        setFormLoading(true)
        setError(null)

        try {
            await api.post('/telegram/bots', {
                botToken: newBotToken.trim(),
                panelId: selectedPanelId || null  // Include panel binding
            })
            setShowModal(false)
            setNewBotToken('')
            setSelectedPanelId('')  // Reset panel selection
            fetchBots()
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to add bot')
        } finally {
            setFormLoading(false)
        }
    }

    const handleStartBot = async (botId) => {
        setActionLoading(botId)
        try {
            await api.post(`/telegram/bots/${botId}/start`)
            fetchBots()
        } catch (err) {
            setError(err.message || 'Failed to start bot')
        } finally {
            setActionLoading(null)
        }
    }

    const handleStopBot = async (botId) => {
        setActionLoading(botId)
        try {
            await api.post(`/telegram/bots/${botId}/stop`)
            fetchBots()
        } catch (err) {
            setError(err.message || 'Failed to stop bot')
        } finally {
            setActionLoading(null)
        }
    }

    const handleDeleteBot = async (botId) => {
        if (!confirm('Are you sure you want to delete this bot?')) return

        setActionLoading(botId)
        try {
            await api.delete(`/telegram/bots/${botId}`)
            fetchBots()
        } catch (err) {
            setError(err.message || 'Failed to delete bot')
        } finally {
            setActionLoading(null)
        }
    }

    const getStatusIcon = (status) => {
        switch (status) {
            case 'connected':
                return <CheckCircle className="text-green-500" size={20} />
            case 'disconnected':
                return <XCircle className="text-red-500" size={20} />
            case 'pending':
            default:
                return <Clock className="text-yellow-500" size={20} />
        }
    }

    const getStatusText = (status) => {
        switch (status) {
            case 'connected': return 'Connected'
            case 'disconnected': return 'Disconnected'
            case 'pending': return 'Pending'
            default: return status
        }
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Telegram Bots</h1>
                    <p className="page-subtitle">Manage your Telegram bot integrations</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} />
                    <span>Add Bot</span>
                </button>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>
                        <X size={16} />
                    </button>
                </div>
            )}

            {loading ? (
                <div className="loading-container">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading bots...</p>
                </div>
            ) : bots.length === 0 ? (
                <div className="empty-state">
                    <Bot size={64} className="text-gray-400" />
                    <h3>No Telegram Bots</h3>
                    <p>Add a Telegram bot to start receiving and sending messages</p>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={18} />
                        <span>Add Your First Bot</span>
                    </button>
                </div>
            ) : (
                <div className="bots-grid">
                    {bots.map(bot => (
                        <div key={bot.id} className="bot-card">
                            <div className="bot-card-header">
                                <div className="bot-info">
                                    <Bot size={32} className="bot-icon" />
                                    <div>
                                        <h3 className="bot-name">{bot.botName || 'Telegram Bot'}</h3>
                                        <p className="bot-username">@{bot.botUsername}</p>
                                    </div>
                                </div>
                                <div className={`status-badge ${bot.status}`}>
                                    {getStatusIcon(bot.status)}
                                    <span>{getStatusText(bot.status)}</span>
                                </div>
                            </div>

                            <div className="bot-card-body">
                                <div className="bot-stat">
                                    <Clock size={16} />
                                    <span>Last Active: {bot.lastActive
                                        ? formatDistanceToNow(new Date(bot.lastActive), { addSuffix: true })
                                        : 'Never'}</span>
                                </div>
                                <div className="bot-stat">
                                    <MessageSquare size={16} />
                                    <span>Free Login: {bot.isFreeLogin ? 'Yes' : 'No'}</span>
                                </div>
                                <div className="bot-stat">
                                    <Link2 size={16} />
                                    <span>Panel: {bot.panel
                                        ? <span style={{ color: '#3b82f6', fontWeight: 500 }}>{bot.panel.alias || bot.panel.name}</span>
                                        : <span style={{ color: '#9ca3af' }}>All Panels</span>}
                                    </span>
                                </div>
                            </div>

                            <div className="bot-card-footer">
                                {bot.status === 'connected' ? (
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => handleStopBot(bot.id)}
                                        disabled={actionLoading === bot.id}
                                    >
                                        {actionLoading === bot.id ? (
                                            <Loader2 className="animate-spin" size={16} />
                                        ) : (
                                            <PowerOff size={16} />
                                        )}
                                        <span>Stop</span>
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleStartBot(bot.id)}
                                        disabled={actionLoading === bot.id}
                                    >
                                        {actionLoading === bot.id ? (
                                            <Loader2 className="animate-spin" size={16} />
                                        ) : (
                                            <Power size={16} />
                                        )}
                                        <span>Start</span>
                                    </button>
                                )}
                                <button
                                    className="btn btn-ghost btn-danger"
                                    onClick={() => handleDeleteBot(bot.id)}
                                    disabled={actionLoading === bot.id}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Bot Modal */}
            <div className={`modal-overlay ${showModal ? 'open' : ''}`}>
                <div className="modal">
                    <div className="modal-header">
                        <h2>Add Telegram Bot</h2>
                        <button className="modal-close" onClick={() => setShowModal(false)}>
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleAddBot}>
                        <div className="modal-body">
                            <div className="info-box">
                                <h4>How to get a Bot Token:</h4>
                                <ol>
                                    <li>Open Telegram and search for <strong>@BotFather</strong></li>
                                    <li>Send <code>/newbot</code> to create a new bot</li>
                                    <li>Follow the instructions to set name and username</li>
                                    <li>Copy the API token and paste it below</li>
                                </ol>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Bot Token *</label>
                                <div className="input-with-button">
                                    <input
                                        type={showToken ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                                        value={newBotToken}
                                        onChange={(e) => setNewBotToken(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-ghost"
                                        onClick={() => setShowToken(!showToken)}
                                    >
                                        {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                <p className="form-hint">Your bot token will be encrypted before storing</p>
                            </div>

                            {/* Panel Selection */}
                            <div className="form-group">
                                <label className="form-label">
                                    <Link2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                    Assign to Panel (Optional)
                                </label>
                                <select
                                    className="form-select"
                                    value={selectedPanelId}
                                    onChange={(e) => setSelectedPanelId(e.target.value)}
                                >
                                    <option value="">All Panels (No specific binding)</option>
                                    {panels.map(panel => (
                                        <option key={panel.id} value={panel.id}>
                                            {panel.alias || panel.name} - {panel.url}
                                        </option>
                                    ))}
                                </select>
                                <p className="form-hint">
                                    {selectedPanelId
                                        ? '✅ This bot will only handle orders from the selected panel'
                                        : '⚠️ This bot will handle orders from ALL your panels'}
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                {formLoading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} />
                                        <span>Adding...</span>
                                    </>
                                ) : (
                                    <>
                                        <Plus size={16} />
                                        <span>Add Bot</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <style>{`
                .bots-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: var(--spacing-lg);
                }

                .bot-card {
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                    transition: all 0.2s ease;
                }

                .bot-card:hover {
                    border-color: var(--primary-500);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                .bot-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                }

                .bot-info {
                    display: flex;
                    gap: var(--spacing-md);
                    align-items: center;
                }

                .bot-icon {
                    color: var(--primary-500);
                }

                .bot-name {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .bot-username {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    margin: 0;
                }

                .status-badge {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 500;
                }

                .status-badge.connected {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }

                .status-badge.disconnected {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .status-badge.pending {
                    background: rgba(234, 179, 8, 0.1);
                    color: #eab308;
                }

                .bot-card-body {
                    padding: var(--spacing-lg);
                }

                .bot-stat {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    margin-bottom: var(--spacing-sm);
                }

                .bot-stat:last-child {
                    margin-bottom: 0;
                }

                .bot-card-footer {
                    display: flex;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                }

                .bot-card-footer .btn {
                    flex: 1;
                }

                .bot-card-footer .btn-danger {
                    flex: 0;
                }

                .info-box {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                .info-box h4 {
                    margin: 0 0 var(--spacing-sm);
                    font-size: 0.875rem;
                }

                .info-box ol {
                    margin: 0;
                    padding-left: 1.25rem;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .info-box li {
                    margin-bottom: var(--spacing-xs);
                }

                .info-box code {
                    background: var(--bg-primary);
                    padding: 2px 6px;
                    border-radius: var(--radius-sm);
                    font-family: monospace;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    text-align: center;
                }

                .empty-state h3 {
                    margin-top: var(--spacing-lg);
                    margin-bottom: var(--spacing-sm);
                }

                .empty-state p {
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-lg);
                }

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-3xl);
                    color: var(--text-secondary);
                }

                .loading-container p {
                    margin-top: var(--spacing-md);
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

                .alert button {
                    margin-left: auto;
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: inherit;
                }

                .input-with-button {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .input-with-button .form-input {
                    flex: 1;
                }
            `}</style>
        </div>
    )
}

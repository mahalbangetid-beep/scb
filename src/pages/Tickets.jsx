import { useState, useEffect } from 'react';
import {
    Ticket, Plus, Search, MessageSquare, Clock, CheckCircle, XCircle,
    AlertTriangle, Filter, RefreshCw, Send, ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../services/api';

const Tickets = () => {
    const [tickets, setTickets] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [replyLoading, setReplyLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchData();
    }, [statusFilter]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            if (searchQuery) params.append('search', searchQuery);

            const [ticketsRes, statsRes] = await Promise.all([
                api.get(`/tickets?${params.toString()}`),
                api.get('/tickets/stats')
            ]);
            setTickets(ticketsRes.data.data || []);
            setStats(statsRes.data.data);
        } catch (err) {
            setError('Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        fetchData();
    };

    const handleViewTicket = (ticket) => {
        setSelectedTicket(ticket);
        setReplyText('');
    };

    const handleReply = async () => {
        if (!replyText.trim() || !selectedTicket) return;

        try {
            setReplyLoading(true);
            await api.post(`/tickets/${selectedTicket.id}/reply`, {
                content: replyText,
                type: 'STAFF'
            });
            setReplyText('');
            setSuccess('Reply sent');

            // Refresh ticket details
            const res = await api.get(`/tickets/${selectedTicket.id}`);
            setSelectedTicket(res.data.data);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to send reply');
        } finally {
            setReplyLoading(false);
        }
    };

    const handleStatusChange = async (ticketId, newStatus) => {
        try {
            await api.put(`/tickets/${ticketId}/status`, { status: newStatus });
            setSuccess('Status updated');

            if (selectedTicket?.id === ticketId) {
                const res = await api.get(`/tickets/${ticketId}`);
                setSelectedTicket(res.data.data);
            }
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to update status');
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            OPEN: { bg: 'var(--info-bg)', color: 'var(--info-color)', label: 'Open' },
            PENDING: { bg: 'var(--warning-bg)', color: 'var(--warning-color)', label: 'Pending' },
            IN_PROGRESS: { bg: 'var(--primary-bg)', color: 'var(--primary-color)', label: 'In Progress' },
            WAITING_CUSTOMER: { bg: 'var(--warning-bg)', color: 'var(--warning-color)', label: 'Waiting' },
            RESOLVED: { bg: 'var(--success-bg)', color: 'var(--success-color)', label: 'Resolved' },
            CLOSED: { bg: 'var(--muted-bg)', color: 'var(--muted-color)', label: 'Closed' }
        };
        const style = styles[status] || styles.OPEN;
        return (
            <span className="status-badge" style={{ background: style.bg, color: style.color }}>
                {style.label}
            </span>
        );
    };

    const getPriorityBadge = (priority) => {
        const colors = {
            LOW: '#6b7280',
            NORMAL: '#3b82f6',
            HIGH: '#f59e0b',
            URGENT: '#ef4444'
        };
        return (
            <span className="priority-dot" style={{ background: colors[priority] || colors.NORMAL }} />
        );
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading && tickets.length === 0) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading tickets...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container tickets-page">
            <div className="page-header">
                <div className="header-content">
                    <h1><Ticket size={28} /> Tickets</h1>
                    <p className="header-subtitle">Manage support tickets from customers</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            {error && <div className="alert alert-error"><AlertTriangle size={20} />{error}</div>}
            {success && <div className="alert alert-success"><CheckCircle size={20} />{success}</div>}

            {/* Stats */}
            {stats && (
                <div className="stats-row">
                    <div className="stat-item">
                        <span className="stat-value">{stats.total}</span>
                        <span className="stat-label">Total</span>
                    </div>
                    <div className="stat-item open">
                        <span className="stat-value">{stats.open}</span>
                        <span className="stat-label">Open</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats.pending}</span>
                        <span className="stat-label">Pending</span>
                    </div>
                    <div className="stat-item resolved">
                        <span className="stat-value">{stats.resolved}</span>
                        <span className="stat-label">Resolved</span>
                    </div>
                    {stats.avgResolutionTime && (
                        <div className="stat-item">
                            <span className="stat-value">{stats.avgResolutionTime}h</span>
                            <span className="stat-label">Avg. Time</span>
                        </div>
                    )}
                </div>
            )}

            {/* Filters */}
            <div className="filters-row">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search tickets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button onClick={handleSearch}><Search size={16} /></button>
                </div>
                <div className="filter-select">
                    <Filter size={16} />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="OPEN">Open</option>
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="WAITING_CUSTOMER">Waiting Customer</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                    </select>
                </div>
            </div>

            <div className="tickets-layout">
                {/* Tickets List */}
                <div className="tickets-list">
                    {tickets.length === 0 ? (
                        <div className="empty-state">
                            <Ticket size={48} />
                            <h4>No Tickets</h4>
                            <p>No tickets match your filters</p>
                        </div>
                    ) : (
                        tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                className={`ticket-item ${selectedTicket?.id === ticket.id ? 'selected' : ''}`}
                                onClick={() => handleViewTicket(ticket)}
                            >
                                <div className="ticket-header">
                                    {getPriorityBadge(ticket.priority)}
                                    <span className="ticket-number">#{ticket.ticketNumber}</span>
                                    {getStatusBadge(ticket.status)}
                                </div>
                                <div className="ticket-subject">{ticket.subject}</div>
                                <div className="ticket-meta">
                                    <span><Clock size={12} /> {formatDate(ticket.createdAt)}</span>
                                    {ticket.customerUsername && (
                                        <span>@{ticket.customerUsername}</span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Ticket Detail */}
                <div className="ticket-detail">
                    {!selectedTicket ? (
                        <div className="no-selection">
                            <MessageSquare size={48} />
                            <p>Select a ticket to view details</p>
                        </div>
                    ) : (
                        <>
                            <div className="detail-header">
                                <div className="detail-title">
                                    <h3>#{selectedTicket.ticketNumber}</h3>
                                    {getStatusBadge(selectedTicket.status)}
                                </div>
                                <div className="detail-actions">
                                    <select
                                        value={selectedTicket.status}
                                        onChange={(e) => handleStatusChange(selectedTicket.id, e.target.value)}
                                    >
                                        <option value="OPEN">Open</option>
                                        <option value="PENDING">Pending</option>
                                        <option value="IN_PROGRESS">In Progress</option>
                                        <option value="WAITING_CUSTOMER">Waiting Customer</option>
                                        <option value="RESOLVED">Resolved</option>
                                        <option value="CLOSED">Closed</option>
                                    </select>
                                </div>
                            </div>

                            <div className="detail-info">
                                <p><strong>Subject:</strong> {selectedTicket.subject}</p>
                                <p><strong>Category:</strong> {selectedTicket.category}</p>
                                <p><strong>Customer:</strong> {selectedTicket.customerUsername || selectedTicket.customerPhone || 'Unknown'}</p>
                                <p><strong>Created:</strong> {formatDate(selectedTicket.createdAt)}</p>
                            </div>

                            <div className="messages-container">
                                {(selectedTicket.messages || []).map((msg, idx) => (
                                    <div key={idx} className={`message ${msg.type.toLowerCase()}`}>
                                        <div className="message-header">
                                            <span className="message-type">{msg.type}</span>
                                            <span className="message-time">{formatDate(msg.timestamp)}</span>
                                        </div>
                                        <div className="message-content">{msg.content}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="reply-box">
                                <textarea
                                    placeholder="Type your reply..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    rows="3"
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={handleReply}
                                    disabled={replyLoading || !replyText.trim()}
                                >
                                    <Send size={16} /> {replyLoading ? 'Sending...' : 'Send Reply'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style jsx>{`
        .tickets-page {
          height: calc(100vh - 120px);
          display: flex;
          flex-direction: column;
        }
        .stats-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .stat-item {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 0.75rem 1.25rem;
          text-align: center;
        }
        .stat-item.open { border-color: var(--info-color); }
        .stat-item.resolved { border-color: var(--success-color); }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          display: block;
        }
        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .filters-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .search-box {
          flex: 1;
          display: flex;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }
        .search-box input {
          flex: 1;
          border: none;
          padding: 0.75rem 1rem;
          background: transparent;
          color: var(--text-primary);
        }
        .search-box button {
          background: var(--bg-tertiary);
          border: none;
          padding: 0 1rem;
          cursor: pointer;
        }
        .filter-select {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 0 1rem;
        }
        .filter-select select {
          border: none;
          background: transparent;
          color: var(--text-primary);
          padding: 0.75rem 0;
        }
        .tickets-layout {
          flex: 1;
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 1rem;
          min-height: 0;
        }
        .tickets-list {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow-y: auto;
        }
        .ticket-item {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          transition: background 0.2s;
        }
        .ticket-item:hover {
          background: var(--bg-tertiary);
        }
        .ticket-item.selected {
          background: rgba(37, 211, 102, 0.1);
          border-left: 3px solid var(--primary-color);
        }
        .ticket-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .ticket-number {
          font-weight: 600;
          font-size: 0.85rem;
        }
        .ticket-subject {
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }
        .ticket-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .ticket-meta span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .priority-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-badge {
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 500;
        }
        .ticket-detail {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .no-selection {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
        }
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        }
        .detail-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .detail-title h3 {
          margin: 0;
        }
        .detail-info {
          padding: 1rem;
          font-size: 0.9rem;
          border-bottom: 1px solid var(--border-color);
        }
        .detail-info p {
          margin: 0.25rem 0;
        }
        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }
        .message {
          margin-bottom: 1rem;
          padding: 0.75rem;
          border-radius: 8px;
        }
        .message.customer {
          background: var(--bg-tertiary);
          margin-right: 2rem;
        }
        .message.staff {
          background: rgba(37, 211, 102, 0.1);
          margin-left: 2rem;
        }
        .message.system {
          background: rgba(59, 130, 246, 0.1);
          text-align: center;
          font-size: 0.85rem;
        }
        .message-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          margin-bottom: 0.5rem;
          color: var(--text-secondary);
        }
        .message-type {
          font-weight: 600;
          text-transform: capitalize;
        }
        .message-content {
          white-space: pre-wrap;
        }
        .reply-box {
          padding: 1rem;
          border-top: 1px solid var(--border-color);
        }
        .reply-box textarea {
          width: 100%;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          resize: none;
        }
        .reply-box button {
          width: 100%;
        }
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: var(--text-secondary);
        }
        .empty-state h4 {
          margin: 1rem 0 0.5rem 0;
        }
      `}</style>
        </div>
    );
};

export default Tickets;

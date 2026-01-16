import { useState, useEffect } from 'react';
import {
  Ticket, Plus, Search, MessageSquare, Clock, CheckCircle, XCircle,
  AlertTriangle, Filter, RefreshCw, Send, X, User, Tag
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

  // Create Ticket Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'GENERAL',
    priority: 'NORMAL',
    customerUsername: '',
    customerPhone: '',
    message: ''
  });

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

  const handleCreateTicket = async (e) => {
    e.preventDefault();

    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) {
      setError('Subject and message are required');
      return;
    }

    try {
      setCreateLoading(true);
      await api.post('/tickets', ticketForm);
      setSuccess('Ticket created successfully');
      setShowCreateModal(false);
      setTicketForm({
        subject: '',
        category: 'GENERAL',
        priority: 'NORMAL',
        customerUsername: '',
        customerPhone: '',
        message: ''
      });
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create ticket');
    } finally {
      setCreateLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      OPEN: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', label: 'Open' },
      PENDING: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', label: 'Pending' },
      IN_PROGRESS: { bg: 'rgba(37, 211, 102, 0.1)', color: '#25d366', label: 'In Progress' },
      WAITING_CUSTOMER: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', label: 'Waiting' },
      RESOLVED: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', label: 'Resolved' },
      CLOSED: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', label: 'Closed' }
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
    <div className="tickets-page">
      <div className="page-header">
        <div className="header-content">
          <h1><Ticket className="header-icon" /> Tickets</h1>
          <p className="header-subtitle">Manage support tickets from customers</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchData}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Create Ticket
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <CheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon"><Ticket size={24} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className="stat-card open">
            <div className="stat-icon"><MessageSquare size={24} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.open}</span>
              <span className="stat-label">Open</span>
            </div>
          </div>
          <div className="stat-card pending">
            <div className="stat-icon"><Clock size={24} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.pending}</span>
              <span className="stat-label">Pending</span>
            </div>
          </div>
          <div className="stat-card resolved">
            <div className="stat-icon"><CheckCircle size={24} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.resolved}</span>
              <span className="stat-label">Resolved</span>
            </div>
          </div>
          {stats.avgResolutionTime && (
            <div className="stat-card">
              <div className="stat-info">
                <span className="stat-value">{stats.avgResolutionTime}h</span>
                <span className="stat-label">Avg. Time</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="filters-row">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
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
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} /> Create First Ticket
              </button>
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
                    <span><User size={12} /> {ticket.customerUsername}</span>
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
              <h4>Select a Ticket</h4>
              <p>Click on a ticket to view details and respond</p>
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
                    className="form-select"
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
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Subject</span>
                    <span className="info-value">{selectedTicket.subject}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Category</span>
                    <span className="info-value"><Tag size={14} /> {selectedTicket.category}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Customer</span>
                    <span className="info-value"><User size={14} /> {selectedTicket.customerUsername || selectedTicket.customerPhone || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Created</span>
                    <span className="info-value"><Clock size={14} /> {formatDate(selectedTicket.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="messages-container">
                {(selectedTicket.messages || []).length === 0 ? (
                  <div className="no-messages">
                    <p>No messages yet</p>
                  </div>
                ) : (
                  (selectedTicket.messages || []).map((msg, idx) => (
                    <div key={idx} className={`message ${msg.type.toLowerCase()}`}>
                      <div className="message-header">
                        <span className="message-type">{msg.type}</span>
                        <span className="message-time">{formatDate(msg.timestamp)}</span>
                      </div>
                      <div className="message-content">{msg.content}</div>
                    </div>
                  ))
                )}
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

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="modal-overlay open" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Ticket size={20} /> Create New Ticket</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateTicket}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Subject *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ticketForm.subject}
                    onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                    placeholder="Brief description of the issue"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={ticketForm.category}
                      onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                    >
                      <option value="GENERAL">General Inquiry</option>
                      <option value="REFILL">Refill Request</option>
                      <option value="CANCEL">Cancel Request</option>
                      <option value="SPEEDUP">Speed Up Request</option>
                      <option value="PARTIAL">Partial Refund</option>
                      <option value="TECHNICAL">Technical Issue</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select
                      className="form-select"
                      value={ticketForm.priority}
                      onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                    >
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Customer Username</label>
                    <input
                      type="text"
                      className="form-input"
                      value={ticketForm.customerUsername}
                      onChange={(e) => setTicketForm({ ...ticketForm, customerUsername: e.target.value })}
                      placeholder="Panel username"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={ticketForm.customerPhone}
                      onChange={(e) => setTicketForm({ ...ticketForm, customerPhone: e.target.value })}
                      placeholder="628123456789"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Message *</label>
                  <textarea
                    className="form-textarea"
                    rows="5"
                    value={ticketForm.message}
                    onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
                    placeholder="Describe the issue in detail..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
                .tickets-page {
                    padding: 1.5rem;
                    height: calc(100vh - 80px);
                    display: flex;
                    flex-direction: column;
                }
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1.5rem;
                }
                .header-content h1 {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin: 0;
                    font-size: 1.75rem;
                }
                .header-icon {
                    color: var(--primary-color);
                }
                .header-subtitle {
                    margin: 0.25rem 0 0 0;
                    color: var(--text-secondary);
                }
                .header-actions {
                    display: flex;
                    gap: 0.75rem;
                }
                .stats-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .stat-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .stat-card.open { border-color: rgba(59, 130, 246, 0.3); }
                .stat-card.pending { border-color: rgba(245, 158, 11, 0.3); }
                .stat-card.resolved { border-color: rgba(34, 197, 94, 0.3); }
                .stat-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    background: var(--bg-tertiary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-color);
                }
                .stat-card.open .stat-icon { color: #3b82f6; }
                .stat-card.pending .stat-icon { color: #f59e0b; }
                .stat-card.resolved .stat-icon { color: #22c55e; }
                .stat-info {
                    display: flex;
                    flex-direction: column;
                }
                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
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
                    align-items: center;
                    gap: 0.75rem;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 0 1rem;
                }
                .search-box input {
                    flex: 1;
                    border: none;
                    padding: 0.75rem 0;
                    background: transparent;
                    color: var(--text-primary);
                }
                .search-box input:focus { outline: none; }
                .filter-select {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
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
                    grid-template-columns: 380px 1fr;
                    gap: 1rem;
                    min-height: 0;
                    overflow: hidden;
                }
                .tickets-list {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    overflow-y: auto;
                }
                .ticket-item {
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border-color);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ticket-item:hover {
                    background: var(--bg-tertiary);
                }
                .ticket-item.selected {
                    background: rgba(37, 211, 102, 0.08);
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
                    font-size: 0.9rem;
                }
                .ticket-subject {
                    font-size: 0.95rem;
                    margin-bottom: 0.5rem;
                    line-height: 1.4;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .ticket-meta {
                    display: flex;
                    gap: 1rem;
                    font-size: 0.8rem;
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
                    padding: 0.2rem 0.5rem;
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
                    text-align: center;
                }
                .no-selection h4 {
                    margin: 1rem 0 0.5rem 0;
                    color: var(--text-primary);
                }
                .detail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                }
                .detail-title {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .detail-title h3 {
                    margin: 0;
                    font-size: 1.1rem;
                }
                .detail-actions .form-select {
                    padding: 0.5rem 0.75rem;
                    border-radius: 6px;
                }
                .detail-info {
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.75rem;
                }
                .info-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .info-label {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }
                .info-value {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    font-size: 0.9rem;
                }
                .messages-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem 1.25rem;
                }
                .no-messages {
                    text-align: center;
                    color: var(--text-secondary);
                    padding: 2rem;
                }
                .message {
                    margin-bottom: 1rem;
                    padding: 0.875rem;
                    border-radius: 10px;
                }
                .message.customer {
                    background: var(--bg-tertiary);
                    margin-right: 3rem;
                }
                .message.staff {
                    background: rgba(37, 211, 102, 0.08);
                    margin-left: 3rem;
                }
                .message.system {
                    background: rgba(59, 130, 246, 0.08);
                    text-align: center;
                    font-size: 0.85rem;
                    margin: 0 3rem;
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
                    line-height: 1.5;
                }
                .reply-box {
                    padding: 1rem 1.25rem;
                    border-top: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                }
                .reply-box textarea {
                    width: 100%;
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 0.75rem;
                    margin-bottom: 0.75rem;
                    background: var(--bg-card);
                    color: var(--text-primary);
                    resize: none;
                    font-size: 0.95rem;
                }
                .reply-box textarea:focus {
                    outline: none;
                    border-color: var(--primary-color);
                }
                .reply-box button {
                    width: 100%;
                }
                .empty-state {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--text-secondary);
                }
                .empty-state h4 {
                    margin: 1rem 0 0.5rem 0;
                    color: var(--text-primary);
                }
                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }
            `}</style>
    </div>
  );
};

export default Tickets;

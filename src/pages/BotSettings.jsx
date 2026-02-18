import { useState, useEffect } from 'react';
import { Settings, Shield, Zap, MessageSquare, AlertTriangle, RotateCcw, Save, ChevronDown, ChevronRight, Bell, Package, Users, Search, Phone, ShieldAlert } from 'lucide-react';
import api from '../services/api';

const BotSettings = () => {
    const [toggles, setToggles] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSections, setExpandedSections] = useState({
        commands: true,
        highRisk: false,
        processing: true,
        templates: false,
        response: true,
        fallback: true,
        callResponse: true,
        spamProtection: true
    });

    useEffect(() => {
        fetchToggles();
    }, []);

    const fetchToggles = async () => {
        try {
            setLoading(true);
            const response = await api.get('/bot-features');
            setToggles(response.data);
        } catch (err) {
            setError('Failed to load bot settings');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (key, value) => {
        setToggles(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError('');
            setSuccess('');

            const response = await api.put('/bot-features', toggles);
            setToggles(response.data);
            setSuccess('Bot settings saved successfully!');

            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.error?.message || err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Are you sure you want to reset all settings to defaults?')) {
            return;
        }

        try {
            setSaving(true);
            const response = await api.post('/bot-features/reset');
            setToggles(response.data);
            setSuccess('Settings reset to defaults!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Failed to reset settings');
        } finally {
            setSaving(false);
        }
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const Toggle = ({ checked, onChange, disabled = false }) => (
        <label className="toggle-switch">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
            />
            <span className="toggle-slider"></span>
        </label>
    );

    const Section = ({ id, title, icon: Icon, children, description, danger = false }) => {
        const isExpanded = searchQuery.trim() ? true : expandedSections[id];
        return (
            <div className={`settings-section ${danger ? 'danger' : ''}`}>
                <div
                    className="section-header"
                    onClick={() => toggleSection(id)}
                >
                    <div className="section-title">
                        <Icon size={20} />
                        <span>{title}</span>
                        {danger && <span className="badge badge-danger">High Risk</span>}
                    </div>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
                {description && isExpanded && (
                    <p className="section-description">{description}</p>
                )}
                {isExpanded && (
                    <div className="section-content">
                        {children}
                    </div>
                )}
            </div>
        );
    };

    const matchesSearch = (label, description) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (label || '').toLowerCase().includes(q) || (description || '').toLowerCase().includes(q);
    };

    const ToggleRow = ({ label, description, toggleKey, danger = false }) => {
        if (!matchesSearch(label, description)) return null;
        return (
            <div className={`toggle-row ${danger ? 'danger-row' : ''}`}>
                <div className="toggle-info">
                    <span className="toggle-label">{label}</span>
                    {description && <span className="toggle-description">{description}</span>}
                </div>
                <Toggle
                    checked={toggles?.[toggleKey] || false}
                    onChange={(value) => handleToggle(toggleKey, value)}
                />
            </div>
        );
    };

    const SelectRow = ({ label, description, selectKey, options }) => {
        if (!matchesSearch(label, description)) return null;
        return (
            <div className="toggle-row">
                <div className="toggle-info">
                    <span className="toggle-label">{label}</span>
                    {description && <span className="toggle-description">{description}</span>}
                </div>
                <select
                    className="form-select compact"
                    value={toggles?.[selectKey] || ''}
                    onChange={(e) => handleToggle(selectKey, e.target.value)}
                >
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        );
    };

    const InputRow = ({ label, description, inputKey, type = 'number', placeholder }) => {
        if (!matchesSearch(label, description)) return null;
        return (
            <div className="toggle-row">
                <div className="toggle-info">
                    <span className="toggle-label">{label}</span>
                    {description && <span className="toggle-description">{description}</span>}
                </div>
                <input
                    type={type}
                    className="form-input compact"
                    value={toggles?.[inputKey] ?? ''}
                    onChange={(e) => {
                        if (type === 'number') {
                            const val = parseInt(e.target.value, 10);
                            handleToggle(inputKey, isNaN(val) ? '' : val);
                        } else {
                            handleToggle(inputKey, e.target.value);
                        }
                    }}
                    placeholder={placeholder}
                    min={type === 'number' ? 0 : undefined}
                />
            </div>
        );
    };

    const TextAreaRow = ({ label, description, inputKey, placeholder, rows = 3 }) => {
        if (!matchesSearch(label, description)) return null;
        return (
            <div className="toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div className="toggle-info">
                    <span className="toggle-label">{label}</span>
                    {description && <span className="toggle-description">{description}</span>}
                </div>
                <textarea
                    className="form-input"
                    rows={rows}
                    style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                    value={toggles?.[inputKey] || ''}
                    onChange={(e) => handleToggle(inputKey, e.target.value)}
                    placeholder={placeholder}
                />
            </div>
        );
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading bot settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-content">
                    <h1>
                        <Settings size={28} />
                        Bot Feature Settings
                    </h1>
                    <p className="header-subtitle">
                        Configure which bot features are enabled and customize command behavior
                    </p>
                </div>

                <div className="header-actions">
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            placeholder="Search settings..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                padding: '0.5rem 0.75rem 0.5rem 34px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '0.875rem',
                                width: '200px',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={handleReset}
                        disabled={saving}
                    >
                        <RotateCcw size={16} />
                        Reset Defaults
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <div className="spinner-small"></div>
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={16} />
                                Save Settings
                            </>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="alert alert-error">
                    <AlertTriangle size={20} />
                    {error}
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <Zap size={20} />
                    {success}
                </div>
            )}

            <div className="settings-grid">
                {/* Command Toggles */}
                <Section
                    id="commands"
                    title="Command Controls"
                    icon={MessageSquare}
                    description="Enable or disable specific bot commands"
                >
                    <ToggleRow
                        label="Refill Command"
                        description="Allow users to request refills via bot"
                        toggleKey="allowRefillCommand"
                    />
                    <ToggleRow
                        label="Cancel Command"
                        description="Allow users to request cancellations via bot"
                        toggleKey="allowCancelCommand"
                    />
                    <ToggleRow
                        label="Speed-Up Command"
                        description="Allow users to request speed-up via bot"
                        toggleKey="allowSpeedUpCommand"
                    />
                    <ToggleRow
                        label="Status Command"
                        description="Allow users to check order status via bot"
                        toggleKey="allowStatusCommand"
                    />
                </Section>

                {/* Response Settings */}
                <Section
                    id="response"
                    title="Response Settings"
                    icon={Bell}
                    description="Configure how bot responds to commands"
                >
                    <InputRow
                        label="Bulk Response Threshold"
                        description="Switch to compact mode after this many orders"
                        inputKey="bulkResponseThreshold"
                        placeholder="5"
                    />
                    <InputRow
                        label="Max Bulk Orders"
                        description="Maximum orders allowed per message"
                        inputKey="maxBulkOrders"
                        placeholder="100"
                    />
                    <ToggleRow
                        label="Show Provider in Response"
                        description="Include provider name in bot responses"
                        toggleKey="showProviderInResponse"
                    />
                    <ToggleRow
                        label="Detailed Status"
                        description="Show extended order details in status response"
                        toggleKey="showDetailedStatus"
                    />
                </Section>

                {/* Processing Status Rules */}
                <Section
                    id="processing"
                    title="Processing Status Rules"
                    icon={Package}
                    description="Special handling for orders with Processing status"
                >
                    <ToggleRow
                        label="Speed-Up for Processing"
                        description="Allow speed-up requests for processing orders"
                        toggleKey="processingSpeedUpEnabled"
                    />
                    <ToggleRow
                        label="Cancel for Processing"
                        description="Allow cancel requests for processing orders"
                        toggleKey="processingCancelEnabled"
                    />
                    <ToggleRow
                        label="Auto-Forward Processing Cancel"
                        description="Automatically forward cancel requests to provider"
                        toggleKey="autoForwardProcessingCancel"
                    />
                </Section>

                {/* Provider Templates */}
                <Section
                    id="templates"
                    title="Provider Command Templates"
                    icon={Users}
                    description="Custom command formats sent to providers"
                >
                    <InputRow
                        label="Speed-Up Template"
                        description="Command format for speed-up requests"
                        inputKey="providerSpeedUpTemplate"
                        type="text"
                        placeholder="{speed}"
                    />
                    <InputRow
                        label="Refill Template"
                        description="Command format for refill requests"
                        inputKey="providerRefillTemplate"
                        type="text"
                        placeholder="{refill}"
                    />
                    <InputRow
                        label="Cancel Template"
                        description="Command format for cancel requests"
                        inputKey="providerCancelTemplate"
                        type="text"
                        placeholder="{cancel}"
                    />
                </Section>

                {/* Fallback Response Settings */}
                <Section
                    id="fallback"
                    title="Reply to All Messages"
                    icon={MessageSquare}
                    description="Configure bot to reply to ALL incoming messages"
                >
                    <ToggleRow
                        label="Reply to All Messages"
                        description="When enabled, bot will reply to ALL messages, not just commands"
                        toggleKey="replyToAllMessages"
                    />

                    <div className="toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div className="toggle-info">
                            <span className="toggle-label">Fallback Message</span>
                            <span className="toggle-description">
                                Default response when no command matches (only used when &quot;Reply to All&quot; is enabled)
                            </span>
                        </div>
                        <textarea
                            className="form-input"
                            rows={4}
                            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                            value={toggles?.fallbackMessage || ''}
                            onChange={(e) => handleToggle('fallbackMessage', e.target.value)}
                            placeholder={`I didn't understand your message.

📋 *Available Commands:*
• [Order ID] status - Check order status
• [Order ID] refill - Request refill
• [Order ID] cancel - Cancel order
• .help - Show all commands

Example: 12345 status`}
                        />
                    </div>
                </Section>

                {/* Call Auto-Reply (1.2 / 1.3) */}
                <Section
                    id="callResponse"
                    title="Call Auto-Reply"
                    icon={Phone}
                    description="Automatically reply when someone calls the bot number"
                >
                    <ToggleRow
                        label="Enable Call Auto-Reply"
                        description="Automatically reject calls and send a text reply"
                        toggleKey="callAutoReplyEnabled"
                    />

                    {toggles?.callAutoReplyEnabled && (
                        <>
                            <TextAreaRow
                                label="Personal Call Reply"
                                description="Message sent when someone calls the bot directly"
                                inputKey="callReplyMessage"
                                placeholder="📵 This is an automated bot. We cannot answer calls.\n\nPlease send a text message or use the available bot commands instead."
                            />
                            <TextAreaRow
                                label="Group Call Reply"
                                description="Message sent when someone calls inside a group"
                                inputKey="groupCallReplyMessage"
                                placeholder="📵 This bot cannot answer calls in groups. Please send a text command."
                            />
                            <TextAreaRow
                                label="Repeated Call Reply"
                                description="Message sent when the same person calls repeatedly (spam calls)"
                                inputKey="repeatedCallReplyMessage"
                                placeholder="🚫 You have called too many times. This bot cannot answer calls. Please stop calling and use text commands."
                            />
                            <InputRow
                                label="Repeated Call Threshold"
                                description="How many calls before it's considered spam"
                                inputKey="repeatedCallThreshold"
                                placeholder="3"
                            />
                            <InputRow
                                label="Call Window (minutes)"
                                description="Time window to count repeated calls"
                                inputKey="repeatedCallWindowMinutes"
                                placeholder="5"
                            />
                        </>
                    )}
                </Section>

                {/* Spam Protection (1.4) */}
                <Section
                    id="spamProtection"
                    title="Spam Protection"
                    icon={ShieldAlert}
                    description="Detect repeated same text and temporarily disable bot for spammers"
                >
                    <ToggleRow
                        label="Enable Spam Protection"
                        description="Automatically detect and block users who send the same text repeatedly"
                        toggleKey="spamProtectionEnabled"
                    />

                    {toggles?.spamProtectionEnabled && (
                        <>
                            <InputRow
                                label="Repeat Threshold"
                                description="How many times same text must be sent to trigger action"
                                inputKey="spamRepeatThreshold"
                                placeholder="3"
                            />
                            <InputRow
                                label="Time Window (minutes)"
                                description="Time period to count repeated messages"
                                inputKey="spamTimeWindowMinutes"
                                placeholder="5"
                            />
                            <InputRow
                                label="Disable Duration (minutes)"
                                description="How long to disable bot for the spammer"
                                inputKey="spamDisableDurationMin"
                                placeholder="60"
                            />
                            <TextAreaRow
                                label="Warning Message"
                                description="Message sent as warning before disabling (leave empty for default)"
                                inputKey="spamWarningMessage"
                                placeholder="⚠️ *Spam Detected*\n\nYou have sent the same message multiple times.\nIf you continue, the bot will stop responding to you."
                            />
                        </>
                    )}
                </Section>

                {/* High Risk Features */}
                <Section
                    id="highRisk"
                    title="High-Risk Features"
                    icon={Shield}
                    description="⚠️ These features can affect orders and funds. Enable with caution!"
                    danger={true}
                >
                    <div className="warning-banner">
                        <AlertTriangle size={20} />
                        <span>These features are disabled by default for safety. Enable only if you understand the risks.</span>
                    </div>

                    <ToggleRow
                        label="Auto Handle Failed Orders"
                        description="Automatically cancel or refund failed orders"
                        toggleKey="autoHandleFailedOrders"
                        danger
                    />

                    {toggles?.autoHandleFailedOrders && (
                        <SelectRow
                            label="Failed Order Action"
                            description="What to do with failed orders"
                            selectKey="failedOrderAction"
                            options={[
                                { value: 'NOTIFY', label: 'Notify Only' },
                                { value: 'CANCEL', label: 'Auto Cancel' },
                                { value: 'REFUND', label: 'Auto Refund' },
                                { value: 'IGNORE', label: 'Ignore' }
                            ]}
                        />
                    )}

                    <ToggleRow
                        label="Force Order Completed"
                        description="⚠️ DANGEROUS: Mark orders as completed regardless of actual status"
                        toggleKey="allowForceCompleted"
                        danger
                    />

                    <ToggleRow
                        label="Link Update via Bot"
                        description="Allow updating order links through WhatsApp"
                        toggleKey="allowLinkUpdateViaBot"
                        danger
                    />

                    <ToggleRow
                        label="Payment Verification"
                        description="Bot can check payment/transaction status"
                        toggleKey="allowPaymentVerification"
                    />

                    <ToggleRow
                        label="Account Details via Bot"
                        description="Bot replies with username, balance, spent amount"
                        toggleKey="allowAccountDetailsViaBot"
                    />

                    <ToggleRow
                        label="Ticket Auto-Reply"
                        description="Bot automatically replies to support tickets"
                        toggleKey="allowTicketAutoReply"
                    />
                </Section>
            </div>

            <style>{`
        .page-container {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .header-content h1 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.5rem;
          color: var(--text-primary);
          margin: 0;
        }

        .header-subtitle {
          color: var(--text-secondary);
          margin-top: 0.25rem;
          font-size: 0.875rem;
        }

        .header-actions {
          display: flex;
          gap: 0.75rem;
        }

        .settings-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .settings-section {
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          overflow: hidden;
        }

        .settings-section.danger {
          border-color: var(--danger-color);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .section-header:hover {
          background: var(--bg-hover);
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .section-description {
          padding: 0 1.25rem;
          margin: 0;
          margin-top: -0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .section-content {
          padding: 0.5rem 1.25rem 1.25rem;
          border-top: 1px solid var(--border-color);
        }

        .toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border-color);
        }

        .toggle-row:last-child {
          border-bottom: none;
        }

        .toggle-row.danger-row {
          background: rgba(239, 68, 68, 0.05);
          margin: 0 -1.25rem;
          padding: 0.75rem 1.25rem;
        }

        .toggle-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .toggle-label {
          font-weight: 500;
          color: var(--text-primary);
        }

        .toggle-description {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: var(--bg-tertiary);
          border-radius: 26px;
          transition: 0.3s;
        }

        .toggle-slider::before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.3s;
        }

        .toggle-switch input:checked + .toggle-slider {
          background: var(--primary-color);
        }

        .toggle-switch input:checked + .toggle-slider::before {
          transform: translateX(22px);
        }

        .form-select.compact,
        .form-input.compact {
          width: 150px;
          padding: 0.5rem;
          font-size: 0.875rem;
        }

        .warning-banner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 8px;
          margin-bottom: 1rem;
          color: var(--warning-color);
          font-size: 0.8rem;
        }

        .badge-danger {
          background: var(--danger-color);
          color: white;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: var(--danger-color);
        }

        .alert-success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: var(--success-color);
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          gap: 1rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
          }

          .header-actions .btn {
            flex: 1;
          }

          .toggle-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .form-select.compact,
          .form-input.compact {
            width: 100%;
          }
        }
      `}</style>
        </div>
    );
};

export default BotSettings;

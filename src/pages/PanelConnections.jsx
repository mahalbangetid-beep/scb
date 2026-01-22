import React, { useState, useEffect } from 'react';
import {
    Plug,
    CheckCircle2,
    XCircle,
    AlertCircle,
    RefreshCw,
    Settings2,
    ChevronRight,
    Loader2,
    Globe,
    Save,
    Edit3,
    Wifi,
    WifiOff,
    Package,
    RotateCcw,
    CreditCard,
    Users,
    MessageSquare,
    Info,
    Zap,
    ExternalLink,
    HelpCircle
} from 'lucide-react';
import api from '../services/api';

const PanelConnections = () => {
    const [panels, setPanels] = useState([]);
    const [selectedPanel, setSelectedPanel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState(null);
    const [editingService, setEditingService] = useState(null);
    const [manualEndpoint, setManualEndpoint] = useState('');

    // Service definitions with icons and labels
    const serviceDefinitions = {
        // Core Order endpoints
        orders: { label: 'Get Orders', icon: Package, category: 'Orders', description: 'Fetch order list' },
        ordersPull: { label: 'Pull Orders', icon: Package, category: 'Orders', description: 'Pull pending orders' },
        status: { label: 'Order Status', icon: Info, category: 'Orders', description: 'Get single order details' },
        ordersUpdate: { label: 'Update Orders', icon: Edit3, category: 'Orders', description: 'Update order status/remains' },
        ordersEditLink: { label: 'Edit Link', icon: Edit3, category: 'Orders', description: 'Edit order link' },
        ordersChangeStatus: { label: 'Change Status', icon: RefreshCw, category: 'Orders', description: 'Change order status' },
        ordersSetPartial: { label: 'Set Partial', icon: Settings2, category: 'Orders', description: 'Set order as partial' },
        ordersRequestCancel: { label: 'Request Cancel', icon: XCircle, category: 'Orders', description: 'Request order cancellation' },

        // Refill endpoints
        refill: { label: 'Resend Order', icon: RotateCcw, category: 'Refill', description: 'Resend/refill order' },
        refillPull: { label: 'Pull Refills', icon: RotateCcw, category: 'Refill', description: 'Pull refill tasks' },
        refillChangeStatus: { label: 'Refill Status', icon: RotateCcw, category: 'Refill', description: 'Change refill task status' },

        // Cancel endpoints
        cancel: { label: 'Cancel Order', icon: XCircle, category: 'Cancel', description: 'Cancel and refund order' },
        cancelPull: { label: 'Pull Cancels', icon: XCircle, category: 'Cancel', description: 'Pull cancel tasks' },
        cancelReject: { label: 'Reject Cancel', icon: XCircle, category: 'Cancel', description: 'Reject cancel request' },

        // Provider info
        providerInfo: { label: 'Provider Info', icon: Info, category: 'Provider', description: 'Get provider order details' },

        // Payments
        payments: { label: 'Get Payments', icon: CreditCard, category: 'Payments', description: 'Fetch payment list' },
        paymentsAdd: { label: 'Add Payment', icon: CreditCard, category: 'Payments', description: 'Add payment to user' },

        // Users
        users: { label: 'Get Users', icon: Users, category: 'Users', description: 'Fetch user list' },
        usersAdd: { label: 'Add User', icon: Users, category: 'Users', description: 'Create new user' },

        // Tickets
        tickets: { label: 'Get Tickets', icon: MessageSquare, category: 'Tickets', description: 'Fetch ticket list' },
        ticketsGet: { label: 'Get Ticket', icon: MessageSquare, category: 'Tickets', description: 'Get ticket details' },
        ticketsReply: { label: 'Reply Ticket', icon: MessageSquare, category: 'Tickets', description: 'Reply to ticket' },
        ticketsAdd: { label: 'Add Ticket', icon: MessageSquare, category: 'Tickets', description: 'Create new ticket' },
    };

    // Fetch all panels
    useEffect(() => {
        fetchPanels();
    }, []);

    const fetchPanels = async () => {
        setLoading(true);
        try {
            const response = await api.get('/panels');
            console.log('[PanelConnections] Raw response:', response.data);

            // Handle different response structures
            let panelList = [];
            if (response.data?.data) {
                panelList = Array.isArray(response.data.data) ? response.data.data : [];
            } else if (Array.isArray(response.data)) {
                panelList = response.data;
            }

            console.log('[PanelConnections] Panels found:', panelList.length);
            setPanels(panelList);

            // Select first panel by default
            if (panelList.length > 0 && !selectedPanel) {
                setSelectedPanel(panelList[0]);
                loadPanelScanResults(panelList[0]);
            }
        } catch (error) {
            console.error('[PanelConnections] Error fetching panels:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load scan results from panel's stored data
    const loadPanelScanResults = (panel) => {
        if (panel.endpointScanResults) {
            try {
                const results = JSON.parse(panel.endpointScanResults);
                setScanResults(results);
            } catch (e) {
                setScanResults(null);
            }
        } else {
            setScanResults(null);
        }
    };

    // Handle panel selection
    const handlePanelSelect = (panel) => {
        setSelectedPanel(panel);
        loadPanelScanResults(panel);
        setEditingService(null);
    };

    // Scan all services for a panel
    const handleScanAll = async () => {
        if (!selectedPanel) return;

        setScanning(true);
        try {
            const response = await api.post(`/panels/${selectedPanel.id}/sync-all`);
            console.log('[PanelConnections] Scan response:', response.data);

            const data = response.data?.data;

            // Reload panel to get updated scan results
            const panelsResponse = await api.get('/panels');
            let panelList = [];
            if (panelsResponse.data?.data) {
                panelList = Array.isArray(panelsResponse.data.data) ? panelsResponse.data.data : [];
            } else if (Array.isArray(panelsResponse.data)) {
                panelList = panelsResponse.data;
            }

            setPanels(panelList);

            // Find and select the updated panel
            const updatedPanel = panelList.find(p => p.id === selectedPanel.id);
            if (updatedPanel) {
                setSelectedPanel(updatedPanel);
                loadPanelScanResults(updatedPanel);
            }

            console.log('[PanelConnections] Scan completed, found:', data?.summary);
        } catch (error) {
            console.error('[PanelConnections] Error scanning:', error);
            alert('Error scanning panel: ' + (error.response?.data?.error?.message || error.message));
        } finally {
            setScanning(false);
        }
    };

    // Get status for a service
    const getServiceStatus = (serviceName) => {
        if (!scanResults) return { status: 'not_tested', endpoint: null };

        const result = scanResults[serviceName];
        if (!result) return { status: 'not_tested', endpoint: null };

        if (result.skipped) return { status: 'skipped', endpoint: null };
        if (result.detected) return { status: 'connected', endpoint: result.detected };
        return { status: 'failed', endpoint: null };
    };

    // Get panel health status
    const getPanelHealth = (panel) => {
        if (!panel.endpointScanResults) return 'not_scanned';

        try {
            const results = JSON.parse(panel.endpointScanResults);
            const coreServices = ['orders', 'refill', 'cancel', 'status'];

            let connected = 0;
            let failed = 0;

            coreServices.forEach(service => {
                if (results[service]?.detected) connected++;
                else if (!results[service]?.skipped) failed++;
            });

            if (failed === 0 && connected > 0) return 'healthy';
            if (failed > 0 && connected > 0) return 'partial';
            if (connected === 0) return 'critical';
            return 'not_scanned';
        } catch (e) {
            return 'not_scanned';
        }
    };

    // State for saving
    const [saving, setSaving] = useState(false);

    // Save manual endpoint and rescan
    const handleSaveManualEndpoint = async (serviceName) => {
        if (!manualEndpoint.trim()) {
            alert('Please enter an endpoint path');
            return;
        }

        setSaving(true);
        try {
            // Save manual endpoint to database
            await api.patch(`/panels/${selectedPanel.id}/manual-endpoint`, {
                serviceName: serviceName,
                endpoint: manualEndpoint.trim()
            });

            console.log('[PanelConnections] Manual endpoint saved:', serviceName, manualEndpoint.trim());

            // Rescan all to verify
            const response = await api.post(`/panels/${selectedPanel.id}/sync-all`);
            console.log('[PanelConnections] Rescan response:', response.data);

            // Reload panels
            const panelsResponse = await api.get('/panels');
            let panelList = [];
            if (panelsResponse.data?.data) {
                panelList = Array.isArray(panelsResponse.data.data) ? panelsResponse.data.data : [];
            } else if (Array.isArray(panelsResponse.data)) {
                panelList = panelsResponse.data;
            }

            setPanels(panelList);

            // Find and select the updated panel
            const updatedPanel = panelList.find(p => p.id === selectedPanel.id);
            if (updatedPanel) {
                setSelectedPanel(updatedPanel);
                loadPanelScanResults(updatedPanel);
            }

            alert(`Manual endpoint saved!\n\nService: ${serviceName}\nEndpoint: ${manualEndpoint.trim()}\n\nThe panel has been rescanned.`);
        } catch (error) {
            console.error('[PanelConnections] Error saving:', error);
            alert('Error saving endpoint: ' + (error.response?.data?.error?.message || error.message));
        } finally {
            setSaving(false);
            setEditingService(null);
            setManualEndpoint('');
        }
    };

    // Render status badge
    const StatusBadge = ({ status }) => {
        const configs = {
            connected: {
                icon: CheckCircle2,
                color: '#10b981', // Bright green
                bg: '#10b981',
                label: 'Connected'
            },
            failed: {
                icon: XCircle,
                color: '#ef4444', // Bright red
                bg: '#ef4444',
                label: 'Failed'
            },
            skipped: {
                icon: AlertCircle,
                color: '#f59e0b', // Bright yellow/orange
                bg: '#f59e0b',
                label: 'Skipped'
            },
            not_tested: {
                icon: Wifi,
                color: '#6b7280', // Gray
                bg: '#6b7280',
                label: 'Not Tested'
            }
        };

        const config = configs[status] || configs.not_tested;
        const Icon = config.icon;

        return (
            <div className={`status-badge status-${status}`} style={{
                background: `${config.bg}20`,
                color: config.color,
                border: `2px solid ${config.color}`,
                fontWeight: 600
            }}>
                <Icon size={14} />
                <span>{config.label}</span>
            </div>
        );
    };

    // Get tooltip explanation for status
    const getStatusTooltip = (status, serviceKey) => {
        const requiresOrderId = ['status', 'ordersEditLink', 'ordersSetPartial', 'providerInfo'];
        const requiresTicketId = ['ticketsGet', 'ticketsReply'];

        if (status === 'skipped') {
            if (requiresOrderId.includes(serviceKey)) {
                return '⚠️ Skipped: This endpoint requires an Order ID for testing. Once you have orders from this panel, rescanning will automatically test this endpoint.';
            }
            if (requiresTicketId.includes(serviceKey)) {
                return '⚠️ Skipped: This endpoint requires a Ticket ID for testing. Once you have tickets from this panel, rescanning will automatically test this endpoint.';
            }
            return '⚠️ Skipped: Requires test data that is not yet available.';
        }

        if (status === 'failed') {
            return '❌ Failed: No matching pattern found for this panel. Try setting the endpoint manually or contact your panel provider for the correct API information.';
        }

        if (status === 'not_tested') {
            return '⚪ Not Tested: This endpoint has not been scanned yet. Click "Scan All Endpoints" to start.';
        }

        return null;
    };

    // Group services by category
    const groupedServices = Object.entries(serviceDefinitions).reduce((acc, [key, def]) => {
        if (!acc[def.category]) acc[def.category] = [];
        acc[def.category].push({ key, ...def });
        return acc;
    }, {});

    if (loading) {
        return (
            <div className="panel-connections-page">
                <div className="loading-state">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Loading panels...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-connections-page">
            {/* Page Header */}
            <div className="page-header">
                <div className="header-content">
                    <Plug size={28} />
                    <div>
                        <h1>Panel Connections</h1>
                        <p>Manage and verify API endpoint connections for each SMM panel</p>
                    </div>
                </div>
            </div>

            <div className="connections-layout">
                {/* Sidebar - Panel List */}
                <div className="panels-sidebar">
                    <div className="sidebar-header">
                        <h3>SMM Panels</h3>
                        <span className="panel-count">{panels.length}</span>
                    </div>

                    <div className="panel-list">
                        {panels.length === 0 ? (
                            <div className="no-panels">
                                <WifiOff size={24} />
                                <p>No panels configured</p>
                            </div>
                        ) : (
                            panels.map(panel => {
                                const health = getPanelHealth(panel);
                                const isSelected = selectedPanel?.id === panel.id;

                                return (
                                    <div
                                        key={panel.id}
                                        className={`panel-item ${isSelected ? 'selected' : ''} health-${health}`}
                                        onClick={() => handlePanelSelect(panel)}
                                    >
                                        <div className="panel-health-indicator">
                                            {health === 'healthy' && <CheckCircle2 size={16} />}
                                            {health === 'partial' && <AlertCircle size={16} />}
                                            {health === 'critical' && <XCircle size={16} />}
                                            {health === 'not_scanned' && <Wifi size={16} />}
                                        </div>
                                        <div className="panel-info">
                                            <span className="panel-name">{panel.alias || panel.name}</span>
                                            <span className="panel-url">{new URL(panel.url).hostname}</span>
                                        </div>
                                        <ChevronRight size={16} className="chevron" />
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Main Content - Service Cards */}
                <div className="connections-content">
                    {!selectedPanel ? (
                        <div className="no-selection">
                            <Plug size={48} />
                            <h3>Select a Panel</h3>
                            <p>Choose a panel from the sidebar to view its connection status</p>
                        </div>
                    ) : (
                        <>
                            {/* Panel Info Header */}
                            <div className="panel-info-header">
                                <div className="panel-details">
                                    <Globe size={24} />
                                    <div>
                                        <h2>{selectedPanel.alias || selectedPanel.name}</h2>
                                        <a href={selectedPanel.url} target="_blank" rel="noopener noreferrer">
                                            {selectedPanel.url} <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </div>
                                <div className="panel-actions">
                                    <button
                                        className="btn-scan"
                                        onClick={handleScanAll}
                                        disabled={scanning}
                                    >
                                        {scanning ? (
                                            <>
                                                <Loader2 className="animate-spin" size={18} />
                                                Scanning...
                                            </>
                                        ) : (
                                            <>
                                                <Zap size={18} />
                                                Scan All Endpoints
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Connection Status Summary */}
                            {scanResults && (
                                <div className="status-summary">
                                    <div className="summary-item success">
                                        <CheckCircle2 size={20} />
                                        <span>{Object.values(scanResults).filter(r => r?.detected).length}</span>
                                        <label>Connected</label>
                                    </div>
                                    <div className="summary-item danger">
                                        <XCircle size={20} />
                                        <span>{Object.values(scanResults).filter(r => !r?.detected && !r?.skipped).length}</span>
                                        <label>Failed</label>
                                    </div>
                                    <div className="summary-item warning">
                                        <AlertCircle size={20} />
                                        <span>{Object.values(scanResults).filter(r => r?.skipped).length}</span>
                                        <label>Skipped</label>
                                    </div>
                                </div>
                            )}

                            {/* Service Cards by Category */}
                            <div className="services-grid">
                                {Object.entries(groupedServices).map(([category, services]) => (
                                    <div key={category} className="service-category">
                                        <h3 className="category-title">{category}</h3>
                                        <div className="category-cards">
                                            {services.map(service => {
                                                const { status, endpoint } = getServiceStatus(service.key);
                                                const Icon = service.icon;
                                                const isEditing = editingService === service.key;
                                                const tooltip = getStatusTooltip(status, service.key);

                                                return (
                                                    <div
                                                        key={service.key}
                                                        className={`service-card status-${status}`}
                                                    >
                                                        <div className="card-header">
                                                            <div className="service-icon">
                                                                <Icon size={20} />
                                                            </div>
                                                            <div className="service-info">
                                                                <h4>{service.label}</h4>
                                                                <p>{service.description}</p>
                                                            </div>
                                                            <div className="status-wrapper">
                                                                <StatusBadge status={status} />
                                                                {tooltip && (
                                                                    <div className="tooltip-container">
                                                                        <HelpCircle size={16} className="help-icon" />
                                                                        <div className="tooltip-content">
                                                                            {tooltip}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="card-body">
                                                            {endpoint ? (
                                                                <code className="endpoint-display">{endpoint}</code>
                                                            ) : (
                                                                <span className="no-endpoint">
                                                                    {status === 'skipped' ? 'Requires test data' : 'Not detected'}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {(status === 'failed' || status === 'skipped' || status === 'not_tested') && (
                                                            <div className="card-footer">
                                                                {isEditing ? (
                                                                    <div className="manual-input">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="/adminapi/v1 or /adminapi/v2/..."
                                                                            value={manualEndpoint}
                                                                            onChange={(e) => setManualEndpoint(e.target.value)}
                                                                        />
                                                                        <button
                                                                            className="btn-save"
                                                                            onClick={() => handleSaveManualEndpoint(service.key)}
                                                                            title="Save & Rescan"
                                                                            disabled={saving}
                                                                        >
                                                                            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                                                                        </button>
                                                                        <button
                                                                            className="btn-cancel"
                                                                            onClick={() => setEditingService(null)}
                                                                            title="Cancel"
                                                                            disabled={saving}
                                                                        >
                                                                            <XCircle size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="card-actions">
                                                                        <button
                                                                            className="btn-manual"
                                                                            onClick={() => {
                                                                                setEditingService(service.key);
                                                                                setManualEndpoint('');
                                                                            }}
                                                                            title="Set endpoint manually"
                                                                        >
                                                                            <Edit3 size={14} />
                                                                            Set Manual
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* No Scan Results */}
                            {!scanResults && (
                                <div className="no-scan-results">
                                    <Wifi size={48} />
                                    <h3>No Scan Data</h3>
                                    <p>Click "Scan All Endpoints" to detect available API endpoints for this panel</p>
                                    <button className="btn-primary" onClick={handleScanAll} disabled={scanning}>
                                        {scanning ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                                        {scanning ? 'Scanning...' : 'Start Scan'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .panel-connections-page {
                    padding: var(--spacing-lg);
                    min-height: 100vh;
                    background: var(--bg-primary);
                }
                
                .page-header {
                    margin-bottom: var(--spacing-xl);
                }
                
                .header-content {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                }
                
                .header-content svg {
                    color: var(--primary-500);
                }
                
                .header-content h1 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    margin: 0;
                }
                
                .header-content p {
                    color: var(--text-secondary);
                    margin: 0;
                }
                
                .connections-layout {
                    display: grid;
                    grid-template-columns: 280px 1fr;
                    gap: var(--spacing-lg);
                    min-height: calc(100vh - 200px);
                }
                
                /* Sidebar */
                .panels-sidebar {
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }
                
                .sidebar-header {
                    padding: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .sidebar-header h3 {
                    font-size: 0.9rem;
                    font-weight: 600;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-secondary);
                }
                
                .panel-count {
                    background: var(--primary-500);
                    color: white;
                    padding: 2px 8px;
                    border-radius: var(--radius-full);
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                
                .panel-list {
                    max-height: calc(100vh - 300px);
                    overflow-y: auto;
                }
                
                .panel-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    cursor: pointer;
                    border-bottom: 1px solid var(--border-color);
                    transition: all 0.2s ease;
                }
                
                .panel-item:hover {
                    background: var(--bg-tertiary);
                }
                
                .panel-item.selected {
                    background: var(--primary-500)15;
                    border-left: 3px solid var(--primary-500);
                }
                
                .panel-health-indicator {
                    width: 32px;
                    height: 32px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .panel-item.health-healthy .panel-health-indicator {
                    background: var(--success-500)20;
                    color: var(--success-500);
                }
                
                .panel-item.health-partial .panel-health-indicator {
                    background: var(--warning-500)20;
                    color: var(--warning-500);
                }
                
                .panel-item.health-critical .panel-health-indicator {
                    background: var(--danger-500)20;
                    color: var(--danger-500);
                }
                
                .panel-item.health-not_scanned .panel-health-indicator {
                    background: var(--text-tertiary)20;
                    color: var(--text-tertiary);
                }
                
                .panel-info {
                    flex: 1;
                    min-width: 0;
                }
                
                .panel-name {
                    display: block;
                    font-weight: 600;
                    font-size: 0.9rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .panel-url {
                    display: block;
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .chevron {
                    color: var(--text-tertiary);
                    transition: transform 0.2s;
                }
                
                .panel-item.selected .chevron {
                    transform: translateX(3px);
                    color: var(--primary-500);
                }
                
                .no-panels {
                    padding: var(--spacing-xl);
                    text-align: center;
                    color: var(--text-tertiary);
                }
                
                .no-panels svg {
                    margin-bottom: var(--spacing-sm);
                }
                
                /* Main Content */
                .connections-content {
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    padding: var(--spacing-lg);
                    overflow-y: auto;
                }
                
                .no-selection {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    min-height: 400px;
                    color: var(--text-tertiary);
                    text-align: center;
                }
                
                .no-selection h3 {
                    margin: var(--spacing-md) 0 var(--spacing-sm);
                }
                
                .panel-info-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                    margin-bottom: var(--spacing-lg);
                }
                
                .panel-details {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                }
                
                .panel-details svg {
                    color: var(--primary-500);
                }
                
                .panel-details h2 {
                    margin: 0;
                    font-size: 1.25rem;
                }
                
                .panel-details a {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .panel-details a:hover {
                    color: var(--primary-500);
                }
                
                .btn-scan {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-lg);
                    background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
                    color: white;
                    border: none;
                    border-radius: var(--radius-md);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-scan:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px var(--primary-500)40;
                }
                
                .btn-scan:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                
                /* Status Summary */
                .status-summary {
                    display: flex;
                    gap: var(--spacing-lg);
                    margin-bottom: var(--spacing-xl);
                }
                
                .summary-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--border-color);
                }
                
                .summary-item.success {
                    border-color: var(--success-500)40;
                }
                
                .summary-item.success svg {
                    color: var(--success-500);
                }
                
                .summary-item.danger {
                    border-color: var(--danger-500)40;
                }
                
                .summary-item.danger svg {
                    color: var(--danger-500);
                }
                
                .summary-item.warning {
                    border-color: var(--warning-500)40;
                }
                
                .summary-item.warning svg {
                    color: var(--warning-500);
                }
                
                .summary-item span {
                    font-size: 1.5rem;
                    font-weight: 700;
                }
                
                .summary-item label {
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }
                
                /* Services Grid */
                .services-grid {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xl);
                }
                
                .service-category {
                    margin-bottom: var(--spacing-md);
                }
                
                .category-title {
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-md);
                    padding-bottom: var(--spacing-sm);
                    border-bottom: 1px solid var(--border-color);
                }
                
                .category-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: var(--spacing-md);
                }
                
                /* Service Card */
                .service-card {
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    transition: all 0.2s;
                }
                
                .service-card:hover {
                    border-color: var(--primary-500)50;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .service-card.status-connected {
                    border-left: 3px solid var(--success-500);
                }
                
                .service-card.status-failed {
                    border-left: 3px solid var(--danger-500);
                }
                
                .service-card.status-skipped {
                    border-left: 3px solid var(--warning-500);
                }
                
                .service-card.status-not_tested {
                    border-left: 3px solid var(--text-tertiary);
                }
                
                .card-header {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                }
                
                .service-icon {
                    width: 36px;
                    height: 36px;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-500);
                }
                
                .service-info {
                    flex: 1;
                    min-width: 0;
                }
                
                .service-info h4 {
                    margin: 0;
                    font-size: 0.9rem;
                    font-weight: 600;
                }
                
                .service-info p {
                    margin: 2px 0 0;
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                }
                
                .status-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .status-badge {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: var(--radius-full);
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                
                .tooltip-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                
                .help-icon {
                    color: var(--text-tertiary);
                    cursor: help;
                    transition: color 0.2s;
                }
                
                .tooltip-container:hover .help-icon {
                    color: var(--primary-500);
                }
                
                .tooltip-content {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    margin-top: 8px;
                    padding: 12px 16px;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                    font-size: 0.8rem;
                    font-weight: 400;
                    line-height: 1.5;
                    color: var(--text-primary);
                    width: 280px;
                    z-index: 100;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-8px);
                    transition: all 0.2s ease;
                }
                
                .tooltip-container:hover .tooltip-content {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                
                .tooltip-content::before {
                    content: '';
                    position: absolute;
                    top: -6px;
                    right: 12px;
                    width: 12px;
                    height: 12px;
                    background: var(--bg-primary);
                    border-left: 1px solid var(--border-color);
                    border-top: 1px solid var(--border-color);
                    transform: rotate(45deg);
                }
                
                .card-body {
                    padding: 0 var(--spacing-md) var(--spacing-md);
                }
                
                .endpoint-display {
                    display: block;
                    background: var(--bg-tertiary);
                    padding: var(--spacing-sm);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-family: 'Fira Code', monospace;
                    color: var(--primary-500);
                    word-break: break-all;
                }
                
                .no-endpoint {
                    color: var(--text-tertiary);
                    font-size: 0.8rem;
                    font-style: italic;
                }
                
                .card-footer {
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                }
                
                .card-actions {
                    display: flex;
                    gap: var(--spacing-xs);
                }
                
                .btn-manual {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: 6px 12px;
                    background: linear-gradient(135deg, #6366f1, #4f46e5);
                    border: none;
                    border-radius: var(--radius-sm);
                    color: white;
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-manual:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
                }
                
                .manual-input {
                    display: flex;
                    gap: var(--spacing-xs);
                }
                
                .manual-input input {
                    flex: 1;
                    padding: 6px 10px;
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    font-size: 0.8rem;
                    font-family: 'Fira Code', monospace;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    transition: border-color 0.2s;
                }
                
                .manual-input input::placeholder {
                    color: var(--text-tertiary);
                    opacity: 0.7;
                }
                
                .manual-input input:focus {
                    outline: none;
                    border-color: var(--primary-500);
                }
                
                .manual-input button {
                    padding: 6px 10px;
                    border: none;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                
                .manual-input .btn-save {
                    background: #10b981;
                    color: white;
                }
                
                .manual-input .btn-save:hover {
                    background: #059669;
                }
                
                .manual-input .btn-cancel {
                    background: #6b7280;
                    color: white;
                }
                
                .manual-input .btn-cancel:hover {
                    background: #4b5563;
                }
                
                /* No Scan Results */
                .no-scan-results {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-xxl);
                    text-align: center;
                    color: var(--text-tertiary);
                }
                
                .no-scan-results svg {
                    margin-bottom: var(--spacing-md);
                    opacity: 0.5;
                }
                
                .no-scan-results h3 {
                    margin: 0 0 var(--spacing-sm);
                    color: var(--text-primary);
                }
                
                .no-scan-results p {
                    margin-bottom: var(--spacing-lg);
                }
                
                .btn-primary {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-lg);
                    background: var(--primary-500);
                    color: white;
                    border: none;
                    border-radius: var(--radius-md);
                    font-weight: 600;
                    cursor: pointer;
                }
                
                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 50vh;
                    color: var(--text-tertiary);
                }
                
                .loading-state svg {
                    margin-bottom: var(--spacing-md);
                    color: var(--primary-500);
                }
                
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                
                /* Responsive */
                @media (max-width: 1024px) {
                    .connections-layout {
                        grid-template-columns: 1fr;
                    }
                    
                    .panels-sidebar {
                        order: -1;
                    }
                    
                    .panel-list {
                        display: flex;
                        overflow-x: auto;
                        max-height: none;
                        padding: var(--spacing-sm);
                        gap: var(--spacing-sm);
                    }
                    
                    .panel-item {
                        min-width: 200px;
                        border-bottom: none;
                        border-radius: var(--radius-md);
                        border: 1px solid var(--border-color);
                    }
                }
            `}</style>
        </div>
    );
};

export default PanelConnections;

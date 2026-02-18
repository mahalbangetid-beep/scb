import { useState, useEffect } from 'react';
import { Smartphone, Globe, Layers, ChevronDown } from 'lucide-react';
import api from '../services/api';

/**
 * ScopeSelector — Device & Panel scope picker
 * 
 * Used for per-device/per-panel bot settings and command templates (Section 17).
 * Shows dropdowns for Device and Panel selection.
 * Calls onChange({ deviceId, panelId }) when scope changes.
 */
export default function ScopeSelector({ deviceId, panelId, onChange }) {
    const [devices, setDevices] = useState([]);
    const [panels, setPanels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [devRes, panelRes] = await Promise.all([
                    api.get('/devices'),
                    api.get('/panels')
                ]);
                setDevices(devRes.data || []);
                setPanels(panelRes.data || []);
            } catch (err) {
                console.error('ScopeSelector: Failed to load devices/panels', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const getScopeLabel = () => {
        const dev = devices.find(d => d.id === deviceId);
        const panel = panels.find(p => p.id === panelId);

        if (dev && panel) return `${dev.name || dev.phone} + ${panel.alias || panel.name}`;
        if (dev) return dev.name || dev.phone;
        if (panel) return panel.alias || panel.name;
        return 'Default (All)';
    };

    const getScopeType = () => {
        if (deviceId && panelId) return 'device-panel';
        if (deviceId) return 'device';
        if (panelId) return 'panel';
        return 'default';
    };

    const scopeType = getScopeType();

    return (
        <div className="scope-selector">
            <div className="scope-indicator">
                <div className={`scope-badge scope-${scopeType}`}>
                    {scopeType === 'default' && <Layers size={14} />}
                    {scopeType === 'device' && <Smartphone size={14} />}
                    {scopeType === 'panel' && <Globe size={14} />}
                    {scopeType === 'device-panel' && <><Smartphone size={14} /><span>+</span><Globe size={14} /></>}
                    <span>{getScopeLabel()}</span>
                </div>
            </div>

            <div className="scope-dropdowns">
                <div className="scope-field">
                    <label>
                        <Smartphone size={14} />
                        <span>Device</span>
                    </label>
                    <select
                        value={deviceId || ''}
                        onChange={(e) => onChange({ deviceId: e.target.value || null, panelId })}
                        disabled={loading}
                    >
                        <option value="">All Devices (Default)</option>
                        {devices.map(d => (
                            <option key={d.id} value={d.id}>
                                {d.name || d.phone || d.id}
                                {d.status === 'connected' ? ' 🟢' : ' ⚪'}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="scope-field">
                    <label>
                        <Globe size={14} />
                        <span>Panel</span>
                    </label>
                    <select
                        value={panelId || ''}
                        onChange={(e) => onChange({ deviceId, panelId: e.target.value || null })}
                        disabled={loading}
                    >
                        <option value="">All Panels (Default)</option>
                        {panels.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.alias || p.name || p.url}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <style>{`
                .scope-selector {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.75rem 1rem;
                    background: var(--bg-card, #1a1a2e);
                    border: 1px solid var(--border-color, #2a2a4a);
                    border-radius: 12px;
                    margin-bottom: 1.25rem;
                    flex-wrap: wrap;
                }

                .scope-indicator {
                    flex-shrink: 0;
                }

                .scope-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    padding: 0.375rem 0.75rem;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    white-space: nowrap;
                }

                .scope-default {
                    background: rgba(100, 116, 139, 0.15);
                    color: #94a3b8;
                    border: 1px solid rgba(100, 116, 139, 0.25);
                }

                .scope-device {
                    background: rgba(59, 130, 246, 0.12);
                    color: #60a5fa;
                    border: 1px solid rgba(59, 130, 246, 0.25);
                }

                .scope-panel {
                    background: rgba(168, 85, 247, 0.12);
                    color: #c084fc;
                    border: 1px solid rgba(168, 85, 247, 0.25);
                }

                .scope-device-panel {
                    background: rgba(37, 211, 102, 0.12);
                    color: #4ade80;
                    border: 1px solid rgba(37, 211, 102, 0.25);
                }

                .scope-dropdowns {
                    display: flex;
                    gap: 0.75rem;
                    flex: 1;
                    min-width: 0;
                    flex-wrap: wrap;
                }

                .scope-field {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                    min-width: 180px;
                    flex: 1;
                }

                .scope-field label {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-secondary, #8892b0);
                    font-weight: 600;
                }

                .scope-field select {
                    padding: 0.5rem 0.75rem;
                    border-radius: 8px;
                    border: 1px solid var(--border-color, #2a2a4a);
                    background: var(--bg-secondary, #0d1117);
                    color: var(--text-primary, #e2e8f0);
                    font-size: 0.85rem;
                    cursor: pointer;
                    outline: none;
                    transition: border-color 0.2s;
                    appearance: auto;
                }

                .scope-field select:hover {
                    border-color: var(--primary-color, #25d366);
                }

                .scope-field select:focus {
                    border-color: var(--primary-color, #25d366);
                    box-shadow: 0 0 0 2px rgba(37, 211, 102, 0.15);
                }

                @media (max-width: 640px) {
                    .scope-selector {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .scope-dropdowns {
                        flex-direction: column;
                    }
                }
            `}</style>
        </div>
    );
}

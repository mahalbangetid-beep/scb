import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, RotateCcw, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import api from '../services/api';

/**
 * CommandAliasEditor — Standalone component for managing custom command aliases.
 * 
 * Reads/writes the Setting key 'custom_command_aliases' via existing /api/settings API.
 * Does NOT modify any bot logic — only stores user-defined aliases that
 * commandParser.js already reads from the Setting table.
 * 
 * Format stored: JSON string of { cancel: ["word1","word2"], refill: ["word3"] }
 */

const DEFAULT_ALIASES = {
    refill: ['refill', 'rf', 'isi', 'reff', 'refil'],
    cancel: ['cancel', 'cancelled', 'cancelll', 'batal', 'cn', 'batalkan', 'refund', 'refunded', 'return', 'firta paisa'],
    speedup: ['speedup', 'speed-up', 'speed up', 'speed', 'cepat', 'sp', 'fast'],
    status: ['status', 'cek', 'check', 'st', 'info']
};

const COMMAND_INFO = {
    refill: { label: 'Refill', emoji: '🔄', color: '#10b981' },
    cancel: { label: 'Cancel / Refund', emoji: '❌', color: '#ef4444' },
    speedup: { label: 'Speed-Up', emoji: '⚡', color: '#f59e0b' },
    status: { label: 'Status', emoji: '📊', color: '#3b82f6' }
};

const CommandAliasEditor = () => {
    const [customAliases, setCustomAliases] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [newWords, setNewWords] = useState({ refill: '', cancel: '', speedup: '', status: '' });
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    const showFeedback = useCallback((type, message) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
    }, []);

    // Load custom aliases from settings
    useEffect(() => {
        const loadAliases = async () => {
            try {
                setLoading(true);
                const response = await api.get('/settings');
                const allSettings = response.data || response;
                const raw = allSettings.custom_command_aliases;
                if (raw) {
                    try {
                        setCustomAliases(JSON.parse(raw));
                    } catch {
                        setCustomAliases({});
                    }
                } else {
                    setCustomAliases({});
                }
            } catch (err) {
                console.error('Failed to load command aliases:', err);
            } finally {
                setLoading(false);
            }
        };
        loadAliases();
    }, []);

    // Save custom aliases
    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put('/settings/custom_command_aliases', {
                value: JSON.stringify(customAliases)
            });
            showFeedback('success', 'Command aliases saved successfully!');
        } catch (err) {
            showFeedback('error', 'Failed to save command aliases');
        } finally {
            setSaving(false);
        }
    };

    // Add a new alias word to a command
    const handleAddWord = (command) => {
        const word = newWords[command]?.trim().toLowerCase();
        if (!word) return;

        // Check if already in defaults
        if (DEFAULT_ALIASES[command]?.includes(word)) {
            showFeedback('error', `"${word}" is already a default alias for ${command}`);
            return;
        }

        // Check if already in custom
        if (customAliases[command]?.includes(word)) {
            showFeedback('error', `"${word}" is already added`);
            return;
        }

        // Check if used by another command
        for (const [cmd, aliases] of Object.entries(DEFAULT_ALIASES)) {
            if (aliases.includes(word) && cmd !== command) {
                showFeedback('error', `"${word}" is already used by ${cmd} command`);
                return;
            }
        }
        for (const [cmd, aliases] of Object.entries(customAliases)) {
            if (aliases?.includes(word) && cmd !== command) {
                showFeedback('error', `"${word}" is already a custom alias for ${cmd}`);
                return;
            }
        }

        setCustomAliases(prev => ({
            ...prev,
            [command]: [...(prev[command] || []), word]
        }));
        setNewWords(prev => ({ ...prev, [command]: '' }));
    };

    // Remove a custom alias word
    const handleRemoveWord = (command, word) => {
        setCustomAliases(prev => ({
            ...prev,
            [command]: (prev[command] || []).filter(w => w !== word)
        }));
    };

    // Reset all custom aliases
    const handleReset = () => {
        if (!window.confirm('Remove all custom aliases? Default aliases will remain.')) return;
        setCustomAliases({});
    };

    const handleKeyDown = (e, command) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddWord(command);
        }
    };

    const hasCustomAliases = Object.values(customAliases).some(arr => arr?.length > 0);

    return (
        <div className="ca-editor">
            <div className="ca-header" onClick={() => setExpanded(!expanded)}>
                <div className="ca-header-left">
                    <Tag size={20} />
                    <span>Command Keyword Aliases</span>
                </div>
                {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </div>
            {expanded && (
                <p className="ca-subtitle">
                    Add or remove keywords that trigger bot commands. Default keywords are built-in and cannot be removed.
                </p>
            )}

            {expanded && (
                <div className="ca-content">
                    {feedback.message && (
                        <div className={`ca-feedback ca-feedback-${feedback.type}`}>
                            {feedback.message}
                        </div>
                    )}

                    {loading ? (
                        <div className="ca-loading">Loading aliases...</div>
                    ) : (
                        <>
                            {Object.entries(COMMAND_INFO).map(([command, info]) => (
                                <div className="ca-command-block" key={command}>
                                    <div className="ca-command-title">
                                        <span>{info.emoji}</span>
                                        <span style={{ color: info.color, fontWeight: 600 }}>{info.label}</span>
                                    </div>

                                    {/* Default aliases (read-only) */}
                                    <div className="ca-tags">
                                        {DEFAULT_ALIASES[command].map(alias => (
                                            <span className="ca-tag ca-tag-default" key={alias}>
                                                {alias}
                                            </span>
                                        ))}

                                        {/* Custom aliases (removable) */}
                                        {(customAliases[command] || []).map(alias => (
                                            <span className="ca-tag ca-tag-custom" key={alias}>
                                                {alias}
                                                <button
                                                    className="ca-tag-remove"
                                                    onClick={() => handleRemoveWord(command, alias)}
                                                    title="Remove alias"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>

                                    {/* Add new alias */}
                                    <div className="ca-add-row">
                                        <input
                                            type="text"
                                            className="ca-input"
                                            value={newWords[command]}
                                            onChange={(e) => setNewWords(prev => ({ ...prev, [command]: e.target.value }))}
                                            onKeyDown={(e) => handleKeyDown(e, command)}
                                            placeholder={`Add new keyword for ${info.label}...`}
                                        />
                                        <button
                                            className="ca-btn-add"
                                            onClick={() => handleAddWord(command)}
                                            disabled={!newWords[command]?.trim()}
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Action buttons */}
                            <div className="ca-actions">
                                {hasCustomAliases && (
                                    <button className="ca-btn ca-btn-reset" onClick={handleReset}>
                                        <RotateCcw size={16} />
                                        Reset Custom
                                    </button>
                                )}
                                <button
                                    className="ca-btn ca-btn-save"
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    <Save size={16} />
                                    {saving ? 'Saving...' : 'Save Aliases'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            <style>{`
                .ca-editor {
                    background: var(--bg-secondary, #1a1d23);
                    border: 1px solid var(--border-color, #2d3748);
                    border-radius: 12px;
                    overflow: hidden;
                }
                .ca-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .ca-header:hover {
                    background: rgba(255,255,255,0.03);
                }
                .ca-header-left {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-weight: 600;
                    font-size: 15px;
                    color: var(--text-primary, #e2e8f0);
                }
                .ca-subtitle {
                    padding: 0 20px 8px;
                    margin: 0;
                    font-size: 13px;
                    color: var(--text-secondary, #94a3b8);
                    line-height: 1.5;
                }
                .ca-content {
                    padding: 0 20px 20px;
                }
                .ca-loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--text-secondary, #94a3b8);
                }
                .ca-feedback {
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    margin-bottom: 12px;
                }
                .ca-feedback-success {
                    background: rgba(16, 185, 129, 0.15);
                    color: #10b981;
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }
                .ca-feedback-error {
                    background: rgba(239, 68, 68, 0.15);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                .ca-command-block {
                    margin-bottom: 16px;
                    padding: 14px;
                    background: rgba(255,255,255,0.02);
                    border: 1px solid var(--border-color, #2d3748);
                    border-radius: 10px;
                }
                .ca-command-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    margin-bottom: 10px;
                }
                .ca-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 10px;
                }
                .ca-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-family: 'SF Mono', 'Consolas', monospace;
                }
                .ca-tag-default {
                    background: rgba(100, 116, 139, 0.2);
                    color: #94a3b8;
                    border: 1px solid rgba(100, 116, 139, 0.3);
                }
                .ca-tag-custom {
                    background: rgba(59, 130, 246, 0.15);
                    color: #60a5fa;
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                .ca-tag-remove {
                    background: none;
                    border: none;
                    color: #ef4444;
                    cursor: pointer;
                    padding: 0 2px;
                    font-size: 16px;
                    line-height: 1;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                .ca-tag-remove:hover {
                    opacity: 1;
                }
                .ca-add-row {
                    display: flex;
                    gap: 8px;
                }
                .ca-input {
                    flex: 1;
                    padding: 8px 12px;
                    background: var(--bg-primary, #0f1117);
                    border: 1px solid var(--border-color, #2d3748);
                    border-radius: 8px;
                    color: var(--text-primary, #e2e8f0);
                    font-size: 13px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .ca-input:focus {
                    border-color: #3b82f6;
                }
                .ca-input::placeholder {
                    color: var(--text-secondary, #64748b);
                }
                .ca-btn-add {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 36px;
                    height: 36px;
                    background: rgba(59, 130, 246, 0.2);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    border-radius: 8px;
                    color: #3b82f6;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ca-btn-add:hover:not(:disabled) {
                    background: rgba(59, 130, 246, 0.3);
                }
                .ca-btn-add:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
                .ca-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-color, #2d3748);
                }
                .ca-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }
                .ca-btn-save {
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: #fff;
                }
                .ca-btn-save:hover:not(:disabled) {
                    background: linear-gradient(135deg, #2563eb, #1d4ed8);
                }
                .ca-btn-save:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .ca-btn-reset {
                    background: rgba(239, 68, 68, 0.15);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                .ca-btn-reset:hover {
                    background: rgba(239, 68, 68, 0.25);
                }
            `}</style>
        </div>
    );
};

export default CommandAliasEditor;

import { useState, useEffect } from 'react';
import {
    MessageSquare, Save, RotateCcw, Eye, ChevronDown, ChevronUp,
    AlertCircle, CheckCircle, Copy, RefreshCw, Zap, XCircle,
    HelpCircle, FileText
} from 'lucide-react';
import api from '../services/api';

const COMMAND_CATEGORIES = [
    {
        id: 'status',
        name: 'Status',
        icon: <FileText size={18} />,
        commands: ['STATUS'],
        description: 'When user checks order status'
    },
    {
        id: 'refill',
        name: 'Refill',
        icon: <RefreshCw size={18} />,
        commands: ['REFILL_SUCCESS', 'REFILL_PENDING', 'REFILL_ALREADY'],
        description: 'Refill request responses'
    },
    {
        id: 'cancel',
        name: 'Cancel',
        icon: <XCircle size={18} />,
        commands: ['CANCEL_SUCCESS', 'CANCEL_NOT_ALLOWED'],
        description: 'Cancel request responses'
    },
    {
        id: 'speedup',
        name: 'Speed-up',
        icon: <Zap size={18} />,
        commands: ['SPEEDUP_SUCCESS'],
        description: 'Speed-up request responses'
    },
    {
        id: 'errors',
        name: 'Errors',
        icon: <AlertCircle size={18} />,
        commands: ['ERROR_NOT_FOUND', 'ERROR_NOT_OWNER', 'ERROR_GENERIC', 'ERROR_RATE_LIMITED', 'ERROR_COOLDOWN'],
        description: 'Error messages'
    }
];

function CommandTemplates() {
    const [templates, setTemplates] = useState({});
    const [variables, setVariables] = useState({});
    const [commandList, setCommandList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeCategory, setActiveCategory] = useState('status');
    const [activeCommand, setActiveCommand] = useState('STATUS');
    const [editedTemplate, setEditedTemplate] = useState('');
    const [preview, setPreview] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [saveStatus, setSaveStatus] = useState({ show: false, success: false, message: '' });
    const [expandedVariables, setExpandedVariables] = useState(true);

    useEffect(() => {
        fetchTemplates();
    }, []);

    useEffect(() => {
        if (templates[activeCommand]) {
            setEditedTemplate(templates[activeCommand].template || '');
        }
    }, [activeCommand, templates]);

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const response = await api.get('/command-templates');
            setTemplates(response.data.templates || {});
            setVariables(response.data.variables || {});
            setCommandList(response.data.commandList || []);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePreview = async () => {
        try {
            const response = await api.post('/command-templates/preview', {
                template: editedTemplate
            });
            setPreview(response.data.preview);
            setShowPreview(true);
        } catch (error) {
            console.error('Preview failed:', error);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put(`/command-templates/${activeCommand}`, {
                template: editedTemplate
            });

            // Update local state
            setTemplates(prev => ({
                ...prev,
                [activeCommand]: {
                    ...prev[activeCommand],
                    template: editedTemplate,
                    isCustom: true
                }
            }));

            setSaveStatus({ show: true, success: true, message: 'Template saved!' });
            setTimeout(() => setSaveStatus({ show: false, success: false, message: '' }), 3000);
        } catch (error) {
            setSaveStatus({ show: true, success: false, message: 'Failed to save' });
            setTimeout(() => setSaveStatus({ show: false, success: false, message: '' }), 3000);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Reset this template to default?')) return;

        try {
            const response = await api.delete(`/command-templates/${activeCommand}`);
            const newTemplate = response.data.template || '';
            setEditedTemplate(newTemplate);
            setTemplates(prev => ({
                ...prev,
                [activeCommand]: {
                    ...prev[activeCommand],
                    template: newTemplate,
                    isCustom: false
                }
            }));
            setSaveStatus({ show: true, success: true, message: 'Reset to default!' });
            setTimeout(() => setSaveStatus({ show: false, success: false, message: '' }), 3000);
        } catch (error) {
            console.error('Reset failed:', error);
        }
    };

    const insertVariable = (varName) => {
        const textarea = document.getElementById('template-editor');
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newValue = editedTemplate.substring(0, start) + `{${varName}}` + editedTemplate.substring(end);
            setEditedTemplate(newValue);
            // Focus back and set cursor
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + varName.length + 2, start + varName.length + 2);
            }, 0);
        } else {
            setEditedTemplate(prev => prev + `{${varName}}`);
        }
    };

    const copyVariable = (varName) => {
        navigator.clipboard.writeText(`{${varName}}`);
    };

    const getCommandInfo = (command) => {
        return commandList.find(c => c.command === command) || {};
    };

    const formatCommandName = (command) => {
        return command.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-spinner">Loading templates...</div>
            </div>
        );
    }

    const currentCommandInfo = getCommandInfo(activeCommand);
    const currentCategory = COMMAND_CATEGORIES.find(c => c.id === activeCategory);

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <MessageSquare size={28} />
                        Command Templates
                    </h1>
                    <p className="page-subtitle">
                        Customize bot responses for each command type
                    </p>
                </div>
            </div>

            <div className="command-templates-layout">
                {/* Left Sidebar - Categories & Commands */}
                <div className="templates-sidebar">
                    <div className="sidebar-section">
                        <h3 className="sidebar-title">Commands</h3>
                        {COMMAND_CATEGORIES.map(category => (
                            <div key={category.id} className="command-category">
                                <button
                                    className={`category-header ${activeCategory === category.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveCategory(category.id);
                                        setActiveCommand(category.commands[0]);
                                    }}
                                >
                                    {category.icon}
                                    <span>{category.name}</span>
                                    <span className="command-count">{category.commands.length}</span>
                                </button>

                                {activeCategory === category.id && (
                                    <div className="category-commands">
                                        {category.commands.map(cmd => (
                                            <button
                                                key={cmd}
                                                className={`command-item ${activeCommand === cmd ? 'active' : ''}`}
                                                onClick={() => setActiveCommand(cmd)}
                                            >
                                                <span>{formatCommandName(cmd)}</span>
                                                {templates[cmd]?.isCustom && (
                                                    <span className="custom-badge">Custom</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content - Editor */}
                <div className="templates-main">
                    {/* Command Info */}
                    <div className="template-header">
                        <div className="template-info">
                            <h2>{formatCommandName(activeCommand)}</h2>
                            <p>{currentCommandInfo.description || 'Template for this command'}</p>
                        </div>
                        <div className="template-actions">
                            {saveStatus.show && (
                                <span className={`save-status ${saveStatus.success ? 'success' : 'error'}`}>
                                    {saveStatus.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                    {saveStatus.message}
                                </span>
                            )}
                            <button
                                className="btn btn-secondary"
                                onClick={handleReset}
                                title="Reset to default"
                            >
                                <RotateCcw size={16} />
                                Reset
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={handlePreview}
                            >
                                <Eye size={16} />
                                Preview
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                <Save size={16} />
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>

                    {/* Editor */}
                    <div className="template-editor-container">
                        <textarea
                            id="template-editor"
                            className="template-editor"
                            value={editedTemplate}
                            onChange={(e) => setEditedTemplate(e.target.value)}
                            placeholder="Enter your template here..."
                            rows={15}
                        />
                    </div>

                    {/* Preview Panel */}
                    {showPreview && (
                        <div className="preview-panel">
                            <div className="preview-header">
                                <h3>
                                    <Eye size={18} />
                                    Preview
                                </h3>
                                <button
                                    className="btn-icon"
                                    onClick={() => setShowPreview(false)}
                                >
                                    <XCircle size={18} />
                                </button>
                            </div>
                            <div className="preview-content">
                                <pre>{preview}</pre>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar - Variables */}
                <div className="templates-variables">
                    <div className="variables-header">
                        <h3>
                            <HelpCircle size={18} />
                            Available Variables
                        </h3>
                        <button
                            className="btn-icon"
                            onClick={() => setExpandedVariables(!expandedVariables)}
                        >
                            {expandedVariables ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                    </div>

                    {expandedVariables && (
                        <div className="variables-list">
                            {Object.entries(variables).map(([name, info]) => (
                                <div key={name} className="variable-item">
                                    <div className="variable-info">
                                        <code className="variable-name">{`{${name}}`}</code>
                                        <span className="variable-desc">{info.description}</span>
                                        <span className="variable-example">e.g., {info.example}</span>
                                    </div>
                                    <div className="variable-actions">
                                        <button
                                            className="btn-icon small"
                                            onClick={() => insertVariable(name)}
                                            title="Insert"
                                        >
                                            +
                                        </button>
                                        <button
                                            className="btn-icon small"
                                            onClick={() => copyVariable(name)}
                                            title="Copy"
                                        >
                                            <Copy size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="variables-tips">
                        <h4>Tips:</h4>
                        <ul>
                            <li>Use <code>*text*</code> for <strong>bold</strong></li>
                            <li>Use <code>_text_</code> for <em>italic</em></li>
                            <li>Use emojis for visual appeal ✨</li>
                            <li>Keep messages concise</li>
                        </ul>
                    </div>
                </div>
            </div>

            <style>{`
                .command-templates-layout {
                    display: grid;
                    grid-template-columns: 240px 1fr 280px;
                    gap: 1.5rem;
                    margin-top: 1.5rem;
                }

                /* Sidebar */
                .templates-sidebar {
                    background: var(--card-bg);
                    border-radius: 12px;
                    padding: 1rem;
                    border: 1px solid var(--border-color);
                }

                .sidebar-title {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: var(--text-secondary);
                    margin-bottom: 1rem;
                    padding: 0 0.5rem;
                }

                .command-category {
                    margin-bottom: 0.5rem;
                }

                .category-header {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem;
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                }

                .category-header:hover {
                    background: var(--hover-bg);
                }

                .category-header.active {
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-color);
                }

                .command-count {
                    margin-left: auto;
                    font-size: 0.75rem;
                    background: var(--hover-bg);
                    padding: 0.125rem 0.5rem;
                    border-radius: 10px;
                }

                .category-commands {
                    padding-left: 1rem;
                    margin-top: 0.25rem;
                }

                .command-item {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.5rem 0.75rem;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                }

                .command-item:hover {
                    background: var(--hover-bg);
                    color: var(--text-primary);
                }

                .command-item.active {
                    background: var(--primary-color);
                    color: white;
                }

                .custom-badge {
                    font-size: 0.625rem;
                    background: rgba(37, 211, 102, 0.2);
                    color: var(--primary-color);
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                }

                .command-item.active .custom-badge {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                }

                /* Main Content */
                .templates-main {
                    background: var(--card-bg);
                    border-radius: 12px;
                    padding: 1.5rem;
                    border: 1px solid var(--border-color);
                }

                .template-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1rem;
                }

                .template-info h2 {
                    font-size: 1.25rem;
                    margin-bottom: 0.25rem;
                }

                .template-info p {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .template-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .save-status {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.875rem;
                    padding: 0.25rem 0.75rem;
                    border-radius: 6px;
                }

                .save-status.success {
                    background: rgba(37, 211, 102, 0.1);
                    color: var(--primary-color);
                }

                .save-status.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .template-editor-container {
                    margin-bottom: 1rem;
                }

                .template-editor {
                    width: 100%;
                    min-height: 300px;
                    padding: 1rem;
                    background: var(--input-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    color: var(--text-primary);
                    font-family: 'Monaco', 'Consolas', monospace;
                    font-size: 0.875rem;
                    line-height: 1.6;
                    resize: vertical;
                }

                .template-editor:focus {
                    outline: none;
                    border-color: var(--primary-color);
                }

                /* Preview */
                .preview-panel {
                    background: var(--hover-bg);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .preview-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.75rem 1rem;
                    background: rgba(0, 0, 0, 0.1);
                }

                .preview-header h3 {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.875rem;
                    margin: 0;
                }

                .preview-content {
                    padding: 1rem;
                }

                .preview-content pre {
                    margin: 0;
                    white-space: pre-wrap;
                    font-family: inherit;
                    font-size: 0.875rem;
                    line-height: 1.6;
                }

                /* Variables Sidebar */
                .templates-variables {
                    background: var(--card-bg);
                    border-radius: 12px;
                    padding: 1rem;
                    border: 1px solid var(--border-color);
                    max-height: calc(100vh - 200px);
                    overflow-y: auto;
                }

                .variables-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .variables-header h3 {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.875rem;
                    margin: 0;
                }

                .variables-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .variable-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 0.5rem;
                    background: var(--hover-bg);
                    border-radius: 6px;
                    gap: 0.5rem;
                }

                .variable-info {
                    display: flex;
                    flex-direction: column;
                    gap: 0.125rem;
                    flex: 1;
                    min-width: 0;
                }

                .variable-name {
                    font-size: 0.75rem;
                    color: var(--primary-color);
                    background: rgba(37, 211, 102, 0.1);
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                    display: inline-block;
                    width: fit-content;
                }

                .variable-desc {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .variable-example {
                    font-size: 0.625rem;
                    color: var(--text-muted);
                    font-style: italic;
                }

                .variable-actions {
                    display: flex;
                    gap: 0.25rem;
                }

                .btn-icon.small {
                    width: 20px;
                    height: 20px;
                    font-size: 0.75rem;
                }

                .variables-tips {
                    margin-top: 1rem;
                    padding: 0.75rem;
                    background: rgba(37, 211, 102, 0.05);
                    border-radius: 8px;
                    border: 1px solid rgba(37, 211, 102, 0.1);
                }

                .variables-tips h4 {
                    font-size: 0.75rem;
                    margin-bottom: 0.5rem;
                    color: var(--primary-color);
                }

                .variables-tips ul {
                    margin: 0;
                    padding-left: 1rem;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .variables-tips li {
                    margin-bottom: 0.25rem;
                }

                .variables-tips code {
                    background: var(--hover-bg);
                    padding: 0 0.25rem;
                    border-radius: 3px;
                    font-size: 0.7rem;
                }

                /* Responsive */
                @media (max-width: 1200px) {
                    .command-templates-layout {
                        grid-template-columns: 200px 1fr;
                    }
                    .templates-variables {
                        display: none;
                    }
                }

                @media (max-width: 768px) {
                    .command-templates-layout {
                        grid-template-columns: 1fr;
                    }
                    .templates-sidebar {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 0.5rem;
                    }
                    .command-category {
                        flex: 1;
                        min-width: 150px;
                    }
                }
            `}</style>
        </div>
    );
}

export default CommandTemplates;

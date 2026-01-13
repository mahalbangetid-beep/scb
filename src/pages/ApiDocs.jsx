import { useState } from 'react'
import {
    FileCode2,
    Copy,
    Check,
    ChevronRight,
    ChevronDown,
    Send,
    MessageSquare,
    Smartphone,
    Users,
    Webhook,
    Globe,
    Play
} from 'lucide-react'

const endpoints = [
    {
        category: 'Messages',
        icon: MessageSquare,
        items: [
            { method: 'POST', path: '/api/v1/messages/send', description: 'Send a text message' },
            { method: 'POST', path: '/api/v1/messages/send-media', description: 'Send a media message (image, video, document)' },
            { method: 'POST', path: '/api/v1/messages/send-template', description: 'Send a template message' },
            { method: 'GET', path: '/api/v1/messages/:id', description: 'Get message details by ID' },
            { method: 'GET', path: '/api/v1/messages', description: 'List all messages with pagination' },
        ]
    },
    {
        category: 'Devices',
        icon: Smartphone,
        items: [
            { method: 'GET', path: '/api/v1/devices', description: 'List all connected devices' },
            { method: 'GET', path: '/api/v1/devices/:id', description: 'Get device details' },
            { method: 'POST', path: '/api/v1/devices', description: 'Add new device (returns QR code)' },
            { method: 'DELETE', path: '/api/v1/devices/:id', description: 'Disconnect and remove device' },
            { method: 'POST', path: '/api/v1/devices/:id/restart', description: 'Restart device session' },
        ]
    },
    {
        category: 'Contacts',
        icon: Users,
        items: [
            { method: 'GET', path: '/api/v1/contacts', description: 'List all contacts' },
            { method: 'POST', path: '/api/v1/contacts', description: 'Create new contact' },
            { method: 'PUT', path: '/api/v1/contacts/:id', description: 'Update contact details' },
            { method: 'DELETE', path: '/api/v1/contacts/:id', description: 'Delete a contact' },
            { method: 'POST', path: '/api/v1/contacts/import', description: 'Bulk import contacts from CSV' },
        ]
    },
    {
        category: 'Webhooks',
        icon: Webhook,
        items: [
            { method: 'GET', path: '/api/v1/webhooks', description: 'List all webhooks' },
            { method: 'POST', path: '/api/v1/webhooks', description: 'Create new webhook' },
            { method: 'PUT', path: '/api/v1/webhooks/:id', description: 'Update webhook configuration' },
            { method: 'DELETE', path: '/api/v1/webhooks/:id', description: 'Delete a webhook' },
            { method: 'POST', path: '/api/v1/webhooks/:id/test', description: 'Test webhook endpoint' },
        ]
    },
    {
        category: 'Broadcast',
        icon: Send,
        items: [
            { method: 'POST', path: '/api/v1/broadcast', description: 'Create and send broadcast campaign' },
            { method: 'GET', path: '/api/v1/broadcast', description: 'List all broadcast campaigns' },
            { method: 'GET', path: '/api/v1/broadcast/:id', description: 'Get broadcast campaign details' },
            { method: 'POST', path: '/api/v1/broadcast/:id/cancel', description: 'Cancel running broadcast' },
        ]
    },
]

const codeExamples = {
    sendMessage: `// Send a text message
const response = await fetch('https://api.wagateway.com/api/v1/messages/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    device_id: 'device_123',
    to: '+628123456789',
    message: 'Hello from WA Gateway API!'
  })
});

const data = await response.json();
console.log(data);
// { success: true, message_id: 'msg_abc123', status: 'sent' }`,

    sendMedia: `// Send an image with caption
const response = await fetch('https://api.wagateway.com/api/v1/messages/send-media', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    device_id: 'device_123',
    to: '+628123456789',
    type: 'image',
    media_url: 'https://example.com/image.jpg',
    caption: 'Check out this image!'
  })
});`,

    webhookPayload: `// Webhook payload example
{
  "event": "message.received",
  "timestamp": "2024-12-27T10:30:00Z",
  "data": {
    "message_id": "msg_xyz789",
    "device_id": "device_123",
    "from": "+628987654321",
    "from_name": "John Doe",
    "message": "Hi, I want to order",
    "type": "text",
    "timestamp": "2024-12-27T10:30:00Z"
  },
  "signature": "sha256=abc123..."
}`
}

export default function ApiDocs() {
    const [expandedCategories, setExpandedCategories] = useState(['Messages'])
    const [copiedCode, setCopiedCode] = useState(null)
    const [activeExample, setActiveExample] = useState('sendMessage')

    const toggleCategory = (category) => {
        setExpandedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        )
    }

    const copyCode = (code, id) => {
        navigator.clipboard.writeText(code)
        setCopiedCode(id)
        setTimeout(() => setCopiedCode(null), 2000)
    }

    const getMethodColor = (method) => {
        switch (method) {
            case 'GET': return 'var(--success)'
            case 'POST': return 'var(--info)'
            case 'PUT': return 'var(--warning)'
            case 'DELETE': return 'var(--error)'
            default: return 'var(--text-muted)'
        }
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">API Documentation</h1>
                    <p className="page-subtitle">Complete reference for integrating with the WhatsApp Gateway API</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary">
                        <Globe size={16} />
                        OpenAPI Spec
                    </button>
                    <button className="btn btn-primary">
                        <Play size={16} />
                        API Playground
                    </button>
                </div>
            </div>

            {/* Quick Start */}
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div className="card-header">
                    <div>
                        <h3 className="card-title">Quick Start</h3>
                        <p className="card-subtitle">Get started with the API in minutes</p>
                    </div>
                </div>

                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h4 style={{ marginBottom: 'var(--spacing-sm)' }}>Base URL</h4>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        padding: 'var(--spacing-md)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.875rem'
                    }}>
                        <code style={{ color: 'var(--primary-400)', flex: 1 }}>https://api.wagateway.com</code>
                        <button
                            className="btn btn-ghost btn-icon"
                            style={{ width: '32px', height: '32px' }}
                            onClick={() => copyCode('https://api.wagateway.com', 'baseUrl')}
                        >
                            {copiedCode === 'baseUrl' ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                    </div>
                </div>

                <div>
                    <h4 style={{ marginBottom: 'var(--spacing-sm)' }}>Authentication</h4>
                    <p style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-md)' }}>
                        Include your API key in the Authorization header for all requests:
                    </p>
                    <div style={{
                        padding: 'var(--spacing-md)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.875rem'
                    }}>
                        <code style={{ color: 'var(--text-secondary)' }}>Authorization: </code>
                        <code style={{ color: 'var(--primary-400)' }}>Bearer YOUR_API_KEY</code>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)' }}>
                {/* Endpoints */}
                <div className="card" style={{ height: 'fit-content' }}>
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">API Endpoints</h3>
                            <p className="card-subtitle">All available endpoints</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        {endpoints.map((category) => (
                            <div key={category.category} style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                overflow: 'hidden'
                            }}>
                                <button
                                    onClick={() => toggleCategory(category.category)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-md)',
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--bg-tertiary)',
                                        border: 'none',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 500
                                    }}
                                >
                                    {expandedCategories.includes(category.category)
                                        ? <ChevronDown size={16} />
                                        : <ChevronRight size={16} />
                                    }
                                    <category.icon size={18} style={{ color: 'var(--primary-500)' }} />
                                    {category.category}
                                    <span className="badge badge-neutral" style={{ marginLeft: 'auto' }}>
                                        {category.items.length}
                                    </span>
                                </button>

                                {expandedCategories.includes(category.category) && (
                                    <div style={{ padding: 'var(--spacing-sm)' }}>
                                        {category.items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 'var(--spacing-md)',
                                                    padding: 'var(--spacing-sm) var(--spacing-md)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    cursor: 'pointer'
                                                }}
                                                className="table tbody tr"
                                            >
                                                <span style={{
                                                    fontSize: '0.625rem',
                                                    fontWeight: 600,
                                                    padding: '2px 6px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: `${getMethodColor(item.method)}20`,
                                                    color: getMethodColor(item.method),
                                                    minWidth: '50px',
                                                    textAlign: 'center'
                                                }}>
                                                    {item.method}
                                                </span>
                                                <code style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-secondary)',
                                                    fontFamily: 'var(--font-mono)'
                                                }}>
                                                    {item.path}
                                                </code>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Code Examples */}
                <div className="card" style={{ height: 'fit-content' }}>
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">Code Examples</h3>
                            <p className="card-subtitle">Copy-paste ready code snippets</p>
                        </div>
                    </div>

                    <div className="tabs" style={{ marginBottom: 'var(--spacing-md)' }}>
                        <button
                            className={`tab ${activeExample === 'sendMessage' ? 'active' : ''}`}
                            onClick={() => setActiveExample('sendMessage')}
                        >
                            Send Message
                        </button>
                        <button
                            className={`tab ${activeExample === 'sendMedia' ? 'active' : ''}`}
                            onClick={() => setActiveExample('sendMedia')}
                        >
                            Send Media
                        </button>
                        <button
                            className={`tab ${activeExample === 'webhookPayload' ? 'active' : ''}`}
                            onClick={() => setActiveExample('webhookPayload')}
                        >
                            Webhook
                        </button>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <button
                            className="btn btn-ghost btn-icon"
                            style={{
                                position: 'absolute',
                                top: 'var(--spacing-sm)',
                                right: 'var(--spacing-sm)',
                                zIndex: 1,
                                background: 'var(--bg-secondary)'
                            }}
                            onClick={() => copyCode(codeExamples[activeExample], activeExample)}
                        >
                            {copiedCode === activeExample ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        <pre style={{
                            padding: 'var(--spacing-lg)',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'auto',
                            maxHeight: '400px',
                            margin: 0
                        }}>
                            <code style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.6
                            }}>
                                {codeExamples[activeExample]}
                            </code>
                        </pre>
                    </div>
                </div>
            </div>

            {/* Response Codes */}
            <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
                <div className="card-header">
                    <div>
                        <h3 className="card-title">Response Codes</h3>
                        <p className="card-subtitle">Common HTTP response codes and their meanings</p>
                    </div>
                </div>

                <div className="table-container" style={{ border: 'none' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Status</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { code: 200, status: 'OK', description: 'Request successful', color: 'var(--success)' },
                                { code: 201, status: 'Created', description: 'Resource created successfully', color: 'var(--success)' },
                                { code: 400, status: 'Bad Request', description: 'Invalid request parameters', color: 'var(--warning)' },
                                { code: 401, status: 'Unauthorized', description: 'Invalid or missing API key', color: 'var(--error)' },
                                { code: 403, status: 'Forbidden', description: 'Access denied to this resource', color: 'var(--error)' },
                                { code: 404, status: 'Not Found', description: 'Resource not found', color: 'var(--error)' },
                                { code: 429, status: 'Too Many Requests', description: 'Rate limit exceeded', color: 'var(--warning)' },
                                { code: 500, status: 'Server Error', description: 'Internal server error', color: 'var(--error)' },
                            ].map((item) => (
                                <tr key={item.code}>
                                    <td>
                                        <code style={{
                                            padding: '2px 8px',
                                            borderRadius: 'var(--radius-sm)',
                                            background: `${item.color}20`,
                                            color: item.color,
                                            fontSize: '0.875rem',
                                            fontWeight: 600
                                        }}>
                                            {item.code}
                                        </code>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{item.status}</td>
                                    <td style={{ color: 'var(--text-muted)' }}>{item.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

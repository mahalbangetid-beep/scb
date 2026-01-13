// Clipboard utility that doesn't trigger permission popups
// Uses fallback method that works silently

export const copyToClipboard = async (text) => {
    try {
        // Try modern clipboard API first (only works on user interaction)
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        // Fallback: Create a temporary textarea
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        return successful;
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
};

export default copyToClipboard;

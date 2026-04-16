/**
 * Language Detection Service
 * Section 12.1 — Multi-Language Detection & Auto-Reply
 * 
 * Detects the language of incoming messages using Unicode script analysis
 * and common word patterns. No external dependencies required.
 * 
 * Supported languages:
 * - English (default), Nepali, Hindi, Hinglish, Bangla, Arabic, Russian
 */

class LanguageDetectionService {
    constructor() {
        // Unicode ranges for script detection
        this.scripts = {
            devanagari: /[\u0900-\u097F]/g,    // Hindi / Nepali
            bengali: /[\u0980-\u09FF]/g,        // Bangla
            arabic: /[\u0600-\u06FF]/g,         // Arabic
            cyrillic: /[\u0400-\u04FF]/g,       // Russian
            latin: /[a-zA-Z]/g                  // English / Hinglish
        };

        // Common Nepali words (Devanagari script but specifically Nepali)
        this.nepaliMarkers = [
            'छ', 'छन्', 'हुन्छ', 'गर्नुहोस्', 'कति', 'किन', 'भयो', 'भएको',
            'गरिदिनुहोस्', 'दिनुहोस्', 'पठाउनुहोस्', 'धन्यवाद', 'नमस्ते',
            'कसरी', 'पनि', 'मेरो', 'तपाईं', 'हामी', 'यो', 'त्यो', 'हो',
            'होइन', 'अर्डर', 'समस्या', 'मद्दत', 'सहयोग'
        ];

        // Common Hindi words (helps distinguish from Nepali in Devanagari)
        this.hindiMarkers = [
            'है', 'हैं', 'करो', 'करें', 'क्या', 'कैसे', 'मुझे', 'मेरा',
            'आपका', 'यहाँ', 'वहाँ', 'कृपया', 'धन्यवाद', 'नमस्ते', 'भाई',
            'बहन', 'जी', 'अभी', 'कर', 'दो', 'दीजिए', 'बताओ', 'बताइए'
        ];

        // Hinglish markers (Hindi words written in Latin script)
        this.hinglishMarkers = [
            'kya', 'hai', 'hain', 'karo', 'kaise', 'mujhe', 'mera',
            'aapka', 'bhai', 'yeh', 'woh', 'kuch', 'nahi', 'abhi',
            'aur', 'lekin', 'kyunki', 'accha', 'theek', 'bahut',
            'sab', 'mat', 'dedo', 'batao', 'hogaya', 'kardo',
            'batado', 'bhejdo', 'paise', 'paisa', 'rupee',
            'plz', 'pls', 'ji', 'yaar', 'hoga', 'karenge',
            'karna', 'chahiye', 'dikha', 'dikhao', 'samajh'
        ];

        // Common Bangla words
        this.banglaMarkers = [
            'আমি', 'তুমি', 'আপনি', 'করো', 'করুন', 'কি', 'কেন',
            'কিভাবে', 'ধন্যবাদ', 'সমস্যা', 'অর্ডার', 'সাহায্য'
        ];

        // Common Arabic words
        this.arabicMarkers = [
            'مرحبا', 'شكرا', 'أريد', 'كيف', 'لماذا', 'مشكلة', 'طلب',
            'ساعدني', 'من فضلك', 'أهلا'
        ];

        // Common Russian words
        this.russianMarkers = [
            'привет', 'спасибо', 'помогите', 'заказ', 'проблема',
            'как', 'почему', 'пожалуйста', 'здравствуйте'
        ];

        // Language code mapping
        this.LANGUAGES = {
            EN: 'en',
            NE: 'ne',      // Nepali
            HI: 'hi',      // Hindi
            HINGLISH: 'hi-latn', // Hinglish
            BN: 'bn',      // Bangla
            AR: 'ar',      // Arabic
            RU: 'ru'       // Russian
        };
    }

    /**
     * Detect the dominant language of the given text
     * @param {string} text - Input text
     * @returns {Object} { language: 'en', confidence: 0.85, name: 'English' }
     */
    detect(text) {
        if (!text || typeof text !== 'string' || text.trim().length < 2) {
            return { language: 'en', confidence: 0, name: 'English' };
        }

        const cleaned = text.trim();
        const totalChars = cleaned.replace(/\s/g, '').length;
        
        if (totalChars === 0) {
            return { language: 'en', confidence: 0, name: 'English' };
        }

        // Count characters per script
        const counts = {};
        for (const [script, regex] of Object.entries(this.scripts)) {
            const matches = cleaned.match(regex);
            counts[script] = matches ? matches.length : 0;
        }

        // Calculate script ratios
        const ratios = {};
        for (const [script, count] of Object.entries(counts)) {
            ratios[script] = count / totalChars;
        }

        // Determine dominant script
        const dominantScript = Object.entries(ratios)
            .sort((a, b) => b[1] - a[1])[0];

        const [script, ratio] = dominantScript;

        // Route to specific language based on script
        if (script === 'devanagari' && ratio > 0.15) {
            // Devanagari: could be Hindi or Nepali
            return this._distinguishDevanagari(cleaned, ratio);
        }

        if (script === 'bengali' && ratio > 0.15) {
            return { language: this.LANGUAGES.BN, confidence: ratio, name: 'Bangla' };
        }

        if (script === 'arabic' && ratio > 0.15) {
            return { language: this.LANGUAGES.AR, confidence: ratio, name: 'Arabic' };
        }

        if (script === 'cyrillic' && ratio > 0.15) {
            return { language: this.LANGUAGES.RU, confidence: ratio, name: 'Russian' };
        }

        if (script === 'latin' && ratio > 0.5) {
            // Latin script: check for Hinglish
            return this._checkHinglish(cleaned, ratio);
        }

        // Default to English
        return { language: this.LANGUAGES.EN, confidence: ratio, name: 'English' };
    }

    /**
     * Distinguish between Hindi and Nepali in Devanagari script
     */
    _distinguishDevanagari(text, ratio) {
        const words = text.toLowerCase().split(/\s+/);
        
        let nepaliScore = 0;
        let hindiScore = 0;

        for (const word of words) {
            if (this.nepaliMarkers.some(m => word.includes(m))) nepaliScore++;
            if (this.hindiMarkers.some(m => word.includes(m))) hindiScore++;
        }

        if (nepaliScore > hindiScore) {
            return { language: this.LANGUAGES.NE, confidence: ratio, name: 'Nepali' };
        }
        if (hindiScore > nepaliScore) {
            return { language: this.LANGUAGES.HI, confidence: ratio, name: 'Hindi' };
        }
        
        // Default to Hindi for unresolved Devanagari
        return { language: this.LANGUAGES.HI, confidence: ratio * 0.7, name: 'Hindi' };
    }

    /**
     * Check if Latin text is Hinglish
     */
    _checkHinglish(text, ratio) {
        const words = text.toLowerCase().split(/\s+/);
        let hinglishHits = 0;

        for (const word of words) {
            if (this.hinglishMarkers.includes(word)) {
                hinglishHits++;
            }
        }

        const hinglishRatio = words.length > 0 ? hinglishHits / words.length : 0;

        if (hinglishRatio > 0.2 || hinglishHits >= 2) {
            return { language: this.LANGUAGES.HINGLISH, confidence: hinglishRatio, name: 'Hinglish' };
        }

        return { language: this.LANGUAGES.EN, confidence: ratio, name: 'English' };
    }

    /**
     * Get a language-specific response template key suffix
     * e.g., for 'hi' language: ORDER_ACK -> ORDER_ACK_HI
     * Falls back to default if language-specific version doesn't exist
     * 
     * @param {string} templateKey - Base template key
     * @param {string} language - Language code
     * @returns {string} Language-qualified template key
     */
    getTemplateKey(templateKey, language) {
        if (!language || language === 'en') {
            return templateKey; // Default English
        }
        
        const suffix = language.replace('-', '_').toUpperCase();
        return `${templateKey}_${suffix}`;
    }

    /**
     * Get all supported language codes and names
     */
    getSupportedLanguages() {
        return [
            { code: 'en', name: 'English', script: 'Latin' },
            { code: 'ne', name: 'Nepali', script: 'Devanagari' },
            { code: 'hi', name: 'Hindi', script: 'Devanagari' },
            { code: 'hi-latn', name: 'Hinglish', script: 'Latin' },
            { code: 'bn', name: 'Bangla', script: 'Bengali' },
            { code: 'ar', name: 'Arabic', script: 'Arabic' },
            { code: 'ru', name: 'Russian', script: 'Cyrillic' }
        ];
    }
}

module.exports = new LanguageDetectionService();

/**
 * Country Flag Utility
 * 
 * Detects country from phone number calling code and returns flag emoji.
 * Uses Unicode Regional Indicator Symbols — no external library needed.
 */

// Map of calling codes → ISO 3166-1 alpha-2 country codes
// Ordered by longest prefix first to ensure correct matching (e.g., +971 before +97)
const CALLING_CODE_MAP = [
    // 4-digit codes
    { prefix: '1684', country: 'AS' },  // American Samoa
    { prefix: '1787', country: 'PR' },  // Puerto Rico
    { prefix: '1939', country: 'PR' },  // Puerto Rico alt

    // 3-digit codes
    { prefix: '971', country: 'AE' },  // UAE
    { prefix: '977', country: 'NP' },  // Nepal
    { prefix: '974', country: 'QA' },  // Qatar
    { prefix: '973', country: 'BH' },  // Bahrain
    { prefix: '972', country: 'IL' },  // Israel
    { prefix: '966', country: 'SA' },  // Saudi Arabia
    { prefix: '968', country: 'OM' },  // Oman
    { prefix: '965', country: 'KW' },  // Kuwait
    { prefix: '964', country: 'IQ' },  // Iraq
    { prefix: '963', country: 'SY' },  // Syria
    { prefix: '962', country: 'JO' },  // Jordan
    { prefix: '961', country: 'LB' },  // Lebanon
    { prefix: '960', country: 'MV' },  // Maldives
    { prefix: '880', country: 'BD' },  // Bangladesh
    { prefix: '856', country: 'LA' },  // Laos
    { prefix: '855', country: 'KH' },  // Cambodia
    { prefix: '853', country: 'MO' },  // Macau
    { prefix: '852', country: 'HK' },  // Hong Kong
    { prefix: '850', country: 'KP' },  // North Korea
    { prefix: '886', country: 'TW' },  // Taiwan
    { prefix: '670', country: 'TL' },  // East Timor
    { prefix: '673', country: 'BN' },  // Brunei
    { prefix: '675', country: 'PG' },  // Papua New Guinea
    { prefix: '676', country: 'TO' },  // Tonga
    { prefix: '677', country: 'SB' },  // Solomon Islands
    { prefix: '678', country: 'VU' },  // Vanuatu
    { prefix: '679', country: 'FJ' },  // Fiji
    { prefix: '994', country: 'AZ' },  // Azerbaijan
    { prefix: '995', country: 'GE' },  // Georgia
    { prefix: '998', country: 'UZ' },  // Uzbekistan
    { prefix: '993', country: 'TM' },  // Turkmenistan
    { prefix: '992', country: 'TJ' },  // Tajikistan
    { prefix: '996', country: 'KG' },  // Kyrgyzstan
    { prefix: '380', country: 'UA' },  // Ukraine
    { prefix: '375', country: 'BY' },  // Belarus
    { prefix: '370', country: 'LT' },  // Lithuania
    { prefix: '371', country: 'LV' },  // Latvia
    { prefix: '372', country: 'EE' },  // Estonia
    { prefix: '373', country: 'MD' },  // Moldova
    { prefix: '374', country: 'AM' },  // Armenia
    { prefix: '353', country: 'IE' },  // Ireland
    { prefix: '354', country: 'IS' },  // Iceland
    { prefix: '356', country: 'MT' },  // Malta
    { prefix: '357', country: 'CY' },  // Cyprus
    { prefix: '358', country: 'FI' },  // Finland
    { prefix: '359', country: 'BG' },  // Bulgaria
    { prefix: '351', country: 'PT' },  // Portugal
    { prefix: '352', country: 'LU' },  // Luxembourg
    { prefix: '212', country: 'MA' },  // Morocco
    { prefix: '213', country: 'DZ' },  // Algeria
    { prefix: '216', country: 'TN' },  // Tunisia
    { prefix: '218', country: 'LY' },  // Libya
    { prefix: '220', country: 'GM' },  // Gambia
    { prefix: '221', country: 'SN' },  // Senegal
    { prefix: '222', country: 'MR' },  // Mauritania
    { prefix: '223', country: 'ML' },  // Mali
    { prefix: '234', country: 'NG' },  // Nigeria
    { prefix: '233', country: 'GH' },  // Ghana
    { prefix: '254', country: 'KE' },  // Kenya
    { prefix: '255', country: 'TZ' },  // Tanzania
    { prefix: '256', country: 'UG' },  // Uganda
    { prefix: '251', country: 'ET' },  // Ethiopia
    { prefix: '252', country: 'SO' },  // Somalia
    { prefix: '253', country: 'DJ' },  // Djibouti
    { prefix: '263', country: 'ZW' },  // Zimbabwe
    { prefix: '260', country: 'ZM' },  // Zambia
    { prefix: '258', country: 'MZ' },  // Mozambique
    { prefix: '261', country: 'MG' },  // Madagascar
    { prefix: '230', country: 'MU' },  // Mauritius
    { prefix: '244', country: 'AO' },  // Angola
    { prefix: '243', country: 'CD' },  // DR Congo
    { prefix: '242', country: 'CG' },  // Congo
    { prefix: '237', country: 'CM' },  // Cameroon
    { prefix: '225', country: 'CI' },  // Ivory Coast
    { prefix: '249', country: 'SD' },  // Sudan
    { prefix: '250', country: 'RW' },  // Rwanda

    // 2-digit codes
    { prefix: '91', country: 'IN' },   // India
    { prefix: '92', country: 'PK' },   // Pakistan
    { prefix: '93', country: 'AF' },   // Afghanistan
    { prefix: '94', country: 'LK' },   // Sri Lanka
    { prefix: '95', country: 'MM' },   // Myanmar
    { prefix: '98', country: 'IR' },   // Iran
    { prefix: '90', country: 'TR' },   // Turkey
    { prefix: '86', country: 'CN' },   // China
    { prefix: '82', country: 'KR' },   // South Korea
    { prefix: '81', country: 'JP' },   // Japan
    { prefix: '84', country: 'VN' },   // Vietnam
    { prefix: '66', country: 'TH' },   // Thailand
    { prefix: '65', country: 'SG' },   // Singapore
    { prefix: '63', country: 'PH' },   // Philippines
    { prefix: '62', country: 'ID' },   // Indonesia
    { prefix: '60', country: 'MY' },   // Malaysia
    { prefix: '61', country: 'AU' },   // Australia
    { prefix: '64', country: 'NZ' },   // New Zealand
    { prefix: '55', country: 'BR' },   // Brazil
    { prefix: '54', country: 'AR' },   // Argentina
    { prefix: '56', country: 'CL' },   // Chile
    { prefix: '57', country: 'CO' },   // Colombia
    { prefix: '58', country: 'VE' },   // Venezuela
    { prefix: '51', country: 'PE' },   // Peru
    { prefix: '52', country: 'MX' },   // Mexico
    { prefix: '53', country: 'CU' },   // Cuba
    { prefix: '48', country: 'PL' },   // Poland
    { prefix: '49', country: 'DE' },   // Germany
    { prefix: '47', country: 'NO' },   // Norway
    { prefix: '46', country: 'SE' },   // Sweden
    { prefix: '45', country: 'DK' },   // Denmark
    { prefix: '44', country: 'GB' },   // UK
    { prefix: '43', country: 'AT' },   // Austria
    { prefix: '41', country: 'CH' },   // Switzerland
    { prefix: '40', country: 'RO' },   // Romania
    { prefix: '39', country: 'IT' },   // Italy
    { prefix: '36', country: 'HU' },   // Hungary
    { prefix: '34', country: 'ES' },   // Spain
    { prefix: '33', country: 'FR' },   // France
    { prefix: '32', country: 'BE' },   // Belgium
    { prefix: '31', country: 'NL' },   // Netherlands
    { prefix: '30', country: 'GR' },   // Greece
    { prefix: '27', country: 'ZA' },   // South Africa
    { prefix: '20', country: 'EG' },   // Egypt

    // 1-digit codes
    { prefix: '7', country: 'RU' },    // Russia (also Kazakhstan +7)
    { prefix: '1', country: 'US' },    // USA/Canada
];

/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji
 * Uses Unicode Regional Indicator Symbols (U+1F1E6 to U+1F1FF)
 */
function countryCodeToFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '';
    const upper = countryCode.toUpperCase();
    const codePoints = [...upper].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
}

/**
 * Get country flag emoji from a phone number string.
 * Handles formats like: "628123456", "+628123456", "62 812 3456"
 * 
 * @param {string} phone - Phone number
 * @returns {{ flag: string, country: string, formattedPhone: string }}
 */
export function getPhoneFlag(phone) {
    if (!phone) return { flag: '', country: '', formattedPhone: phone || '' };

    // Normalize: remove +, spaces, dashes, parentheses
    const digits = phone.replace(/[^0-9]/g, '');

    if (!digits || digits.length < 4) {
        return { flag: '', country: '', formattedPhone: phone };
    }

    // Try matching against calling codes (longest prefix first)
    for (const entry of CALLING_CODE_MAP) {
        if (digits.startsWith(entry.prefix)) {
            const flag = countryCodeToFlag(entry.country);
            return {
                flag,
                country: entry.country,
                formattedPhone: `+${digits}`
            };
        }
    }

    return { flag: '', country: '', formattedPhone: phone };
}

/**
 * Format phone number with country flag for display.
 * Returns string like "🇮🇩 +628123456789"
 * 
 * @param {string} phone
 * @returns {string}
 */
export function formatPhoneWithFlag(phone) {
    const { flag, formattedPhone } = getPhoneFlag(phone);
    if (flag) {
        return `${flag} ${formattedPhone}`;
    }
    return phone || 'Not connected';
}

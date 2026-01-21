# 🔐 Source Code Protection Plan

## Situasi
- Klien membayar di AKHIR setelah project selesai
- Risiko: Klien bisa tidak bayar setelah menerima source code
- Perlu strategi untuk melindungi kerja dan memastikan pembayaran

---

## 📋 Strategi Proteksi

### 1. Private Repository ✅ (Sudah Aktif)
**Status:** Sudah implementasi

Repository sudah private di GitHub (`mahalbangetid-beep/scb`). Klien tidak punya akses ke source code sampai Anda berikan.

**Kelebihan:**
- Simple, sudah jalan
- Klien tidak bisa clone/fork

**Kekurangan:**
- Jika klien punya akses ke server hosting, mereka bisa copy file
- Tidak ada proteksi runtime

---

### 2. License-Based Kill Switch 🔑 (Rekomendasi Utama)
**Status:** Belum implementasi

Tambahkan system license yang memverifikasi ke server Anda setiap kali aplikasi start.

```javascript
// File: server/src/utils/license.js
const LICENSE_CHECK_URL = 'https://your-license-server.com/api/verify';

async function verifyLicense() {
    const LICENSE_KEY = process.env.LICENSE_KEY;
    
    if (!LICENSE_KEY) {
        console.error('[License] No license key configured.');
        process.exit(1);
    }
    
    try {
        const response = await fetch(LICENSE_CHECK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: LICENSE_KEY,
                domain: process.env.APP_DOMAIN || 'localhost',
                product: 'DICREWA'
            })
        });
        
        const data = await response.json();
        
        if (!data.valid) {
            console.error('[License] Invalid or expired license.');
            console.error('[License] Contact developer for activation.');
            process.exit(1);
        }
        
        console.log('[License] ✅ License valid until:', data.expiresAt);
        return true;
    } catch (e) {
        console.error('[License] Verification failed:', e.message);
        process.exit(1);
    }
}

module.exports = { verifyLicense };
```

**Kelebihan:**
- Full control - bisa disable remotely kapan saja
- Bisa set expiration date
- Bisa track berapa banyak installation

**Kekurangan:**
- Butuh server license (bisa pakai free tier Vercel/Railway)
- Klien bisa remove code ini jika punya akses source

**Implementasi:**
1. Buat simple license server (Node.js/Vercel)
2. Panggil `verifyLicense()` di awal `server/src/index.js`
3. Berikan LICENSE_KEY ke klien hanya setelah bayar

---

### 3. Time-Limited Demo ⏱️
**Status:** Belum implementasi

Code akan berhenti berfungsi setelah tanggal tertentu.

```javascript
// File: server/src/utils/license.js
function checkExpiry() {
    const EXPIRY_DATE = new Date('2026-02-15T23:59:59');
    const now = new Date();
    
    if (now > EXPIRY_DATE) {
        console.error('='.repeat(50));
        console.error('[License] Demo period has expired.');
        console.error('[License] Please contact developer for full license.');
        console.error('[License] Email: your@email.com');
        console.error('='.repeat(50));
        process.exit(1);
    }
    
    const daysLeft = Math.ceil((EXPIRY_DATE - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
        console.warn(`[License] ⚠️ Demo expires in ${daysLeft} days!`);
    }
}

module.exports = { checkExpiry };
```

**Kelebihan:**
- Simple, tidak butuh external server
- Tidak butuh internet untuk check

**Kekurangan:**
- Klien bisa ubah system date
- Klien bisa cari dan hapus code ini jika punya akses source
- Perlu update tanggal manual kalau extend demo

---

### 4. Environment/Domain Lock 🌐
**Status:** Belum implementasi

Code hanya berjalan di domain/environment tertentu.

```javascript
// File: server/src/utils/license.js
function checkDomain() {
    const ALLOWED_DOMAINS = [
        'localhost',
        '127.0.0.1',
        'demo.yourdomain.com'  // Demo di server ANDA
    ];
    
    const currentDomain = process.env.APP_DOMAIN || 'localhost';
    
    if (!ALLOWED_DOMAINS.includes(currentDomain)) {
        console.error('='.repeat(50));
        console.error('[License] This domain is not authorized.');
        console.error('[License] Authorized domains:', ALLOWED_DOMAINS.join(', '));
        console.error('[License] Contact developer for domain activation.');
        console.error('='.repeat(50));
        process.exit(1);
    }
}

module.exports = { checkDomain };
```

**Kelebihan:**
- Klien bisa demo di domain Anda
- Tidak butuh external server

**Kekurangan:**
- Klien bisa set environment variable
- Mudah di-bypass jika punya akses source

---

### 5. Staged Delivery 📦 (Strongly Recommended)
**Status:** Strategi bisnis, bukan teknis

Jangan berikan semua sekaligus. Bagi delivery menjadi tahap:

| Phase | Yang Diberikan | Payment | Proteksi |
|-------|----------------|---------|----------|
| **Demo** | Working demo di server ANDA | 0% | Full - klien tidak punya akses apapun |
| **Milestone 1** | Akses demo + time-limited (30 hari) | 30% | Time expiry |
| **Milestone 2** | Demo + fitur lengkap, still time-limited | 30% | Time expiry |
| **Final** | Full source code + documentation | 40% | None - sudah bayar lunas |

**Catatan Penting:**
- Selama belum lunas, deploy di server ANDA
- Klien hanya dapat URL untuk akses
- Source code tetap di private repo

---

## 🎯 Rekomendasi Implementasi

### Untuk Project Ini (DICREWA):

1. **SEKARANG:** 
   - Repo sudah private ✅
   - Deploy demo di server ANDA (Vercel/Railway/VPS Anda)
   - Berikan klien URL demo, BUKAN source code

2. **TAMBAHKAN Time-Limited Check:**
   - Mudah implementasi
   - Set expiry 30 hari dari sekarang
   - Extend jika klien bayar parsial

3. **NEGOSIASI Milestone Payment:**
   - Minta minimal 30-50% di awal/tengah
   - Jangan berikan source code sampai 100% lunas

4. **OPTIONAL - License Server:**
   - Jika klien besar/penting
   - Buat simple license API di Vercel (gratis)

---

## ❓ FAQ & Pertanyaan

### Q: Bagaimana jika klien sudah punya akses ke repository?
A: Ubah repo ke private, revoke akses mereka. Atau pindah ke repo baru.

### Q: Klien minta deploy di server mereka?
A: Jangan sampai lunas. Bilang "demo dulu di staging server saya, setelah UAT selesai dan payment, baru deploy ke production Anda."

### Q: Bagaimana jika klien techie dan bisa bypass?
A: Combine multiple strategies. Tapi pada akhirnya, kontrak dan trust tetap penting.

### Q: Apakah ini legal?
A: Ya, selama belum ada transfer ownership resmi dan payment belum lunas, source code milik developer.

---

## 📝 Catatan Tambahan

- Semua proteksi teknis bisa di-bypass oleh developer berpengalaman
- Proteksi terbaik = milestone payment + kontrak legal
- Dokumentasikan semua komunikasi dengan klien
- Simpan bukti kerja (commits, screenshots, dll)

---

## 🔄 Aksi Selanjutnya

- [ ] Implementasi Time-Limited check
- [ ] Setup demo server di infrastruktur Anda
- [ ] Negosiasi milestone payment dengan klien
- [ ] (Optional) Setup license server

---

*Dokumen ini dibuat: 2026-01-19*
*Project: DICREWA WhatsApp Gateway*

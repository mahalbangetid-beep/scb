const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, parsePagination } = require('../utils/response');

// GET /api/contacts - List all contacts for user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { search, tag } = req.query;

        const where = {
            userId: req.user.id
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (tag) {
            where.tags = {
                some: {
                    tag: {
                        name: tag
                    }
                }
            };
        }

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                skip,
                take: limit,
                orderBy: { name: 'asc' },
                include: {
                    tags: {
                        include: {
                            tag: true
                        }
                    },
                    _count: {
                        select: {
                            messages: true
                        }
                    }
                }
            }),
            prisma.contact.count({ where })
        ]);

        // Format for frontend
        const formatted = contacts.map(c => ({
            ...c,
            tags: c.tags.map(t => t.tag.name),
            totalMessages: c._count.messages
        }));

        paginatedResponse(res, formatted, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/contacts/:id
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const contact = await prisma.contact.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            },
            include: {
                tags: { include: { tag: true } }
            }
        });

        if (!contact) {
            throw new AppError('Contact not found', 404);
        }

        const formatted = {
            ...contact,
            tags: contact.tags.map(t => t.tag.name)
        };

        successResponse(res, formatted);
    } catch (error) {
        next(error);
    }
});

// POST /api/contacts
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { name, phone, email, tags: tagNames } = req.body;

        if (!name || !phone) {
            throw new AppError('name and phone are required', 400);
        }

        // Create contact
        const contact = await prisma.contact.create({
            data: {
                name,
                phone,
                email,
                userId: req.user.id
            }
        });

        // Add tags if provided
        if (tagNames && Array.isArray(tagNames)) {
            for (const tagName of tagNames) {
                // Upsert tag
                const tag = await prisma.tag.upsert({
                    where: {
                        name_userId: {
                            name: tagName,
                            userId: req.user.id
                        }
                    },
                    update: {},
                    create: {
                        name: tagName,
                        userId: req.user.id
                    }
                });

                // Link to contact
                await prisma.contactTag.create({
                    data: {
                        contactId: contact.id,
                        tagId: tag.id
                    }
                });
            }
        }

        successResponse(res, contact, 'Contact created', 201);
    } catch (error) {
        next(error);
    }
});

// PUT /api/contacts/:id
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { name, phone, email, tags: tagNames } = req.body;

        const existing = await prisma.contact.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!existing) {
            throw new AppError('Contact not found', 404);
        }

        const contact = await prisma.contact.update({
            where: { id: req.params.id },
            data: { name, phone, email }
        });

        // Update tags if provided
        if (tagNames && Array.isArray(tagNames)) {
            // Remove old links
            await prisma.contactTag.deleteMany({
                where: { contactId: contact.id }
            });

            for (const tagName of tagNames) {
                const tag = await prisma.tag.upsert({
                    where: {
                        name_userId: {
                            name: tagName,
                            userId: req.user.id
                        }
                    },
                    update: {},
                    create: {
                        name: tagName,
                        userId: req.user.id
                    }
                });

                await prisma.contactTag.create({
                    data: {
                        contactId: contact.id,
                        tagId: tag.id
                    }
                });
            }
        }

        successResponse(res, contact, 'Contact updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/contacts/:id
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const contact = await prisma.contact.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });

        if (!contact) {
            throw new AppError('Contact not found', 404);
        }

        await prisma.contact.delete({
            where: { id: req.params.id }
        });

        successResponse(res, { id: req.params.id }, 'Contact deleted');
    } catch (error) {
        next(error);
    }
});

// POST /api/contacts/import - Bulk import (JSON body or CSV file upload)
router.post('/import', authenticate, async (req, res, next) => {
    try {
        let contactItems = [];

        // Check if this is a CSV text upload (sent as { csv: "...", tags: [...] })
        if (req.body.csv) {
            const lines = req.body.csv.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) {
                throw new AppError('CSV must have a header row and at least one data row', 400);
            }

            // Parse header
            const headerLine = lines[0].toLowerCase();
            const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

            // Find column indices
            const nameIdx = headers.findIndex(h => ['name', 'full name', 'fullname', 'nama'].includes(h));
            const phoneIdx = headers.findIndex(h => ['phone', 'phone number', 'phonenumber', 'nomor', 'no', 'whatsapp', 'wa'].includes(h));
            const emailIdx = headers.findIndex(h => ['email', 'e-mail', 'mail'].includes(h));
            const notesIdx = headers.findIndex(h => ['notes', 'note', 'description', 'catatan'].includes(h));
            const tagsIdx = headers.findIndex(h => ['tags', 'tag', 'label', 'group', 'groups'].includes(h));

            if (phoneIdx === -1) {
                throw new AppError('CSV must have a "phone" column', 400);
            }

            // Parse CSV rows (simple parser — handles quoted commas)
            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const phone = normalizePhone(values[phoneIdx] || '');
                if (!phone) continue;

                const item = {
                    name: (nameIdx !== -1 ? values[nameIdx] : '') || phone,
                    phone,
                    email: emailIdx !== -1 ? (values[emailIdx] || null) : null,
                    notes: notesIdx !== -1 ? (values[notesIdx] || null) : null,
                    tags: []
                };

                // Tags from CSV column
                if (tagsIdx !== -1 && values[tagsIdx]) {
                    item.tags = values[tagsIdx].split(';').map(t => t.trim()).filter(Boolean);
                }

                // Global tags from request body
                if (req.body.tags && Array.isArray(req.body.tags)) {
                    item.tags = [...new Set([...item.tags, ...req.body.tags])];
                }

                contactItems.push(item);
            }
        } else if (req.body.contacts && Array.isArray(req.body.contacts)) {
            // JSON body import
            contactItems = req.body.contacts;
        } else {
            throw new AppError('Provide either a "csv" string or a "contacts" array', 400);
        }

        if (contactItems.length === 0) {
            throw new AppError('No valid contacts to import', 400);
        }

        if (contactItems.length > 5000) {
            throw new AppError('Maximum 5000 contacts per import', 400);
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];

        for (const item of contactItems) {
            try {
                const { name, phone, email, notes, tags: tagNames } = item;
                const cleanPhone = normalizePhone(phone || '');
                if (!cleanPhone) {
                    skipped++;
                    continue;
                }

                const contactName = (name || '').trim() || cleanPhone;

                // Check if contact exists (for accurate created/updated count)
                const existing = await prisma.contact.findFirst({
                    where: { phone: cleanPhone, userId: req.user.id },
                    select: { id: true }
                });

                // Upsert: auto-dedup by phone+userId
                const contact = await prisma.contact.upsert({
                    where: {
                        phone_userId: {
                            phone: cleanPhone,
                            userId: req.user.id
                        }
                    },
                    update: {
                        name: contactName,
                        ...(email ? { email } : {}),
                        ...(notes ? { notes } : {})
                    },
                    create: {
                        name: contactName,
                        phone: cleanPhone,
                        email: email || null,
                        notes: notes || null,
                        userId: req.user.id
                    }
                });

                if (existing) updated++;
                else created++;

                // Assign tags
                if (tagNames && Array.isArray(tagNames) && tagNames.length > 0) {
                    for (const tagName of tagNames) {
                        if (!tagName || typeof tagName !== 'string') continue;
                        const cleanTag = tagName.trim();
                        if (!cleanTag) continue;

                        const tag = await prisma.tag.upsert({
                            where: { name_userId: { name: cleanTag, userId: req.user.id } },
                            update: {},
                            create: { name: cleanTag, userId: req.user.id }
                        });

                        // Upsert contact-tag link (avoid duplicate errors)
                        await prisma.contactTag.upsert({
                            where: {
                                contactId_tagId: {
                                    contactId: contact.id,
                                    tagId: tag.id
                                }
                            },
                            update: {},
                            create: {
                                contactId: contact.id,
                                tagId: tag.id
                            }
                        });
                    }
                }
            } catch (err) {
                skipped++;
                errors.push({ phone: item.phone, error: err.message });
            }
        }

        successResponse(res, {
            total: contactItems.length,
            created,
            updated,
            skipped,
            errors: errors.slice(0, 20) // Limit error details
        }, `Import complete: ${created} created, ${updated} updated, ${skipped} skipped`);
    } catch (error) {
        next(error);
    }
});

// Helper: normalize phone number (strip non-digit except leading +)
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.trim().replace(/^["']|["']$/g, '');
    // Keep leading + if present, strip all other non-digits
    if (clean.startsWith('+')) {
        clean = '+' + clean.slice(1).replace(/\D/g, '');
    } else {
        clean = clean.replace(/\D/g, '');
    }
    return clean.length >= 7 ? clean : '';
}

// Helper: parse a single CSV line (handles quoted fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' || ch === "'") {
            if (inQuotes && i + 1 < line.length && line[i + 1] === ch) {
                current += ch;
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

module.exports = router;


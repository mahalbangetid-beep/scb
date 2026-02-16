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

        // Create contact and link tags atomically
        const contact = await prisma.$transaction(async (tx) => {
            const newContact = await tx.contact.create({
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
                    const tag = await tx.tag.upsert({
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
                    await tx.contactTag.create({
                        data: {
                            contactId: newContact.id,
                            tagId: tag.id
                        }
                    });
                }
            }

            return newContact;
        });

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

        // Update contact and tags atomically
        const contact = await prisma.$transaction(async (tx) => {
            const updatedContact = await tx.contact.update({
                where: { id: req.params.id },
                data: { name, phone, email }
            });

            // Update tags if provided
            if (tagNames && Array.isArray(tagNames)) {
                // Remove old links
                await tx.contactTag.deleteMany({
                    where: { contactId: updatedContact.id }
                });

                for (const tagName of tagNames) {
                    const tag = await tx.tag.upsert({
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

                    await tx.contactTag.create({
                        data: {
                            contactId: updatedContact.id,
                            tagId: tag.id
                        }
                    });
                }
            }

            return updatedContact;
        });

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

        // ========== Phase 1: Pre-process all unique tags ==========
        const allTagNames = new Set();
        for (const item of contactItems) {
            if (item.tags && Array.isArray(item.tags)) {
                for (const t of item.tags) {
                    if (t && typeof t === 'string' && t.trim()) {
                        allTagNames.add(t.trim());
                    }
                }
            }
        }

        // Pre-upsert all tags at once and build lookup map
        const tagMap = new Map(); // tagName -> tagId
        if (allTagNames.size > 0) {
            // Fetch existing tags for this user
            const existingTags = await prisma.tag.findMany({
                where: {
                    userId: req.user.id,
                    name: { in: [...allTagNames] }
                },
                select: { id: true, name: true }
            });

            for (const tag of existingTags) {
                tagMap.set(tag.name, tag.id);
            }

            // Create missing tags
            const missingTags = [...allTagNames].filter(name => !tagMap.has(name));
            if (missingTags.length > 0) {
                await prisma.tag.createMany({
                    data: missingTags.map(name => ({
                        name,
                        userId: req.user.id
                    })),
                    skipDuplicates: true
                });

                // Re-fetch to get IDs of newly created tags
                const newTags = await prisma.tag.findMany({
                    where: {
                        userId: req.user.id,
                        name: { in: missingTags }
                    },
                    select: { id: true, name: true }
                });

                for (const tag of newTags) {
                    tagMap.set(tag.name, tag.id);
                }
            }
        }

        // ========== Phase 2: Process contacts in chunks ==========
        const CHUNK_SIZE = 100;
        for (let i = 0; i < contactItems.length; i += CHUNK_SIZE) {
            const chunk = contactItems.slice(i, i + CHUNK_SIZE);

            // Clean and validate phones in this chunk
            const validItems = [];
            for (const item of chunk) {
                const cleanPhone = normalizePhone(item.phone || '');
                if (!cleanPhone) {
                    skipped++;
                    continue;
                }
                validItems.push({
                    ...item,
                    phone: cleanPhone,
                    name: (item.name || '').trim() || cleanPhone
                });
            }

            if (validItems.length === 0) continue;

            // Save counter snapshots so we can rollback on chunk failure
            const createdBefore = created;
            const updatedBefore = updated;

            try {
                // Process chunk in a transaction
                await prisma.$transaction(async (tx) => {
                    // Find which contacts already exist in this chunk
                    const phones = validItems.map(v => v.phone);
                    const existingContacts = await tx.contact.findMany({
                        where: {
                            userId: req.user.id,
                            phone: { in: phones }
                        },
                        select: { id: true, phone: true }
                    });

                    const existingPhoneMap = new Map();
                    for (const c of existingContacts) {
                        existingPhoneMap.set(c.phone, c.id);
                    }

                    // Separate into creates and updates
                    const toCreate = [];
                    const toUpdate = [];

                    for (const item of validItems) {
                        if (existingPhoneMap.has(item.phone)) {
                            toUpdate.push({ ...item, id: existingPhoneMap.get(item.phone) });
                        } else {
                            toCreate.push(item);
                        }
                    }

                    // Batch create new contacts
                    if (toCreate.length > 0) {
                        await tx.contact.createMany({
                            data: toCreate.map(item => ({
                                name: item.name,
                                phone: item.phone,
                                email: item.email || null,
                                notes: item.notes || null,
                                userId: req.user.id
                            })),
                            skipDuplicates: true
                        });

                        // Fetch IDs of newly created contacts (needed for tag linking)
                        const createdContacts = await tx.contact.findMany({
                            where: {
                                userId: req.user.id,
                                phone: { in: toCreate.map(c => c.phone) }
                            },
                            select: { id: true, phone: true }
                        });

                        for (const c of createdContacts) {
                            existingPhoneMap.set(c.phone, c.id);
                        }

                        created += toCreate.length;
                    }

                    // Update existing contacts (must be individual due to different data per row)
                    for (const item of toUpdate) {
                        await tx.contact.update({
                            where: { id: item.id },
                            data: {
                                name: item.name,
                                ...(item.email ? { email: item.email } : {}),
                                ...(item.notes ? { notes: item.notes } : {})
                            }
                        });
                    }
                    updated += toUpdate.length;

                    // Batch create contact-tag links
                    const contactTagLinks = [];
                    for (const item of validItems) {
                        const contactId = existingPhoneMap.get(item.phone);
                        if (!contactId) continue;

                        if (item.tags && Array.isArray(item.tags)) {
                            for (const tagName of item.tags) {
                                const cleanTag = (tagName || '').trim();
                                const tagId = tagMap.get(cleanTag);
                                if (tagId) {
                                    contactTagLinks.push({ contactId, tagId });
                                }
                            }
                        }
                    }

                    if (contactTagLinks.length > 0) {
                        await tx.contactTag.createMany({
                            data: contactTagLinks,
                            skipDuplicates: true
                        });
                    }
                });
            } catch (err) {
                // Transaction rolled back — restore counters to pre-chunk values
                created = createdBefore;
                updated = updatedBefore;
                skipped += validItems.length;
                errors.push({
                    chunk: `${i + 1}-${i + chunk.length}`,
                    error: err.message
                });
            }
        }

        // Ensure created count is not negative from error recovery
        created = Math.max(0, created);

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
    return clean.length >= 5 ? clean : '';
}

// Helper: parse a single CSV line (handles quoted fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (!inQuotes && (ch === '"' || ch === "'")) {
            inQuotes = true;
            quoteChar = ch;
        } else if (inQuotes && ch === quoteChar) {
            if (i + 1 < line.length && line[i + 1] === quoteChar) {
                current += ch;
                i++; // skip escaped quote
            } else {
                inQuotes = false;
                quoteChar = null;
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


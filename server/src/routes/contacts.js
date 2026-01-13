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
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } }
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

// POST /api/contacts/import - Bulk import
router.post('/import', authenticate, async (req, res, next) => {
    try {
        const { contacts } = req.body;

        if (!contacts || !Array.isArray(contacts)) {
            throw new AppError('contacts array is required', 400);
        }

        let imported = 0;

        // Simple sequential import for reliability
        // In a real high-volume app, we'd use createMany or a queue
        for (const item of contacts) {
            try {
                const { name, phone, email, tags: tagNames } = item;
                if (!name || !phone) continue;

                const contact = await prisma.contact.create({
                    data: {
                        name,
                        phone,
                        email,
                        userId: req.user.id
                    }
                });

                if (tagNames && Array.isArray(tagNames)) {
                    for (const tagName of tagNames) {
                        const tag = await prisma.tag.upsert({
                            where: { name_userId: { name: tagName, userId: req.user.id } },
                            update: {},
                            create: { name: tagName, userId: req.user.id }
                        });
                        await prisma.contactTag.create({
                            data: { contactId: contact.id, tagId: tag.id }
                        });
                    }
                }
                imported++;
            } catch (err) {
                console.error('Failed to import contact:', err);
                // Continue with next contact
            }
        }

        successResponse(res, { imported }, `${imported} contacts imported`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;


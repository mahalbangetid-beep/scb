/**
 * Credit Package Service
 * 
 * Service for managing credit packages for purchase
 * From clientupdate2.md: "$50 = 5000 credits" model
 * 
 * Features:
 * - Predefined credit packages with different price points
 * - Bonus credits for larger packages
 * - Package management (create, update, activate/deactivate)
 * - Purchase processing with balance updates
 */

const prisma = require('../utils/prisma');
const creditService = require('./creditService');

class CreditPackageService {
    constructor() {
        // Default packages (will be created on first access if none exist)
        this.defaultPackages = [
            {
                name: 'Starter',
                description: 'Perfect for getting started',
                category: 'support',
                price: 10,
                credits: 500,
                bonusCredits: 0,
                discountPct: 0,
                sortOrder: 1,
                isFeatured: false
            },
            {
                name: 'Basic',
                description: 'Most popular for small businesses',
                category: 'support',
                price: 25,
                credits: 1500,
                bonusCredits: 100,
                discountPct: 5,
                sortOrder: 2,
                isFeatured: false
            },
            {
                name: 'Pro',
                description: 'Great value for growing businesses',
                category: 'support',
                price: 50,
                credits: 5000,
                bonusCredits: 500,
                discountPct: 15,
                sortOrder: 3,
                isFeatured: true
            },
            {
                name: 'Enterprise',
                description: 'Best value for high-volume users',
                category: 'support',
                price: 100,
                credits: 12000,
                bonusCredits: 2000,
                discountPct: 25,
                sortOrder: 4,
                isFeatured: false
            },
            {
                name: 'Ultimate',
                description: 'Maximum value with premium support',
                category: 'support',
                price: 200,
                credits: 30000,
                bonusCredits: 5000,
                discountPct: 35,
                sortOrder: 5,
                isFeatured: false
            }
        ];
    }

    /**
     * Initialize default packages if none exist
     */
    async initializeDefaults() {
        const count = await prisma.creditPackage.count();

        if (count === 0) {
            console.log('[CreditPackage] Initializing default packages...');

            for (const pkg of this.defaultPackages) {
                await prisma.creditPackage.create({ data: pkg });
            }

            console.log(`[CreditPackage] Created ${this.defaultPackages.length} default packages`);
        }
    }

    /**
     * Get all active packages (for users)
     * @param {string|null} category - Optional filter: 'support', 'whatsapp_marketing', 'telegram_marketing'
     */
    async getActivePackages(category = null) {
        await this.initializeDefaults();

        const where = { isActive: true };
        if (category) {
            where.category = category;
        }

        return prisma.creditPackage.findMany({
            where,
            orderBy: { sortOrder: 'asc' }
        });
    }

    /**
     * Get all packages including inactive (for admin)
     */
    async getAllPackages() {
        await this.initializeDefaults();

        return prisma.creditPackage.findMany({
            orderBy: { sortOrder: 'asc' }
        });
    }

    /**
     * Get a single package by ID
     */
    async getById(id) {
        return prisma.creditPackage.findUnique({
            where: { id }
        });
    }

    /**
     * Create a new package (admin only)
     */
    async create(data, createdBy = null) {
        // Validate required fields
        if (!data.name || !data.price || !data.credits) {
            throw new Error('Name, price, and credits are required');
        }

        if (data.price <= 0 || data.credits <= 0) {
            throw new Error('Price and credits must be positive numbers');
        }

        return prisma.creditPackage.create({
            data: {
                name: data.name,
                description: data.description || null,
                category: ['support', 'whatsapp_marketing', 'telegram_marketing'].includes(data.category) ? data.category : 'support',
                price: data.price,
                credits: data.credits,
                bonusCredits: data.bonusCredits || 0,
                discountPct: data.discountPct || 0,
                minPurchase: data.minPurchase || 1,
                maxPurchase: data.maxPurchase || null,
                isActive: data.isActive !== false,
                isFeatured: data.isFeatured || false,
                sortOrder: data.sortOrder || 0,
                createdBy
            }
        });
    }

    /**
     * Update a package (admin only)
     */
    async update(id, data) {
        const existing = await this.getById(id);
        if (!existing) {
            throw new Error('Package not found');
        }

        const updateData = {};
        const allowedFields = [
            'name', 'description', 'category', 'price', 'credits', 'bonusCredits',
            'discountPct', 'minPurchase', 'maxPurchase', 'isActive',
            'isFeatured', 'sortOrder'
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        return prisma.creditPackage.update({
            where: { id },
            data: updateData
        });
    }

    /**
     * Delete a package (admin only)
     */
    async delete(id) {
        const existing = await this.getById(id);
        if (!existing) {
            throw new Error('Package not found');
        }

        return prisma.creditPackage.delete({
            where: { id }
        });
    }

    /**
     * Toggle package active status
     */
    async toggleActive(id) {
        const existing = await this.getById(id);
        if (!existing) {
            throw new Error('Package not found');
        }

        return prisma.creditPackage.update({
            where: { id },
            data: { isActive: !existing.isActive }
        });
    }

    /**
     * Toggle featured status
     */
    async toggleFeatured(id) {
        const existing = await this.getById(id);
        if (!existing) {
            throw new Error('Package not found');
        }

        return prisma.creditPackage.update({
            where: { id },
            data: { isFeatured: !existing.isFeatured }
        });
    }

    /**
     * Purchase a package
     * @param {string} userId - User making the purchase
     * @param {string} packageId - Package to purchase
     * @param {number} quantity - Number of packages (defaults to 1)
     * @param {string} paymentReference - Payment reference/transaction ID
     * @returns {Object} Purchase result
     */
    async purchase(userId, packageId, quantity = 1, paymentReference = null) {
        const pkg = await this.getById(packageId);
        if (!pkg) {
            throw new Error('Package not found');
        }

        if (!pkg.isActive) {
            throw new Error('This package is no longer available');
        }

        // Validate quantity
        if (quantity < (pkg.minPurchase || 1)) {
            throw new Error(`Minimum purchase quantity is ${pkg.minPurchase}`);
        }

        if (pkg.maxPurchase && quantity > pkg.maxPurchase) {
            throw new Error(`Maximum purchase quantity is ${pkg.maxPurchase}`);
        }

        // Calculate totals
        const totalPrice = pkg.price * quantity;
        const baseCredits = pkg.credits * quantity;
        const bonusCredits = pkg.bonusCredits * quantity;
        const totalCredits = baseCredits + bonusCredits;

        // Add credits to user
        const result = await creditService.addCredit(
            userId,
            totalCredits,
            `Purchased ${quantity}x ${pkg.name} Package`,
            paymentReference || `PACKAGE_${packageId}_${Date.now()}`
        );

        // Log the purchase
        console.log(`[CreditPackage] User ${userId} purchased ${quantity}x ${pkg.name}: $${totalPrice} for ${totalCredits} credits`);

        return {
            success: true,
            packageName: pkg.name,
            quantity,
            totalPrice,
            baseCredits,
            bonusCredits,
            totalCredits,
            newBalance: result.balanceAfter
        };
    }

    /**
     * Calculate package value (credits per dollar)
     */
    calculateValue(pkg) {
        const totalCredits = pkg.credits + (pkg.bonusCredits || 0);
        const creditsPerDollar = totalCredits / pkg.price;
        const costPerCredit = pkg.price / totalCredits;

        return {
            totalCredits,
            creditsPerDollar: Math.round(creditsPerDollar * 100) / 100,
            costPerCredit: Math.round(costPerCredit * 10000) / 10000
        };
    }

    /**
     * Get packages with calculated values
     * @param {string|null} category - Optional filter
     */
    async getPackagesWithValues(category = null) {
        const packages = await this.getActivePackages(category);

        return packages.map(pkg => ({
            ...pkg,
            ...this.calculateValue(pkg)
        }));
    }

    /**
     * Get featured package
     */
    async getFeatured() {
        return prisma.creditPackage.findFirst({
            where: { isActive: true, isFeatured: true }
        });
    }
}

module.exports = new CreditPackageService();

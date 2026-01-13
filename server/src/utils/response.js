/**
 * Response Helper Utilities
 */

// Success response
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

// Created response
const createdResponse = (res, data, message = 'Created successfully') => {
    return successResponse(res, data, message, 201);
};

// Paginated response
const paginatedResponse = (res, data, pagination, message = 'Success') => {
    return res.status(200).json({
        success: true,
        message,
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: Math.ceil(pagination.total / pagination.limit)
        }
    });
};

// Error response (use AppError instead for most cases)
const errorResponse = (res, message = 'Error', statusCode = 400) => {
    return res.status(statusCode).json({
        success: false,
        error: {
            message
        }
    });
};

// Parse pagination from query
const parsePagination = (query) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

// Parse sorting from query
const parseSort = (query, allowedFields = ['createdAt']) => {
    const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    return { [sortBy]: sortOrder };
};

module.exports = {
    successResponse,
    createdResponse,
    paginatedResponse,
    errorResponse,
    parsePagination,
    parseSort
};

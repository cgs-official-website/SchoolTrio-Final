import { ApiResponse } from '../../utils/api-response.js';
import * as libraryService from './library.service.js';

// ==========================================
// 1. Book Controllers
// ==========================================

export async function listBooks(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await libraryService.listBooks(schoolId, req.query);

    return ApiResponse.paginated(
      res,
      result.data,
      result.pagination,
      'Books retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export async function getBookById(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;

    const result = await libraryService.getBookById(schoolId, id);

    return ApiResponse.success(
      res,
      result,
      'Book retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export async function createBook(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await libraryService.createBook(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Book created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

export async function updateBook(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await libraryService.updateBook(schoolId, actor, id, req.body);

    return ApiResponse.success(
      res,
      result,
      'Book updated successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export async function deleteBook(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await libraryService.deleteBook(schoolId, actor, id);

    return ApiResponse.success(
      res,
      result,
      'Book deleted successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 2. Category Controllers
// ==========================================

export async function listCategories(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await libraryService.listCategories(schoolId);

    return ApiResponse.success(
      res,
      result,
      'Library categories retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await libraryService.createCategory(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Library category created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 3. Issue Controllers
// ==========================================

export async function listIssues(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const result = await libraryService.listIssues(schoolId, req.query);

    return ApiResponse.paginated(
      res,
      result.data,
      result.pagination,
      'Library book issues retrieved successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

export async function issueBook(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const actor = req.auth || req.user;

    const result = await libraryService.issueBook(schoolId, actor, req.body);

    return ApiResponse.success(
      res,
      result,
      'Book issued successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}

export async function returnBook(req, res, next) {
  try {
    const schoolId = req.tenant?.schoolId;
    const { id } = req.params;
    const actor = req.auth || req.user;

    const result = await libraryService.returnBook(schoolId, actor, id);

    return ApiResponse.success(
      res,
      result,
      'Book returned successfully',
      200
    );
  } catch (err) {
    next(err);
  }
}

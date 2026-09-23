import * as hrPayrollService from './hr-payroll.service.js';

/**
 * HR & Payroll HTTP Controller Layer
 */

export const listPayrolls = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { records, total } = await hrPayrollService.listPayrolls(schoolId, req.query);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getMySalary = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const userId = req.user.id;
    const records = await hrPayrollService.getMySalary(schoolId, userId, req.query);

    res.status(200).json({
      success: true,
      data: records
    });
  } catch (error) {
    next(error);
  }
};

export const generatePayroll = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const result = await hrPayrollService.generatePayroll(schoolId, req.body, req.user);

    res.status(201).json({
      success: true,
      message: `Payroll generated successfully for ${result.count} staff member(s)`,
      data: result.records,
      count: result.count
    });
  } catch (error) {
    next(error);
  }
};

export const updatePayrollStatus = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    const record = await hrPayrollService.updatePayrollStatus(schoolId, id, req.body, req.user);

    res.status(200).json({
      success: true,
      message: 'Payroll status updated successfully',
      data: record
    });
  } catch (error) {
    next(error);
  }
};

export const deletePayroll = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const { id } = req.params;
    await hrPayrollService.deletePayroll(schoolId, id, req.user);

    res.status(200).json({
      success: true,
      message: 'Payroll draft record deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const getHRConfig = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const config = await hrPayrollService.getHRConfig(schoolId);

    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
};

export const updateHRConfig = async (req, res, next) => {
  try {
    const schoolId = req.tenant.schoolId;
    const config = await hrPayrollService.updateHRConfig(schoolId, req.body, req.user);

    res.status(200).json({
      success: true,
      message: 'HR configuration updated successfully',
      data: config
    });
  } catch (error) {
    next(error);
  }
};

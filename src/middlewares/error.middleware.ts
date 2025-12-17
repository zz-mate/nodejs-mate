
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

// 全局错误处理中间件
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err.stack);
  const response: ApiResponse = {
    code: 500,
      message: err.message || 'Internal Server Error',
    data: null
  };
  res.status(500).json(response);
};

// 404中间件
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const response: ApiResponse = {
    code: 404,
      message: `Route ${req.method} ${req.originalUrl} not found`,
    data: null
  };
  res.status(404).json(response);
};
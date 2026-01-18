import { Request, Response } from 'express';
import multer from 'multer';
import { uploadSingleFileToOSS, uploadBatchFilesToOSS } from '../common/oss/upload.utils';

// 配置 multer：文件存储在内存中（不落地本地），限制单个文件 10MB
const multerConfig = {
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 单个文件最大 20MB
    },
};

// 1. 单文件上传的 multer 中间件（接收字段名：file）
export const singleFileMulter = multer(multerConfig).single('file');

// 2. 批量文件上传的 multer 中间件（接收字段名：files，最多 10 个文件）
export const batchFileMulter = multer(multerConfig).array('files', 10);

// 3. 单文件上传接口处理函数
export const handleSingleUpload = async (req: Request, res: Response) => {
    try {
        // 校验是否有文件
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                code: 400,
                message: '请选择要上传的文件',
            });
        }

        // 执行单文件上传
        const result = await uploadSingleFileToOSS(file);

        return res.status(200).json({
            code: 0,
            message: '文件上传成功',
            data: result,
        });
    } catch (error: any) {
        console.error('单文件上传失败：', error);
        return res.status(500).json({
            code: 500,
            message: `上传失败：${error.message}`,
        });
    }
};

// 4. 批量文件上传接口处理函数
export const handleBatchUpload = async (req: Request, res: Response) => {
    try {
        // 校验是否有文件
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({
                code: 400,
                message: '请选择要上传的文件',
            });
        }

        // 执行批量文件上传
        const result = await uploadBatchFilesToOSS(files);

        return res.status(200).json({
            code: 200,
            message: `批量上传完成（成功${result.successCount}个，失败${result.failCount}个）`,
            data: result,
        });
    } catch (error: any) {
        console.error('批量文件上传失败：', error);
        return res.status(500).json({
            code: 500,
            message: `批量上传失败：${error.message}`,
        });
    }
};
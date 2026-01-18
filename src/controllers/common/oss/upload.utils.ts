import { Request } from 'express';
import { getOSSClient } from '../../../tools/oss';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * 单个文件上传到 OSS 的核心逻辑
 * @param file 单个文件对象（Express.Multer.File）
 * @returns 上传结果
 */
export async function uploadSingleFileToOSS(file: Express.Multer.File) {
    // 1. 获取 OSS 客户端
    const ossClient = getOSSClient();

    // 2. 构造唯一的 OSS 存储路径（避免重名）
    const ext = path.extname(file.originalname); // 获取文件后缀（如 .jpg）
    const fileName = `${Date.now()}-${uuidv4()}${ext}`; // 时间戳 + UUID + 后缀
    const ossPath = `uploads/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${fileName}`;

    // 3. 将文件缓冲区转为可读流
    const fileStream = require('stream').Readable.from(file.buffer);

    // 4. 上传到 OSS
    const uploadResult = await ossClient.uploadStream(fileStream, ossPath);

    // 5. 返回标准化结果
    return {
        originalName: file.originalname, // 原文件名
        ossPath: uploadResult.ossPath, // OSS 存储路径
        url:  process.env.OSS_ENDPOINT+'/'+uploadResult.ossPath,//uploadResult.url, // OSS 访问 URL
        size: file.size, // 文件大小（字节）
        mimeType: file.mimetype, // 文件类型
    };
}

/**
 * 批量文件上传到 OSS 的核心逻辑
 * @param files 多个文件对象数组
 * @returns 批量上传结果
 */
export async function uploadBatchFilesToOSS(files: Express.Multer.File[]) {
    // 并行上传所有文件（Promise.all 提高效率）
    const uploadResults = await Promise.all(
        files.map(async (file) => {
            try {
                return await uploadSingleFileToOSS(file);
            } catch (error: any) {
                // 单个文件上传失败不影响其他文件，返回错误信息
                return {
                    originalName: file.originalname,
                    error: `上传失败：${error.message}`,
                };
            }
        })
    );

    // 统计成功/失败数量
    // @ts-ignore
    const successList = uploadResults.filter((item) => !item.error);
    // @ts-ignore
    const failList = uploadResults.filter((item) => item.error);

    return {
        total: files.length,
        successCount: successList.length,
        failCount: failList.length,
        successList,
        failList,
    };
}
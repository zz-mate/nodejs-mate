import OSS from 'ali-oss';
import fs from 'fs-extra';
import path from 'path';

/**
 * 阿里云 OSS 配置接口
 */
interface OSSConfig {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region: string;
    endpoint?: string; // 可选，自定义域名
}

/**
 * 阿里云 OSS 上传工具类
 */
class AliOSSClient {
    private client: OSS;

    /**
     * 初始化 OSS 客户端
     * @param config OSS 配置
     */
    constructor(config: OSSConfig) {
        // 验证配置
        if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.region) {
            throw new Error('阿里云 OSS 配置不完整，请检查 accessKeyId/accessKeySecret/bucket/region');
        }

        this.client = new OSS({
            accessKeyId: config.accessKeyId,
            accessKeySecret: config.accessKeySecret,
            bucket: config.bucket,
            region: config.region,
            endpoint: config.endpoint,
            // 可选：开启 HTTPS
            secure: true,
        });
    }

    /**
     * 上传本地文件到 OSS
     * @param localFilePath 本地文件路径（绝对路径）
     * @param ossPath OSS 存储路径（如：uploads/2026/01/test.jpg）
     * @returns 上传结果（包含文件 URL）
     */
    async uploadFile(localFilePath: string, ossPath: string): Promise<{
        url: string;
        name: string;
        size: number;
        ossPath: string;
    }> {
        try {
            // 验证本地文件是否存在
            if (!await fs.pathExists(localFilePath)) {
                throw new Error(`本地文件不存在：${localFilePath}`);
            }

            // 执行上传
            const result = await this.client.put(ossPath, localFilePath);

            // 返回结构化结果
            return {
                url: result.url, // OSS 文件访问 URL
                name: result.name, // OSS 存储路径
                // @ts-ignore
                size: result.res.data.size, // 文件大小（字节）
                ossPath: ossPath,
            };
        } catch (error: any) {
            console.error(`OSS 文件上传失败：${error.message}`, {
                localFilePath,
                ossPath,
                error: error.stack,
            });
            throw new Error(`上传失败：${error.message}`);
        }
    }

    /**
     * 上传文件流到 OSS（适用于内存中的文件，如前端上传的流）
     * @param fileStream 文件流
     * @param ossPath OSS 存储路径
     * @returns 上传结果
     */
    async uploadStream(fileStream: NodeJS.ReadableStream, ossPath: string): Promise<{
        url: string;
        name: string;
        size: number;
        ossPath: string;
    }> {
        try {
            const result = await this.client.put(ossPath, fileStream);

            return {
                url: result.url,
                name: result.name,
                // @ts-ignore
                size: result.res.data.size,
                ossPath: ossPath,
            };
        } catch (error: any) {
            console.error(`OSS 流上传失败：${error.message}`, {
                ossPath,
                error: error.stack,
            });
            throw new Error(`流上传失败：${error.message}`);
        }
    }

    /**
     * 删除 OSS 文件
     * @param ossPath OSS 存储路径
     */
    async deleteFile(ossPath: string): Promise<void> {
        try {
            await this.client.delete(ossPath);
            console.log(`OSS 文件删除成功：${ossPath}`);
        } catch (error: any) {
            console.error(`OSS 文件删除失败：${error.message}`, { ossPath });
            throw new Error(`删除失败：${error.message}`);
        }
    }

    /**
     * 获取 OSS 文件访问 URL（带签名，可选过期时间）
     * @param ossPath OSS 存储路径
     * @param expire 过期时间（秒），默认 3600 秒
     * @returns 带签名的访问 URL
     */
    async getSignedUrl(ossPath: string, expire = 3600): Promise<string> {
        try {
            const result = await this.client.signatureUrl(ossPath, {
                expires: expire,
                method: 'GET',
            });
            return result;
        } catch (error: any) {
            console.error(`获取 OSS 签名 URL 失败：${error.message}`, { ossPath });
            throw new Error(`获取签名 URL 失败：${error.message}`);
        }
    }
}

// 导出单例（推荐生产环境使用）
let ossClient: AliOSSClient | null = null;

/**
 * 初始化 OSS 客户端（单例）
 * @param config OSS 配置
 * @returns OSS 客户端实例
 */
export function initOSSClient(config: OSSConfig): AliOSSClient {
    if (!ossClient) {
        ossClient = new AliOSSClient(config);
    }
    return ossClient;
}

/**
 * 获取 OSS 客户端实例（需先调用 initOSSClient）
 */
export function getOSSClient(): AliOSSClient {
    if (!ossClient) {
        throw new Error('请先调用 initOSSClient 初始化 OSS 客户端');
    }
    return ossClient;
}

// 导出类型
export type { OSSConfig };
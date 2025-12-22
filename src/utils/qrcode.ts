import QRCode from 'qrcode';
import Jimp from 'jimp';
import type {QRCodeConfig, UserDbSchema} from '../types';

/**
 * 扩展：支持字符串/对象两种传参形式
 * @param userId 用户ID
 * @param userInfo 可以是字符串（昵称）| 用户对象（含nickname/avatar等）
 * @param profile 等级信息（可选）
 * @param config 二维码配置
 */
export const generateUserQRCode = async (
    userId: number,
    userInfo: string | Pick<UserDbSchema, 'id' | 'nickname' | 'avatar'>,
    profile: Record<string, any> = {}, // 等级信息（可选）
    config: QRCodeConfig = {}
): Promise<string> => {
    try {
        // 统一格式：无论传字符串还是对象，都封装为标准对象
        const userData = typeof userInfo === 'string'
            ? { nickname: userInfo, avatar: '', id: userId } // 字符串默认作为昵称
            : { ...userInfo };

        // 构造二维码内容（包含用户信息）
        const qrContent = JSON.stringify({
            type: 'user_profile',
            userId,
            nickname: userData.nickname || '',
            avatar: userData.avatar || '',
            level: profile.level || 1,
            exp: profile.level_exp || 0,
            shareUrl: `${process.env.FRONTEND_URL}/user/${userId}`,
            timestamp: Date.now()
        });

        // 二维码基础配置
        const defaultConfig = {
            width: config.width || 400,
            margin: config.margin || 1,
            color: {
                dark: config.color?.dark || '#FFD608',
                light: config.color?.light || '#FFFFFF'
            },
            errorCorrectionLevel: 'H' as const
        };

        // 生成Base64二维码
        let qrBase64 = await QRCode.toDataURL(qrContent, defaultConfig);

        // 可选：添加Logo
        if (config.logoPath) {
            // @ts-ignore
            const logo = await Jimp.read(config.logoPath);
            // @ts-ignore
            const qrImage = await Jimp.read(Buffer.from(qrBase64.split(',')[1], 'base64'));
            const logoSize = qrImage.getWidth() / 5;
            logo.resize(logoSize, logoSize).opacity(0.8);
            qrImage.composite(logo, (qrImage.getWidth() - logoSize) / 2, (qrImage.getHeight() - logoSize) / 2);
            // @ts-ignore
            qrBase64 = await qrImage.getBase64Async(Jimp.MIME_PNG);
        }

        return qrBase64;
    } catch (error) {
        const err = error as Error;
        console.error(`生成用户${userId}二维码失败：`, err.message);
        throw new Error(`二维码生成失败：${err.message}`);
    }
};
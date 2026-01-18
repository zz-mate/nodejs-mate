import { Request, Response } from 'express';
import AliYunQwenClient from './openai/qianwen.utils';
import type { SendMessageOptions, StreamResponse } from './openai/qianwen.utils';

export const qianWenSendMsg = async (req: Request, res: Response) => {
    try {
        // 1. 校验环境变量（对齐官方示例）
        if (!process.env.DASHSCOPE_API_KEY) {
            return res.status(500).json({
                code: 500,
                success: false,
                msg: "请设置环境变量 DASHSCOPE_API_KEY",
                data: null
            });
        }

        // 2. 校验请求参数
        const { content } = req.body;
        if (!content || content.trim() === "") {
            return res.status(400).json({
                code: 400,
                success: false,
                msg: "提问内容不能为空",
                data: null
            });
        }

        // 3. 初始化客户端（对齐官方示例）
        const qwenClient = new AliYunQwenClient({
            apiKey: process.env.DASHSCOPE_API_KEY,
            region: "cn-beijing",
            defaultModel: "qwen-plus"
        });

        // 4. 配置请求参数（对齐官方示例）
        const options: SendMessageOptions = {
            systemMessage: "你是专业的掌账 Mate 小程序智能助手，回答简洁准确",
            model: "qwen-max",
            stream: true, // 开启流式
            streamOptions: { include_usage: true } // 要求返回Token用量
        };

        // 5. 调用流式接口（对齐官方处理逻辑）
        const streamResult = await qwenClient.sendMessage(content, options) as StreamResponse;

        // 6. 校验返回结果
        if (!streamResult.fullContent) {
            return res.status(500).json({
                code: 500,
                success: false,
                msg: "模型未返回有效内容",
                data: null
            });
        }

        // 7. 返回标准JSON响应（包含Token用量）
        return res.json({
            code: 200,
            success: true,
            msg: "调用成功",
            data: {
                content: streamResult.fullContent,
                usage: streamResult.usage // 新增：返回Token用量
            }
        });

    } catch (error) {
        const err = error as Error;
        console.error("请求失败:", err);
        return res.status(500).json({
            code: 500,
            success: false,
            msg: `请求失败：${err.message}`,
            data: null
        });
    }
};
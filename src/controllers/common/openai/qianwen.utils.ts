import OpenAI from "openai";

// 导出类型接口
export interface AliYunQwenClientOptions {
    apiKey: string;
    region?: "cn-beijing" | "sg";
    defaultModel?: string;
}

export interface SendMessageOptions {
    systemMessage?: string;
    model?: string;
    stream?: boolean;
    // 新增：对齐官方的stream_options配置
    streamOptions?: { include_usage: boolean };
}

// 新增：定义Token用量类型
export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

// 新增：流式调用返回结果类型
export interface StreamResponse {
    fullContent: string;
    usage?: TokenUsage;
}

class AliYunQwenClient {
    #openai: OpenAI;
    defaultModel: string;

    constructor(options: AliYunQwenClientOptions) {
        if (!options.apiKey || options.apiKey.trim() === "") {
            throw new Error("API Key 不能为空，请配置阿里云百炼API Key");
        }

        // 地域URL映射（对齐官方示例）
        const baseURLMap: Record<"cn-beijing" | "sg", string> = {
            "cn-beijing": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "sg": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        };
        const targetRegion: "cn-beijing" | "sg" = options.region || "cn-beijing";

        // 初始化客户端（对齐官方示例）
        this.#openai = new OpenAI({
            apiKey: options.apiKey,
            baseURL: baseURLMap[targetRegion],
        });

        this.defaultModel = options.defaultModel || "qwen-plus";
    }

    /**
     * 发送消息（对齐官方流式调用逻辑）
     * @param message 用户提问内容
     * @param options 可选配置
     * @returns 非流式返回字符串，流式返回StreamResponse
     */
    async sendMessage(
        message: string,
        options: SendMessageOptions = {}
    ): Promise<string | StreamResponse> {
        if (!message || message.trim() === "") {
            throw new Error("用户提问内容不能为空");
        }

        // 构造请求参数（完全对齐官方示例）
        const requestParams = {
            model: options.model || this.defaultModel,
            messages: [
                { role: "system", content: options.systemMessage || "You are a helpful assistant." },
                { role: "user", content: message }
            ],
            stream: options.stream || false,
            stream_options: options.streamOptions || { include_usage: true }, // 对齐官方配置
        };

        try {
            // 非流式调用（原有逻辑）
            if (!options.stream) {
                // @ts-ignore
                const completion = await this.#openai.chat.completions.create(requestParams);
                return completion.choices[0]?.message?.content || "";
            }

            // 流式调用（对齐官方处理逻辑）
            // @ts-ignore
            const stream = await this.#openai.chat.completions.create(requestParams);
            const contentParts: string[] = [];
            let usage: TokenUsage | undefined;

            // 遍历流式响应（完全对齐官方示例）
            for await (const chunk of stream) {
                // 处理内容chunk
                if (chunk.choices && chunk.choices.length > 0) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        contentParts.push(content);
                    }
                }
                // 处理最后一个chunk的Token用量
                else if (chunk.usage) {
                    usage = {
                        prompt_tokens: chunk.usage.prompt_tokens,
                        completion_tokens: chunk.usage.completion_tokens,
                        total_tokens: chunk.usage.total_tokens
                    };
                }
            }

            // 返回拼接结果+Token用量
            return {
                fullContent: contentParts.join(""),
                usage
            };

        } catch (error) {
            const err = error as Error;
            console.error(`❌ 调用通义千问失败：${err.message}`);
            throw err;
        }
    }
}

export default AliYunQwenClient;
# 首次调用 API

DeepSeek API 使用与 OpenAI 兼容的 API 格式，通过修改配置，您可以使用 OpenAI SDK 来访问 DeepSeek API，或使用与 OpenAI API 兼容的软件。

| PARAM      | VALUE                               |
| ---------- | ----------------------------------- |
| base_url * | `https://api.deepseek.com`          |
| api_key    | sk-9f3b8a502c2041028dfd3b225f22f9f0 |

\* 出于与 OpenAI 兼容考虑，您也可以将 `base_url` 设置为 `https://api.deepseek.com/v1` 来使用，但注意，此处 `v1` 与模型版本无关。

\* **`deepseek-chat` 和 `deepseek-reasoner` 都已经升级为 DeepSeek-V3.2-Exp。**`deepseek-chat` 对应 DeepSeek-V3.2-Exp 的**非思考模式**，`deepseek-reasoner` 对应 DeepSeek-V3.2-Exp 的**思考模式**。

\* 我们通过额外的接口，临时保留了 **V3.1-Terminus** 的 API 访问，以供用户进行对比测试，访问方法请[参考文档](https://api-docs.deepseek.com/zh-cn/guides/comparison_testing)。

## 调用对话 API

在创建 API key 之后，你可以使用以下样例脚本的来访问 DeepSeek API。样例为非流式输出，您可以将 stream 设置为 true 来使用流式输出。

- nodejs

```javascript
// Please install OpenAI SDK first: `npm install openai`

import OpenAI from "openai";

const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: "You are a helpful assistant." }],
    model: "deepseek-chat",
  });

  console.log(completion.choices[0].message.content);
}

main();
```
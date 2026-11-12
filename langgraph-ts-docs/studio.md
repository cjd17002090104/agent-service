> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/studio.md

# LangSmith Studio

在本地使用 LangChain 构建智能体时，能够可视化智能体内部正在发生什么、实时与其交互，并在问题出现时进行调试，会非常有帮助。**LangSmith Studio** 是一个免费的、可视化界面，用于在本地机器上开发和测试你的 LangChain 智能体。

Studio 连接到本地运行的智能体，展示智能体执行的每一步：发送给模型的提示词、工具调用及其结果、以及最终输出。你可以测试不同输入、检查中间状态、并在不额外写代码或部署的情况下迭代智能体行为。

本页介绍如何为本地 LangChain 智能体配置 Studio。

## 前置条件

开始之前，请确保具备以下条件：

* **一个 LangSmith 账号**：在 [smith.langchain.com](https://smith.langchain.com?utm_source=docs&utm_medium=cta&utm_campaign=langsmith-signup&utm_content=oss-langgraph-studio) 免费注册或登录。
* **一个 LangSmith API 密钥**：请遵循[创建 API 密钥](https://docs.langchain.com/langsmith/create-account-api-key.md)指南。
* 如果你不希望数据被[追踪](https://docs.langchain.com/langsmith/observability-concepts.md#traces)到 LangSmith，请在应用的 `.env` 文件中设置 `LANGSMITH_TRACING=false`。禁用追踪后，不会有任何数据离开你的本地服务器。

## 设置本地 Agent Server

### 1. 安装 LangGraph CLI

[LangGraph CLI](https://docs.langchain.com/langsmith/cli.md) 提供一个本地开发服务器（也称为 [Agent Server](https://docs.langchain.com/langsmith/agent-server.md)），负责把你的智能体连接到 Studio。

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npx @langchain/langgraph-cli
```

### 2. 准备你的智能体

如果你已经有 LangChain 智能体，可以直接使用。本示例使用一个简单的邮件智能体：

```typescript title="agent.ts" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { createAgent } from "@langchain/langgraph";

function sendEmail(to: string, subject: string, body: string): string {
    // Send an email
    const email = {
        to: to,
        subject: subject,
        body: body
    };
    // ... email sending logic

    return `Email sent to ${to}`;
}

const agent = createAgent({
    model: "gpt-5.5",
    tools: [sendEmail],
    systemPrompt: "You are an email assistant. Always use the sendEmail tool.",
});

export { agent };
```

### 3. 环境变量

Studio 需要一个 LangSmith API 密钥来连接本地智能体。在项目根目录创建 `.env` 文件，并加入你在 [LangSmith](https://smith.langchain.com/settings) 中获取的 API 密钥。

> [!WARNING]
>
> 确保 `.env` 文件没有被提交到版本控制系统（例如 Git）。

```bash .env theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
LANGSMITH_API_KEY=lsv2...
```

### 4. 创建 LangGraph 配置文件

LangGraph CLI 使用配置文件来定位你的智能体并管理依赖。在应用目录中创建 `langgraph.json` 文件：

```json title="langgraph.json" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agent.ts:agent"
  },
  "env": ".env"
}
```

[`createAgent`](https://reference.langchain.com/javascript/langchain/index/createAgent) 函数会自动返回一个已编译的 LangGraph 图，这正是配置文件中 `graphs` 键所期望的内容。

> [!NOTE]
>
> 有关配置文件中 JSON 对象各键的详细说明，请参阅 [LangGraph 配置文件参考](https://docs.langchain.com/langsmith/cli.md#configuration-file)。

此时，项目结构如下：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
my-app/
├── src
│   └── agent.ts
├── .env
├── package.json
└── langgraph.json
```

### 5. 安装依赖

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
yarn install
```

### 6. 在 Studio 中查看你的智能体

启动开发服务器，把智能体连接到 Studio：

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npx @langchain/langgraph-cli dev
```

> [!WARNING]
>
> Safari 会阻止到 Studio 的 `localhost` 连接。解决办法是给上述命令加上 `--tunnel`，通过安全隧道访问 Studio。你需要在 Studio 界面中点击 **Connect to a local server**，手动把隧道 URL 加入允许的来源列表。具体步骤见[故障排查指南](https://docs.langchain.com/langsmith/troubleshooting-studio.md#safari-connection-issues)。

服务器启动后，你的智能体既可以通过 API 访问（`http://127.0.0.1:2024`），也可以通过 Studio 界面访问（`https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`）：

![Studio 界面中的智能体视图](https://mintcdn.com/langchain-5e9cc07a/TCDks4pdsHdxWmuJ/oss/images/studio_create-agent.png?fit=max&auto=format&n=TCDks4pdsHdxWmuJ&q=85&s=ebd259e9fa24af7d011dfcc568f74be2)

Studio 连接本地智能体后，你可以快速迭代智能体行为。运行一个测试输入，在 [LangSmith](https://docs.langchain.com/langsmith/observability-studio.md) 中检查完整执行轨迹，包括提示词、工具参数、返回值以及 token/延迟指标。出现问题时，Studio 会连同周边状态捕获异常，帮助你理解发生了什么。

开发服务器支持热重载——修改代码中的提示词或工具签名，Studio 会立即反映。你可以从任意步骤重新运行对话线程来测试变更，无需从头开始。这套工作流既适用于简单的单工具智能体，也适用于复杂的多节点图。

有关如何运行 Studio 的更多信息，请参阅 [LangSmith 文档](https://docs.langchain.com/langsmith/observability.md)中的以下指南：

* [运行应用](https://docs.langchain.com/langsmith/use-studio.md#run-application)
* [管理助手](https://docs.langchain.com/langsmith/use-studio.md#manage-assistants)
* [管理线程](https://docs.langchain.com/langsmith/use-studio.md#manage-threads)
* [迭代提示词](https://docs.langchain.com/langsmith/observability-studio.md)
* [调试 LangSmith 轨迹](https://docs.langchain.com/langsmith/observability-studio.md#debug-langsmith-traces)
* [将节点加入数据集](https://docs.langchain.com/langsmith/observability-studio.md#add-node-to-dataset)

## 视频指南

[Studio](https://www.youtube.com/embed/Mi1gSlHwZLM?si=zA47TNuTC5aH0ahd)

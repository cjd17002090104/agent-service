> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/ui.md

# Agent Chat UI

[Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) 是一个 Next.js 应用，为任意 LangChain 智能体提供对话式交互界面。它支持实时聊天、工具调用可视化，以及时间旅行调试、状态分叉等高级功能。Agent Chat UI 与使用 [`create_agent`](https://reference.langchain.com/javascript/langchain/index/createAgent) 创建的智能体无缝协作，只需极少配置即可为智能体提供交互体验——无论你在本地运行，还是部署在 [LangSmith](https://docs.langchain.com/langsmith/observability.md) 等环境中。

Agent Chat UI 是开源的，可以按你的应用需求进行改造。

[Agent Chat UI](https://www.youtube.com/embed/lInrwVnZ83o?si=Uw66mPtCERJm0EjU)

> [!TIP]
>
> 你可以在 Agent Chat UI 中使用生成式 UI。更多信息请参阅[使用 LangGraph 实现生成式用户界面](https://docs.langchain.com/langsmith/generative-ui-react.md)。

### 快速开始

最快的方式是使用托管版本：

1. **访问 [Agent Chat UI](https://agentchat.vercel.app)**
2. **连接你的智能体**：输入部署 URL 或本地服务器地址
3. **开始聊天**：界面会自动检测并渲染工具调用和中断

### 本地开发

如需自定义或本地开发，可以在本机运行 Agent Chat UI：

```bash Use npx theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Create a new Agent Chat UI project
npx create-agent-chat-app --project-name my-chat-ui
cd my-chat-ui

# Install dependencies and start
pnpm install
pnpm dev
```

```bash Clone repository theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Clone the repository
git clone https://github.com/langchain-ai/agent-chat-ui.git
cd agent-chat-ui

# Install dependencies and start
pnpm install
pnpm dev
```

### 连接到你的智能体

Agent Chat UI 既可以连接[本地](https://docs.langchain.com/oss/javascript/langgraph/studio.md#set-up-local-agent-server)智能体，也可以连接[已部署的智能体](https://docs.langchain.com/oss/javascript/langgraph/deploy.md)。

启动 Agent Chat UI 后，需要配置它连接到你的智能体：

1. **Graph ID**：输入你的图名称（可在 `langgraph.json` 文件的 `graphs` 下找到）
2. **Deployment URL**：你的 Agent 服务器端点（例如本地开发用 `http://localhost:2024`，或已部署智能体的 URL）
3. **LangSmith API 密钥（可选）**：填入你的 LangSmith API 密钥（使用本地 Agent 服务器时不需要）

配置完成后，Agent Chat UI 会自动获取并展示智能体中所有被中断的线程。

> [!TIP]
>
> Agent Chat UI 开箱即用地支持渲染工具调用与工具结果消息。如需自定义显示哪些消息，请参阅[在聊天中隐藏消息](https://github.com/langchain-ai/agent-chat-ui?tab=readme-ov-file#hiding-messages-in-the-chat)。

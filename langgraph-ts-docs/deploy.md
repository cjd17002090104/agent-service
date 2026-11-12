> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/deploy.md

# 部署

> 通过 LangSmith Cloud，或 JavaScript 框架与托管平台，把 LangGraph 智能体部署到生产环境。

当你准备把 LangGraph 智能体部署到生产环境时，选择适合你技术栈的托管模式。**[LangSmith Cloud](https://docs.langchain.com/langsmith/deploy-to-cloud.md)** 为有状态、长时间运行的智能体提供全托管基础设施，支持持久化状态与后台执行。

你也可以使用同一套 [Agent Streaming Protocol](https://github.com/langchain-ai/agent-protocol/tree/main/streaming)，部署到 **JavaScript 框架与平台**上，例如 Next.js、SvelteKit、Nuxt、Cloudflare Workers 和 Deno Deploy。

框架与平台

[查看所有指南](https://docs.langchain.com/langsmith/deploy-frameworks-and-platforms.md)

![](https://mintcdn.com/langchain-5e9cc07a/ZPKed1feKJ8F6LVo/images/providers/light/langchain.svg?fit=max&auto=format&n=ZPKed1feKJ8F6LVo&q=85&s=b910ed9cd0b6b8adb4b6da400882e92c)

LangSmith

[打开](https://docs.langchain.com/langsmith/deploy-vite-langsmith.md)

![](https://mintcdn.com/langchain-5e9cc07a/h9vvRKKSgCSjvd_Y/images/providers/light/nextjs.svg?fit=max&auto=format&n=h9vvRKKSgCSjvd_Y&q=85&s=4f3336e9534db50f25f87173a41322d5)

Next.js

[打开](https://docs.langchain.com/langsmith/deploy-nextjs.md)

![](https://mintcdn.com/langchain-5e9cc07a/h9vvRKKSgCSjvd_Y/images/providers/light/svelte.svg?fit=max&auto=format&n=h9vvRKKSgCSjvd_Y&q=85&s=07e7e35c40e4522f739feea9ef3e33b7)

SvelteKit

[打开](https://docs.langchain.com/langsmith/deploy-sveltekit.md)

![](https://mintcdn.com/langchain-5e9cc07a/h9vvRKKSgCSjvd_Y/images/providers/light/nuxt.svg?fit=max&auto=format&n=h9vvRKKSgCSjvd_Y&q=85&s=5d965ed1f93f51ac604e66b935a65368)

Nuxt

[打开](https://docs.langchain.com/langsmith/deploy-nuxt.md)

![](https://mintcdn.com/langchain-5e9cc07a/h9vvRKKSgCSjvd_Y/images/providers/light/cloudflare.svg?fit=max&auto=format&n=h9vvRKKSgCSjvd_Y&q=85&s=ae129fcbfc78ccaece42b1c4d3699311)

Cloudflare

[打开](https://docs.langchain.com/langsmith/deploy-cloudflare-workers.md)

![](https://mintcdn.com/langchain-5e9cc07a/Tz8fh3A43FeUPf69/images/providers/light/deno.svg?fit=max&auto=format&n=Tz8fh3A43FeUPf69&q=85&s=8d213b0000104542fcaa7ab160595224)

Deno

[打开](https://docs.langchain.com/langsmith/deploy-deno.md)

> [!TIP]
>
> LangSmith 除 Cloud 之外还提供多种部署选项，包括[混合部署](https://docs.langchain.com/langsmith/hybrid.md)、[独立服务器](https://docs.langchain.com/langsmith/deploy-standalone-server.md)以及[带控制面的自托管](https://docs.langchain.com/langsmith/deploy-with-control-plane.md)。更多信息请参阅 [LangSmith Deployment 概览](https://docs.langchain.com/langsmith/deployment.md)。

## LangSmith Cloud

本节介绍如何从 GitHub 仓库把智能体部署到 LangSmith Cloud。LangSmith 负责基础设施、扩缩容和运维相关事项。

### 前置条件

开始之前，请确保具备以下条件：

* 一个 [GitHub 账号](https://github.com/)
* 一个 [LangSmith 账号](https://smith.langchain.com?utm_source=docs&utm_medium=cta&utm_campaign=langsmith-signup&utm_content=oss-langgraph-deploy)（可免费注册）

### 部署你的智能体

#### 1. 在 GitHub 上创建仓库

应用代码必须位于 GitHub 仓库中才能部署到 LangSmith。公开仓库和私有仓库均受支持。本快速开始中，请先按[本地服务器设置指南](https://docs.langchain.com/oss/javascript/langgraph/studio.md#set-up-local-agent-server)确认你的应用兼容 LangGraph，然后把代码推送到仓库。

#### 2. 部署到 LangSmith

**1. 进入 LangSmith Deployment**

登录 [LangSmith](https://smith.langchain.com?utm_source=docs&utm_medium=cta&utm_campaign=langsmith-signup&utm_content=oss-langgraph-deploy)。在左侧边栏选择 **Deployments**。

**2. 创建新部署**

点击 **+ New Deployment** 按钮。会打开一个面板，在其中填写必填字段。

**3. 关联仓库**

如果你是首次使用，或要添加一个此前未连接过的私有仓库，点击 **Add new account** 按钮并按提示连接你的 GitHub 账号。

**4. 部署仓库**

选择你的应用仓库，点击 **Submit** 开始部署。部署大约需要 15 分钟完成。你可以在 **Deployment details** 视图中查看状态。

#### 3. 在 Studio 中测试应用

应用部署完成后：

1. 选择你刚创建的部署以查看更多详情。
2. 点击右上角的 **Studio** 按钮。Studio 会打开并展示你的图。

#### 4. 获取部署的 API URL

1. 在 LangGraph 的 **Deployment details** 视图中，点击 **API URL** 复制到剪贴板。
2. 点击 `URL` 复制到剪贴板。

#### 5. 测试 API

现在可以测试 API 了：

**TypeScript**

1. 安装 LangGraph SDK：

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install @langchain/langgraph-sdk
```

2. 向智能体发送一条消息：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({ apiUrl: "your-deployment-url", apiKey: "your-langsmith-api-key" });

const streamResponse = client.runs.stream(
  null,    // Threadless run
  "agent", // Name of agent. Defined in langgraph.json.
  {
    input: {
      "messages": [
        { "role": "user", "content": "What is LangGraph?"}
      ]
    },
    streamMode: "messages",
  }
);

for await (const chunk of streamResponse) {
  console.log(`Receiving new event of type: ${chunk.event}...`);
  console.log(JSON.stringify(chunk.data));
  console.log("\n\n");
}
```

**Rest API**

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
curl -s --request POST \
    --url <DEPLOYMENT_URL>/runs/stream \
    --header 'Content-Type: application/json' \
    --header "X-Api-Key: <LANGSMITH API KEY> \
    --data "{
        \"assistant_id\": \"agent\", `# Name of agent. Defined in langgraph.json.`
        \"input\": {
            \"messages\": [
                {
                    \"role\": \"human\",
                    \"content\": \"What is LangGraph?\"
                }
            ]
        },
        \"stream_mode\": \"updates\"
    }"
```

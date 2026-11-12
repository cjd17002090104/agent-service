> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/local-server.md

# 运行本地服务器

本指南介绍如何在本地运行 LangGraph 应用。

## 前置条件

开始之前，请确保你已具备以下条件：

* 一个 [LangSmith](https://smith.langchain.com/settings) 的 API key——注册免费

## 1. 安装 LangGraph CLI

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install --save-dev @langchain/langgraph-cli
```

## 2. 创建 LangGraph 应用

从 [`new-langgraph-project-js` 模板](https://github.com/langchain-ai/new-langgraphjs-project)创建一个新应用。该模板演示了一个单节点应用，你可以用自己的逻辑对其进行扩展。

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm create langgraph
```

> **将 LangGraph 加入现有项目**
>
> 如果你已有包含 LangGraph 智能体的项目，可以使用 `config` 命令自动生成 `langgraph.json` 配置文件：
>
> ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> npm create langgraph config
> ```
>
> 该命令会扫描你的项目中的 LangGraph 智能体（例如 `createAgent()`、`StateGraph.compile()` 或 `workflow.compile()` 等模式），并生成包含所有已导出智能体的配置文件。
>
> 示例输出：
>
> ```json theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> {
>   "node_version": "24",
>   "graphs": {
>     "agent": "./src/agent.ts:agent",
>     "searchAgent": "./src/search.ts:searchAgent"
>   },
>   "env": ".env"
> }
> ```
>
> > [!TIP]
> >
> > 配置中只包含**已导出**的智能体。如果某个智能体未被导出，该命令会给出警告，以便你添加 `export` 关键字。

## 3. 安装依赖

在新的 LangGraph 应用根目录下，以 `edit` 模式安装依赖，这样本地改动就能被服务器使用：

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
cd path/to/your/app
npm install
```

## 4. 创建 `.env` 文件

你会在新的 LangGraph 应用根目录下看到 `.env.example`。在应用根目录下创建 `.env` 文件，把 `.env.example` 的内容复制进去，并填入必要的 API key：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
LANGSMITH_API_KEY=lsv2...
```

## 5. 启动 Agent server

在本地启动 LangGraph API 服务器：

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npx @langchain/langgraph-cli dev
```

示例输出：

```
INFO:langgraph_api.cli:

        Welcome to

╦  ┌─┐┌┐┌┌─┐╔═╗┬─┐┌─┐┌─┐┬ ┬
║  ├─┤││││ ┬║ ╦├┬┘├─┤├─┘├─┤
╩═╝┴ ┴┘└┘└─┘╚═╝┴└─┴ ┴┴  ┴ ┴

- 🚀 API: http://127.0.0.1:2024
- 🎨 Studio UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
- 📚 API Docs: http://127.0.0.1:2024/docs

This in-memory server is designed for development and testing.
For production use, please use LangSmith Deployment.
```

`langgraph dev` 命令会以内存模式启动 Agent server。该模式适用于开发和测试。生产环境中，请部署能够访问持久化存储后端的 Agent server。更多信息请参阅[平台设置概览](https://docs.langchain.com/langsmith/platform-setup.md)。

## 6. 在 Studio 中测试你的应用

[Studio](https://docs.langchain.com/langsmith/studio.md) 是一个专门的 UI，你可以把它连接到 LangGraph API 服务器，在本地可视化、交互和调试你的应用。访问 `langgraph dev` 命令输出中提供的 URL，即可在 Studio 中测试你的图：

```
>    - LangGraph Studio Web UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

如果 Agent server 运行在自定义的 host/port 上，请更新 URL 中的 `baseUrl` 查询参数。例如，如果你的服务器运行在 `http://myhost:3000`：

```
https://smith.langchain.com/studio/?baseUrl=http://myhost:3000
```

> **Safari 兼容性**
>
> 由于 Safari 在连接 localhost 服务器时存在限制，请在命令中使用 `--tunnel` 标志创建一个安全隧道：
>
> ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> langgraph dev --tunnel
> ```

## 7. 测试 API

**Javascript SDK**

1. 安装 LangGraph JS SDK：
   ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   npm install @langchain/langgraph-sdk
   ```
2. 向智能体发送一条消息（无线程运行）：

```js theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Client } from "@langchain/langgraph-sdk";

// only set the apiUrl if you changed the default port when calling langgraph dev
const client = new Client({ apiUrl: "http://localhost:2024"});

const streamResponse = client.runs.stream(
  null, // Threadless run
  "agent", // Assistant ID
  {
    input: {
      "messages": [
        { "role": "user", "content": "What is LangGraph?"}
      ]
    },
    streamMode: "messages-tuple",
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
    --url "http://localhost:2024/runs/stream" \
    --header 'Content-Type: application/json' \
    --data "{
        \"assistant_id\": \"agent\",
        \"input\": {
            \"messages\": [
                {
                    \"role\": \"human\",
                    \"content\": \"What is LangGraph?\"
                }
            ]
        },
        \"stream_mode\": \"messages-tuple\"
    }"
```

## 后续步骤

现在你已经在本地运行起一个 LangGraph 应用，接下来可以探索部署和高级功能，继续你的旅程：

* [部署快速入门](https://docs.langchain.com/langsmith/deployment-quickstart.md)：使用 LangSmith 部署你的 LangGraph 应用。

* [LangSmith](https://docs.langchain.com/langsmith/observability.md)：了解 LangSmith 的基础概念。

* [SDK 参考](https://reference.langchain.com/javascript/langchain-langgraph-sdk)：探索 SDK API 参考。

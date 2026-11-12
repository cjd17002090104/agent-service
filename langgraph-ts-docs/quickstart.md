> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/quickstart.md

# 快速入门

本快速入门演示如何使用 LangGraph 的 Graph API 或 Functional API 构建一个计算器智能体。

构建 LangGraph 计算器快速入门

按照 LangGraph 快速入门，在当前工作目录中构建一个 LangGraph 计算器智能体。

## 步骤 1：阅读指南

检测本项目使用的是 Python 还是 TypeScript/JavaScript。抓取并遵循与之匹配的页面；在包名、模型字符串和代码方面，以该页面为唯一权威来源：

* Python：[https://docs.langchain.com/oss/python/langgraph/quickstart.md](https://docs.langchain.com/oss/python/langgraph/quickstart.md)
* TypeScript：[https://docs.langchain.com/oss/javascript/langgraph/quickstart.md](https://docs.langchain.com/oss/javascript/langgraph/quickstart.md)

询问用户要使用 Graph API 还是 Functional API。如果用户没有偏好，则使用 Graph API 路径。

## 步骤 2：安装依赖

使用本项目已在使用的包管理器，安装所选路径所需的包。

## 步骤 3：配置模型凭据

本快速入门默认使用 Anthropic。检查是否已设置 `ANTHROPIC_API_KEY`。如果没有设置，请用户创建一个 key 并在 shell 或 `.env` 文件中设置它，然后停止并等待确认。不要臆造、硬编码或提交 API key。如果用户更希望使用集成文档中的其他聊天模型提供商，请在确认后相应地调整示例。

## 步骤 4：实现计算器智能体

端到端实现所选快速入门路径：为加、乘、除提供工具；编写智能体图或函数式工作流；以及一个会触发工具调用的示例调用。打印最终结果，以便用户验证运行。

## 规则

* 严格限定在本快速入门的范围内。除非用户要求，否则不要添加部署、评估或其他无关框架。
* 优先使用已抓取指南中展示的 API 和结构，而不是另创一套智能体模式。
* 当密钥、API 选择或项目约定不明确时，要询问而不是猜测。

> [!TIP]
>
> **正在使用 AI 编程助手？**
>
> * 安装 [LangChain Docs MCP 服务器](https://docs.langchain.com/use-these-docs.md)，让你的智能体能够访问最新的 LangChain 文档和示例。
>
>   连接 LangChain 文档 MCP 服务器
>
>   为我的编程智能体连接两个 LangChain 文档 MCP 服务器，以便它能够查询当前的 LangChain、LangGraph 和 LangSmith 文档及 API 参考。
>
>   要添加的服务器：
>
>   * `docs-langchain`：[https://docs.langchain.com/mcp](https://docs.langchain.com/mcp)
>   * `reference-langchain`：[https://reference.langchain.com/mcp](https://reference.langchain.com/mcp)
>
>   检测我正在使用的是哪个智能体或编辑器（Claude Code、Cursor、Codex CLI、Claude Desktop、Deep Agents Code、VS Code、Antigravity 或其他兼容 MCP 的客户端）。使用 [https://docs.langchain.com/use-these-docs.md](https://docs.langchain.com/use-these-docs.md) 中与之匹配的配置方式：
>
>   * Claude Code：为每个服务器执行 `claude mcp add --transport http`（默认使用 project 作用域；只有在我要求全局访问时才使用 `--scope user`）。
>   * Codex CLI：用每个服务器 URL 执行 `codex mcp add`。
>   * Cursor、Deep Agents Code、VS Code 或 Antigravity：按照该页面为我的客户端展示的字段名，把两个条目合并进 MCP 设置 JSON。
>   * Claude Desktop：在 Settings > Connectors 下添加两个 URL。
>
>   不要臆造其他 MCP URL。配置完成后，确认两个服务器都已列出且可访问。
> * 安装 [LangChain Skills](https://github.com/langchain-ai/langchain-skills)，以提升你的智能体在 LangChain 生态任务上的表现。
>
>   安装 LangChain Skills
>
>   为我的编程智能体安装 LangChain Skills，使其在 LangChain、LangGraph 和 Deep Agents 任务上表现更好。
>
>   使用 [https://github.com/langchain-ai/langchain-skills](https://github.com/langchain-ai/langchain-skills) 中的 Agent Skills 安装器：
>
>   ```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
>   npx skills add langchain-ai/langchain-skills --skill '*' --yes
>   ```
>
>   如果我要求改为全局安装，则使用：
>
>   ```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
>   npx skills add langchain-ai/langchain-skills --skill '*' --yes --global
>   ```
>
>   检测我正在使用的是哪个智能体或编辑器。如果我使用 Claude Code 并且偏好插件方式，请按照该仓库 README 中的 marketplace 安装流程操作（先 `/plugin marketplace add`，再 `/plugin install`）。不要臆造其他 skill 包名或安装 URL。安装完成后，确认这些 skill 已可供智能体使用。

* 如果你偏好把智能体定义为由节点和边构成的图，请[使用 Graph API](#use-the-graph-api)。
* 如果你偏好把智能体定义为单个函数，请[使用 Functional API](#use-the-functional-api)。

关于概念性信息，请参阅 [Graph API 概览](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md)和 [Functional API 概览](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md)。

> [!NOTE]
>
> 本示例需要你注册一个 [Claude (Anthropic)](https://www.anthropic.com/) 账号并获取 API key。然后，在终端中设置 `ANTHROPIC_API_KEY` 环境变量。关于所有可用的提供商，请参阅[聊天模型集成](https://docs.langchain.com/oss/javascript/integrations/chat.md)。如果你使用 [LangSmith Gateway](https://docs.langchain.com/langsmith/llm-gateway.md)，你可以[自带提供商密钥](https://docs.langchain.com/langsmith/llm-gateway-quickstart.md#send-a-request)，或使用 [Gateway Credits](https://docs.langchain.com/langsmith/llm-gateway-credits.md) 在没有提供商密钥的情况下访问模型。

**使用 Graph API**

## 1. 定义工具和模型

在本示例中，我们将使用 Claude Sonnet 4.5 模型，并定义加法、乘法和除法工具。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import * as z from "zod";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
});

// Define tools
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "Add two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "Multiply two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const divide = tool(({ a, b }) => a / b, {
  name: "divide",
  description: "Divide two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

// Augment the LLM with tools
const toolsByName = {
  [add.name]: add,
  [multiply.name]: multiply,
  [divide.name]: divide,
};
const tools = Object.values(toolsByName);
const modelWithTools = model.bindTools(tools);
```

## 2. 定义状态

图的状态用于存储消息以及 LLM 调用次数。

> [!TIP]
>
> LangGraph 中的状态会在智能体的整个执行过程中持续存在。
>
> `MessagesValue` 提供了用于追加消息的内置 reducer。`llmCalls` 字段使用带 `(x, y) => x + y` 的 `ReducedValue` 来累加计数。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateGraph,
  StateSchema,
  MessagesValue,
  ReducedValue,
  GraphNode,
  ConditionalEdgeRouter,
  START,
  END,
} from "@langchain/langgraph";
import { z } from "zod/v4";

const MessagesState = new StateSchema({
  messages: MessagesValue,
  llmCalls: new ReducedValue(
    z.number().default(0),
    { reducer: (x, y) => x + y }
  ),
});
```

## 3. 定义模型节点

模型节点用于调用 LLM，并决定是否调用工具。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { SystemMessage } from "@langchain/core/messages";

const llmCall: GraphNode<typeof MessagesState> = async (state) => {
  const response = await modelWithTools.invoke([
    new SystemMessage(
      "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
    ),
    ...state.messages,
  ]);
  return {
    messages: [response],
    llmCalls: 1,
  };
};
```

## 4. 定义工具节点

工具节点用于调用工具并返回结果。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { AIMessage, ToolMessage } from "@langchain/core/messages";

const toolNode: GraphNode<typeof MessagesState> = async (state) => {
  const lastMessage = state.messages.at(-1);

  if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
    return { messages: [] };
  }

  const result: ToolMessage[] = [];
  for (const toolCall of lastMessage.tool_calls ?? []) {
    const tool = toolsByName[toolCall.name];
    const observation = await tool.invoke(toolCall);
    result.push(observation);
  }

  return { messages: result };
};
```

## 5. 定义结束逻辑

条件边函数根据 LLM 是否发起工具调用，来路由到工具节点或结束。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const shouldContinue: ConditionalEdgeRouter<{ InputSchema: typeof MessagesState; Nodes: "toolNode" }> = (state) => {
  const lastMessage = state.messages.at(-1);

  // Check if it's an AIMessage before accessing tool_calls
  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return END;
  }

  // If the LLM makes a tool call, then perform an action
  if (lastMessage.tool_calls?.length) {
    return "toolNode";
  }

  // Otherwise, we stop (reply to the user)
  return END;
};
```

## 6. 构建并编译智能体

智能体使用 [`StateGraph`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) 类构建，并通过 [`compile`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/compile) 方法编译。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const agent = new StateGraph(MessagesState)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
  .addEdge("toolNode", "llmCall")
  .compile();

// Invoke
import { HumanMessage } from "@langchain/core/messages";
const result = await agent.invoke({
  messages: [new HumanMessage("Add 3 and 4.")],
});

for (const message of result.messages) {
  console.log(`[${message.type}]: ${message.text}`);
}
```

> [!TIP]
>
> 使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-quickstart) 追踪并调试你的智能体。按照[追踪快速入门](https://docs.langchain.com/langsmith/trace-with-langgraph.md)完成设置。准备好上生产时，请参阅[部署](https://docs.langchain.com/langsmith/deployment.md)了解托管选项。
>
> 我们还建议你配置 [LangSmith Engine](https://docs.langchain.com/langsmith/engine.md)，它会监控你的追踪、检测问题并提出修复方案。

恭喜！你已经使用 LangGraph 的 Graph API 构建了第一个智能体。

> **完整代码示例**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // Step 1: Define tools and model
>
> import { ChatAnthropic } from "@langchain/anthropic";
> import { tool } from "@langchain/core/tools";
> import * as z from "zod";
>
> const model = new ChatAnthropic({
>   model: "claude-sonnet-4-6",
>   temperature: 0,
> });
>
> // Define tools
> const add = tool(({ a, b }) => a + b, {
>   name: "add",
>   description: "Add two numbers",
>   schema: z.object({
>     a: z.number().describe("First number"),
>     b: z.number().describe("Second number"),
>   }),
> });
>
> const multiply = tool(({ a, b }) => a * b, {
>   name: "multiply",
>   description: "Multiply two numbers",
>   schema: z.object({
>     a: z.number().describe("First number"),
>     b: z.number().describe("Second number"),
>   }),
> });
>
> const divide = tool(({ a, b }) => a / b, {
>   name: "divide",
>   description: "Divide two numbers",
>   schema: z.object({
>     a: z.number().describe("First number"),
>     b: z.number().describe("Second number"),
>   }),
> });
>
> // Augment the LLM with tools
> const toolsByName = {
>   [add.name]: add,
>   [multiply.name]: multiply,
>   [divide.name]: divide,
> };
> const tools = Object.values(toolsByName);
> const modelWithTools = model.bindTools(tools);
> ```
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // Step 2: Define state
>
> import {
>   StateGraph,
>   StateSchema,
>   MessagesValue,
>   ReducedValue,
>   GraphNode,
>   ConditionalEdgeRouter,
>   START,
>   END,
> } from "@langchain/langgraph";
> import * as z from "zod";
>
> const MessagesState = new StateSchema({
>   messages: MessagesValue,
>   llmCalls: new ReducedValue(
>     z.number().default(0),
>     { reducer: (x, y) => x + y }
>   ),
> });
> ```
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // Step 3: Define model node
>
> import { SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
>
> const llmCall: GraphNode<typeof MessagesState> = async (state) => {
>   return {
>     messages: [await modelWithTools.invoke([
>       new SystemMessage(
>         "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
>       ),
>       ...state.messages,
>     ])],
>     llmCalls: 1,
>   };
> };
>
> // Step 4: Define tool node
>
> const toolNode: GraphNode<typeof MessagesState> = async (state) => {
>   const lastMessage = state.messages.at(-1);
>
>   if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
>     return { messages: [] };
>   }
>
>   const result: ToolMessage[] = [];
>   for (const toolCall of lastMessage.tool_calls ?? []) {
>     const tool = toolsByName[toolCall.name];
>     const observation = await tool.invoke(toolCall);
>     result.push(observation);
>   }
>
>   return { messages: result };
> };
> ```
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // Step 5: Define logic to determine whether to end
> import { ConditionalEdgeRouter, END } from "@langchain/langgraph";
>
> const shouldContinue: ConditionalEdgeRouter<{ InputSchema: typeof MessagesState; Nodes: "toolNode" }> = (state) => {
>   const lastMessage = state.messages.at(-1);
>
>   // Check if it's an AIMessage before accessing tool_calls
>   if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
>     return END;
>   }
>
>   // If the LLM makes a tool call, then perform an action
>   if (lastMessage.tool_calls?.length) {
>     return "toolNode";
>   }
>
>   // Otherwise, we stop (reply to the user)
>   return END;
> };
> ```
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // Step 6: Build and compile the agent
> import { HumanMessage } from "@langchain/core/messages";
> import { StateGraph, START, END } from "@langchain/langgraph";
>
> const agent = new StateGraph(MessagesState)
>   .addNode("llmCall", llmCall)
>   .addNode("toolNode", toolNode)
>   .addEdge(START, "llmCall")
>   .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
>   .addEdge("toolNode", "llmCall")
>   .compile();
>
> // Invoke
> const result = await agent.invoke({
>   messages: [new HumanMessage("Add 3 and 4.")],
> });
>
> for (const message of result.messages) {
>   console.log(`[${message.type}]: ${message.text}`);
> }
> ```

**使用 Functional API**

## 1. 定义工具和模型

在本示例中，我们将使用 Claude Sonnet 4.5 模型，并定义加法、乘法和除法工具。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import * as z from "zod";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
});

// Define tools
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "Add two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "Multiply two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const divide = tool(({ a, b }) => a / b, {
  name: "divide",
  description: "Divide two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

// Augment the LLM with tools
const toolsByName = {
  [add.name]: add,
  [multiply.name]: multiply,
  [divide.name]: divide,
};
const tools = Object.values(toolsByName);
const modelWithTools = model.bindTools(tools);

```

## 2. 定义模型节点

模型节点用于调用 LLM，并决定是否调用工具。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task, entrypoint } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";

const callLlm = task({ name: "callLlm" }, async (messages: BaseMessage[]) => {
  return modelWithTools.invoke([
    new SystemMessage(
      "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
    ),
    ...messages,
  ]);
});
```

## 3. 定义工具节点

工具节点用于调用工具并返回结果。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import type { ToolCall } from "@langchain/core/messages/tool";

const callTool = task({ name: "callTool" }, async (toolCall: ToolCall) => {
  const tool = toolsByName[toolCall.name];
  return tool.invoke(toolCall);
});
```

## 4. 定义智能体

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { addMessages } from "@langchain/langgraph";
import { type BaseMessage } from "@langchain/core/messages";

const agent = entrypoint({ name: "agent" }, async (messages: BaseMessage[]) => {
  let modelResponse = await callLlm(messages);

  while (true) {
    if (!modelResponse.tool_calls?.length) {
      break;
    }

    // Execute tools
    const toolResults = await Promise.all(
      modelResponse.tool_calls.map((toolCall) => callTool(toolCall))
    );
    messages = addMessages(messages, [modelResponse, ...toolResults]);
    modelResponse = await callLlm(messages);
  }

  return messages;
});

// Invoke
import { HumanMessage } from "@langchain/core/messages";

const result = await agent.invoke([new HumanMessage("Add 3 and 4.")]);

for (const message of result) {
  console.log(`[${message.getType()}]: ${message.text}`);
}
```

> [!TIP]
>
> 使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-quickstart) 追踪并调试你的智能体。按照[追踪快速入门](https://docs.langchain.com/langsmith/trace-with-langgraph.md)完成设置。准备好上生产时，请参阅[部署](https://docs.langchain.com/langsmith/deployment.md)了解托管选项。
>
> 我们还建议你配置 [LangSmith Engine](https://docs.langchain.com/langsmith/engine.md)，它会监控你的追踪、检测问题并提出修复方案。

恭喜！你已经使用 LangGraph 的 Functional API 构建了第一个智能体。

> **完整代码示例**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatAnthropic } from "@langchain/anthropic";
> import { tool } from "@langchain/core/tools";
> import {
>   task,
>   entrypoint,
>   addMessages,
> } from "@langchain/langgraph";
> import {
>   SystemMessage,
>   HumanMessage,
>   type BaseMessage,
> } from "@langchain/core/messages";
> import type { ToolCall } from "@langchain/core/messages/tool";
> import * as z from "zod";
>
> // Step 1: Define tools and model
>
> const model = new ChatAnthropic({
>   model: "claude-sonnet-4-6",
>   temperature: 0,
> });
>
> // Define tools
> const add = tool(({ a, b }) => a + b, {
>   name: "add",
>   description: "Add two numbers",
>   schema: z.object({
>     a: z.number().describe("First number"),
>     b: z.number().describe("Second number"),
>   }),
> });
>
> const multiply = tool(({ a, b }) => a * b, {
>   name: "multiply",
>   description: "Multiply two numbers",
>   schema: z.object({
>     a: z.number().describe("First number"),
>     b: z.number().describe("Second number"),
>   }),
> });
>
> const divide = tool(({ a, b }) => a / b, {
>   name: "divide",
>   description: "Divide two numbers",
>   schema: z.object({
>     a: z.number().describe("First number"),
>     b: z.number().describe("Second number"),
>   }),
> });
>
> // Augment the LLM with tools
> const toolsByName = {
>   [add.name]: add,
>   [multiply.name]: multiply,
>   [divide.name]: divide,
> };
> const tools = Object.values(toolsByName);
> const modelWithTools = model.bindTools(tools);
>
> // Step 2: Define model node
>
> const callLlm = task({ name: "callLlm" }, async (messages: BaseMessage[]) => {
>   return modelWithTools.invoke([
>     new SystemMessage(
>       "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
>     ),
>     ...messages,
>   ]);
> });
>
> // Step 3: Define tool node
>
> const callTool = task({ name: "callTool" }, async (toolCall: ToolCall) => {
>   const tool = toolsByName[toolCall.name];
>   return tool.invoke(toolCall);
> });
>
> // Step 4: Define agent
>
> const agent = entrypoint({ name: "agent" }, async (messages: BaseMessage[]) => {
>   let modelResponse = await callLlm(messages);
>
>   while (true) {
>     if (!modelResponse.tool_calls?.length) {
>       break;
>     }
>
>     // Execute tools
>     const toolResults = await Promise.all(
>       modelResponse.tool_calls.map((toolCall) => callTool(toolCall))
>     );
>     messages = addMessages(messages, [modelResponse, ...toolResults]);
>     modelResponse = await callLlm(messages);
>   }
>
>   return messages;
> });
>
> // Invoke
>
> const result = await agent.invoke([new HumanMessage("Add 3 and 4.")]);
>
> for (const message of result) {
>   console.log(`[${message.type}]: ${message.text}`);
> }
> ```

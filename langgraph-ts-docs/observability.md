> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/observability.md

# LangSmith 可观测性

轨迹（trace）是你的应用从输入到输出所经历的一系列步骤，其中每个独立步骤由一个运行（run）表示。你可以用 [LangSmith](https://smith.langchain.com?utm_source=docs&utm_medium=cta&utm_campaign=langsmith-signup&utm_content=oss-langgraph-observability) 可视化这些执行步骤。要使用它，请先[为应用启用追踪](https://docs.langchain.com/langsmith/trace-with-langgraph.md)。启用后你可以：

* [调试本地运行的应用](https://docs.langchain.com/langsmith/observability-studio.md#debug-langsmith-traces)。
* [评估应用性能](https://docs.langchain.com/oss/javascript/langchain/test/evals.md)。
* [监控应用](https://docs.langchain.com/langsmith/dashboards.md)。

## 前置条件

开始之前，请确保具备以下条件：

* **一个 LangSmith 账号**：在 [smith.langchain.com](https://smith.langchain.com?utm_source=docs&utm_medium=cta&utm_campaign=langsmith-signup&utm_content=oss-langgraph-observability) 免费注册或登录。
* **一个 LangSmith API 密钥**：请遵循[创建 API 密钥](https://docs.langchain.com/langsmith/create-account-api-key.md)指南。

## 启用追踪

要为应用启用追踪，请设置以下环境变量：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=<your-api-key>
```

默认情况下，轨迹会记录到名为 `default` 的项目。要配置自定义项目名称，请参阅[记录到指定项目](#记录到指定项目)。

更多信息请参阅[使用 LangGraph 进行追踪](https://docs.langchain.com/langsmith/trace-with-langgraph.md)。

## 选择性追踪

你可以使用 LangSmith 的 `tracing_context` 上下文管理器，只追踪特定调用或应用的特定部分：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";

// This WILL be traced
const tracer = new LangChainTracer();
await agent.invoke(
  {
    messages: [{role: "user", content: "Send a test email to alice@example.com"}]
  },
  { callbacks: [tracer] }
);

// This will NOT be traced (if LANGSMITH_TRACING is not set)
await agent.invoke(
  {
    messages: [{role: "user", content: "Send another email"}]
  }
);
```

## 记录到指定项目

> **静态设置**
>
> 可以通过设置 `LANGSMITH_PROJECT` 环境变量，为整个应用指定自定义项目名称：
>
> ```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> export LANGSMITH_PROJECT=my-agent-project
> ```

> **动态设置**
>
> 可以在代码中为特定操作设置项目名称：
>
> ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
>
> const tracer = new LangChainTracer({ projectName: "email-agent-test" });
> await agent.invoke(
>   {
>     messages: [{role: "user", content: "Send a test email to alice@example.com"}]
>   },
>   { callbacks: [tracer] }
> );
> ```

## 为轨迹添加元数据

你可以用自定义元数据和标签标注轨迹：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";

const tracer = new LangChainTracer({ projectName: "email-agent-test" });
await agent.invoke(
  {
    messages: [{role: "user", content: "Send a test email to alice@example.com"}]
  },
  config: {
    tags: ["production", "email-assistant", "v1.0"],
    metadata: {
      userId: "user123",
      sessionId: "session456",
      environment: "production"
    }
  },
);

```

这些自定义元数据和标签会附加到 LangSmith 中的轨迹上。

> [!TIP]
>
> 想进一步了解如何用轨迹调试、评估和监控智能体，请参阅 [LangSmith 文档](https://docs.langchain.com/langsmith/observability.md)。

## 使用匿名化器避免在轨迹中记录敏感数据

你可能希望屏蔽敏感数据，避免其被记录到 LangSmith。你可以创建[匿名化器](https://docs.langchain.com/langsmith/mask-inputs-outputs.md#rule-based-masking-of-inputs-and-outputs)，并通过配置将其应用到图上。下面的示例会把发送到 LangSmith 的轨迹中所有符合社会安全号码格式 XXX-XX-XXXX 的内容替换掉。

```typescript TypeScript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph } from "@langchain/langgraph";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { StateAnnotation } from "./state.js";
import { createAnonymizer } from "langsmith/anonymizer"
import { Client } from "langsmith"

const anonymizer = createAnonymizer([
  // Matches SSNs
  { pattern: /\b\d{3}-?\d{2}-?\d{4}\b/, replace: "<ssn>" }
])

const langsmithClient = new Client({ anonymizer })
const tracer = new LangChainTracer({
  client: langsmithClient,
});

export const graph = new StateGraph(StateAnnotation)
  .compile()
  .withConfig({ callbacks: [tracer] });
```

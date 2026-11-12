> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/frontend/overview.md

# 概览

> 把 LangGraph 智能体渲染到前端

构建能实时可视化 LangGraph 流水线的前端。这些模式展示了如何渲染多步图执行，包括来自自定义 `StateGraph` 工作流的逐节点状态与流式内容。

LangGraph 的前端优势在于：UI 可以沿用与图相同的结构。节点、状态键、检查点、中断、子图以及流式消息都是运行时可感知的概念，因此你可以构建出能解释系统正在做什么的界面，而不是把所有执行过程藏在一条助手消息背后。

> [!NOTE]
>
> 这些模式使用 v1 前端 SDK 包。如果你使用的是更早的版本，请参阅 [React](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-react/docs/v1-migration.md)、[Vue](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-vue/docs/v1-migration.md)、[Svelte](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-svelte/docs/v1-migration.md) 和 [Angular](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-angular/docs/v1-migration.md) 的迁移指南。

## 架构

LangGraph 图由通过边连接的具名节点组成。每个节点执行一个步骤（分类、检索、分析、综合），并把输出写入特定的状态键。在前端，SDK 的流句柄提供对节点输出、流式 token 以及已发现子图的响应式访问，因此你可以把每个节点映射到一张 UI 卡片。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
%%{
  init: {
    "fontFamily": "monospace",
    "flowchart": {
      "curve": "curve"
    }
  }
}%%
graph LR
  FRONTEND["useStream()"]
  GRAPH["StateGraph"]
  N1["Node A"]
  N2["Node B"]
  N3["Node C"]

  GRAPH --"stream"--> FRONTEND
  FRONTEND --"submit"--> GRAPH
  GRAPH --> N1
  N1 --> N2
  N2 --> N3

  classDef blueHighlight fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A;
  classDef greenHighlight fill:#DCFCE7,stroke:#16A34A,color:#14532D;
  classDef orangeHighlight fill:#FEF3C7,stroke:#D97706,color:#92400E;
  class FRONTEND blueHighlight;
  class GRAPH greenHighlight;
  class N1,N2,N3 orangeHighlight;
```

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Annotation, MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  classification: Annotation<string>(),
  research: Annotation<string>(),
  analysis: Annotation<string>(),
  synthesis: Annotation<string>(),
});

const graph = new StateGraph(State)
  .addNode("classify", classifyNode)
  .addNode("do_research", researchNode)
  .addNode("analyze", analyzeNode)
  .addNode("synthesize", synthesizeNode)
  .addEdge(START, "classify")
  .addEdge("classify", "do_research")
  .addEdge("do_research", "analyze")
  .addEdge("analyze", "synthesize")
  .addEdge("synthesize", END)
  .compile();
```

在前端，[`useStream`](https://reference.langchain.com/javascript/langchain-react/index/useStream) 通过 `stream.subgraphs` 暴露图节点发现能力，并提供 `useMessages(stream, node)` 这类选择器辅助函数来获取节点范围内的流式内容。当你需要最终 `synthesis` 之类的字段时，`stream.values` 仍然持有完整的图状态。Angular 通过 [`injectStream`](https://reference.langchain.com/javascript/langchain-angular/injectStream) 使用相同形状的流 API。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useStream } from "@langchain/react";

function Pipeline() {
  const stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });

  const classification = stream.values?.classification;
  const research = stream.values?.research;
  const analysis = stream.values?.analysis;
  const graphNodes = [...stream.subgraphs.values()];
}
```

## 与聊天流的区别

自定义图常常承载产品工作流：研究流水线、审批流、数据流水线、数据增强、代码审查、规划以及多步分析。前端 SDK 让你可以用图原生的信号渲染这些工作流：

| 运行时概念 | 前端体验 |
| - | - |
| **具名节点** | 每个图节点对应一张卡片、一个时间线步骤或一个状态徽标。 |
| **状态键** | 为类型化输出（如分类、来源、分析、最终综合）提供专属 UI 区域。 |
| **流式元数据** | 把部分消息路由到产生它的节点。 |
| **检查点** | 检查或从先前的图状态恢复，用于调试与审计。 |
| **中断** | 暂停节点以等待人工输入、审批或修正，然后继续。 |
| **子图** | 仅在用户需要更多细节时才展示嵌套执行。 |

由于 SDK 直接暴露这些概念，你可以从简单的聊天面板扩展到完整的工作流调试器，而无需改动后端协议。

## 模式

> **[图执行](https://docs.langchain.com/oss/javascript/langgraph/frontend/graph-execution.md)**
>
> 以逐节点状态和流式内容可视化多步图流水线。

> **[自定义流通道](https://docs.langchain.com/oss/javascript/langgraph/frontend/custom-stream-channels.md)**
>
> 把自定义的服务端数据流式发送到前端，并用 `useExtension` 和 `useChannel` 读取。

## 相关模式

[LangChain 前端模式](https://docs.langchain.com/oss/javascript/langchain/frontend/overview.md)——Markdown 消息、工具调用、human-in-the-loop、可恢复流与时间旅行——适用于任何 LangGraph 图。无论你使用 `createAgent`、`createDeepAgent` 还是自定义 `StateGraph`，流 API 都提供相同的核心数据模型。

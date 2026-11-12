> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/overview.md

# LangGraph 概览

> 借助 LangGraph 获得控制力，设计能够可靠处理复杂任务的智能体

LangGraph 受到众多塑造智能体未来的公司信赖——包括 Klarna、Uber、J.P. Morgan 等——它是一个底层编排框架与运行时，用于构建、管理和部署长时间运行、有状态的智能体。LangGraph 让你拥有细粒度的控制力，可以在同一个图中混合确定性的手写步骤与由 LLM 驱动的智能体步骤，从而构建出行为完全符合你应用需求的自定义智能体。

LangGraph 非常底层，完全专注于智能体**编排**。在使用 LangGraph 之前，我们建议你先熟悉一些用于构建智能体的组件，从[模型](https://docs.langchain.com/oss/javascript/langchain/models.md)和[工具](https://docs.langchain.com/oss/javascript/langchain/tools.md)开始。

在整份文档中，我们通常会使用 [LangChain](https://docs.langchain.com/oss/javascript/langchain/overview.md) 的组件来集成模型和工具，但你并不需要使用 LangChain 才能使用 LangGraph。如果你刚刚开始接触智能体，或者想要更高层的抽象，我们建议你使用 LangChain 的[智能体](https://docs.langchain.com/oss/javascript/langchain/agents.md)，它为常见的 LLM 与工具调用循环提供了预置架构。

LangGraph 专注于对智能体编排至关重要的底层能力：持久化执行、流式传输、人在环路（human-in-the-loop）等等。

LangGraph 的核心优势之一，是能够在单个图中混合确定性步骤与 LLM 驱动的智能体步骤。这让你可以构建自定义工作流：其中部分逻辑完全可预测、可审计，而另一部分逻辑则灵活且由模型驱动，从而让你对 AI 究竟在何处、以何种方式被应用拥有细粒度的控制。

**LangChain 各产品如何协同**

* [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview.md) 是一个[智能体运行框架（agent harness）](https://docs.langchain.com/oss/javascript/concepts/products.md#agent-harnesses-like-the-deep-agents-sdk)：在 LangGraph 之上提供规划、子智能体、文件系统工具和上下文管理。
* [LangChain](https://docs.langchain.com/oss/javascript/langchain/overview.md) 是智能体框架：为模型、工具和智能体循环提供抽象与集成。
* [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview.md) 是编排运行时：持久化执行、流式传输、人在环路和持久化。
* [LangSmith](https://docs.langchain.com/langsmith/observability.md) 是跨框架进行追踪、评估、提示词管理和部署的平台。
* [LangSmith Engine](https://docs.langchain.com/langsmith/engine.md) 会检测你的 LangGraph 智能体追踪中的问题并提出修复方案。你可以直接在 Engine 标签页中，用建议的修复方案打开一个 pull request。
* [LangSmith Fleet](https://docs.langchain.com/langsmith/fleet/index.md) 是无代码智能体构建器，用于模板、集成和例行自动化。

阅读[框架、运行时与运行框架](https://docs.langchain.com/oss/javascript/concepts/products.md)以了解开源技术栈的对比。

## &#x20;安装

```bash npm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install @langchain/langgraph @langchain/core
```

```bash pnpm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
pnpm add @langchain/langgraph @langchain/core
```

```bash yarn theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
yarn add @langchain/langgraph @langchain/core
```

```bash bun theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
bun add @langchain/langgraph @langchain/core
```

然后，创建一个简单的 hello world 示例：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";

const State = new StateSchema({
  messages: MessagesValue,
});

const mockLlm: GraphNode<typeof State> = (state) => {
  return { messages: [{ role: "ai", content: "hello world" }] };
};

const graph = new StateGraph(State)
  .addNode("mock_llm", mockLlm)
  .addEdge(START, "mock_llm")
  .addEdge("mock_llm", END)
  .compile();

await graph.invoke({ messages: [{ role: "user", content: "hi!" }] });
```

> [!TIP]
>
> 使用 [LangSmith](https://docs.langchain.com/langsmith/observability.md) 追踪请求、调试智能体行为并评估输出。设置 `LANGSMITH_TRACING=true` 和你的 API key 即可开始。按照[追踪快速入门](https://docs.langchain.com/langsmith/trace-with-langchain.md)完成设置。我们还建议你配置 [LangSmith Engine](https://docs.langchain.com/langsmith/engine.md)，它会监控你的追踪、检测问题并提出修复方案。

## 核心优势

LangGraph 为*任何*长时间运行、有状态的工作流或智能体提供底层支撑设施。LangGraph 不对提示词或架构做抽象，并提供以下核心优势：

* **混合确定性步骤与智能体步骤**：在单个图中，把手写的确定性逻辑与 LLM 驱动的决策结合起来。在你需要可靠性和可预测性的地方使用确定性步骤，在你需要灵活性的地方使用智能体步骤——从而对智能体行为的每一部分都拥有精确控制。
* [持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)：构建能够经受失败、可长时间运行并从上次中断处继续的智能体。
* [人在环路](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)：在任何时刻检查并修改智能体状态，从而引入人工监督。
* [全面的记忆](https://docs.langchain.com/oss/javascript/concepts/memory.md)：创建同时具备用于持续推理的短期工作记忆和跨会话长期记忆的有状态智能体。
* [使用 LangSmith 调试](https://docs.langchain.com/langsmith/observability.md)：借助可视化工具追踪执行路径、捕获状态转换并提供详细的运行时指标，从而深入了解复杂的智能体行为。
* [生产级部署](https://docs.langchain.com/langsmith/deployment.md)：借助可扩展的基础设施，自信地部署复杂的智能体系统，从容应对有状态、长时间运行工作流的独特挑战。

## LangGraph 生态

LangGraph 既可以独立使用，也能与任何 LangChain 产品无缝集成，为开发者提供构建智能体的完整工具套件。为了提升你的 LLM 应用开发体验，可将 LangGraph 与以下产品搭配使用：

> **[LangSmith 可观测性](https://docs.langchain.com/langsmith/observability.md)**
>
> 在一处追踪请求、评估输出并监控部署。用 LangGraph 在本地做原型，然后借助集成的可观测性与评估能力走向生产环境，构建更可靠的智能体系统。

> **[LangSmith 部署](https://docs.langchain.com/langsmith/deployment.md)**
>
> 借助专为长时间运行、有状态工作流打造的部署平台，轻松部署并扩展智能体。在团队之间发现、复用、配置和共享智能体——并通过 Studio 中的可视化原型快速迭代。

> **[LangChain](https://docs.langchain.com/oss/javascript/langchain/overview.md)**
>
> 提供集成和可组合组件，以简化 LLM 应用开发。其中包含构建在 LangGraph 之上的智能体抽象。

## 致谢

LangGraph 的灵感来自 [Pregel](https://research.google/pubs/pub37252/) 和 [Apache Beam](https://beam.apache.org/)。其公开接口的灵感来自 [NetworkX](https://networkx.org/documentation/latest/)。LangGraph 由 LangChain 的创建者 LangChain Inc 构建，但可以在不使用 LangChain 的情况下使用。

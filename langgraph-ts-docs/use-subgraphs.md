> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md

# 子图

本指南介绍使用子图的机制。子图是在另一个图中用作[节点](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#nodes)的[图](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graphs)。

子图适用于：

* 构建[多智能体系统](https://docs.langchain.com/oss/javascript/langchain/multi-agent.md)
* 在多个图中复用同一组节点
* 分散开发：当你希望不同团队独立处理图的不同部分时，可以将每个部分定义为子图；只要遵守子图的接口（输入与输出模式），父图就可以在不了解子图任何细节的情况下构建

## 准备工作

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install @langchain/langgraph
```

> [!TIP]
>
> **为 LangGraph 开发配置 LangSmith**
> 注册 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-use-subgraphs)，以便快速发现问题并提升 LangGraph 项目的性能。LangSmith 让你使用追踪数据来调试、测试和监控用 LangGraph 构建的 LLM 应用——阅读[如何开始使用 LangSmith](https://docs.langchain.com/langsmith/observability.md) 了解更多。

## 定义子图通信

添加子图时，你需要定义父图与子图如何通信：

| 模式 | 使用时机 | 状态模式 |
| - | - | - |
| [在节点内调用子图](#call-a-subgraph-inside-a-node) | 父图与子图具有**不同的状态模式**（没有共享键），或者你需要在其间转换状态 | 你编写一个包装函数，将父图状态映射为子图输入，并将子图输出映射回父图状态 |
| [将子图作为节点添加](#add-a-subgraph-as-a-node) | 父图与子图**共享状态键**——子图读写与父图相同的通道 | 直接将编译后的子图传给 `add_node`，无需包装函数 |

### 在节点内调用子图

当父图与子图具有**不同的状态模式**（没有共享键）时，请在节点函数内部调用子图。当你想在[多智能体](https://docs.langchain.com/oss/javascript/langchain/multi-agent.md)系统中为每个智能体保留私有的消息历史时，这很常见。

节点函数在调用子图之前将父图状态转换为子图状态，并在返回之前将结果转换回父图状态。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START } from "@langchain/langgraph";
import * as z from "zod";

const SubgraphState = new StateSchema({
  bar: z.string(),
});

// Subgraph
const subgraphBuilder = new StateGraph(SubgraphState)
  .addNode("subgraphNode1", (state) => {
    return { bar: "hi! " + state.bar };
  })
  .addEdge(START, "subgraphNode1");

const subgraph = subgraphBuilder.compile();

// Parent graph
const State = new StateSchema({
  foo: z.string(),
});

// Transform the state to the subgraph state and back
const builder = new StateGraph(State)
  .addNode("node1", async (state) => {
    const subgraphOutput = await subgraph.invoke({ bar: state.foo });
    return { foo: subgraphOutput.bar };
  })
  .addEdge(START, "node1");

const graph = builder.compile();
```

> **完整示例：不同的状态模式**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, START } from "@langchain/langgraph";
> import * as z from "zod";
>
> // Define subgraph
> const SubgraphState = new StateSchema({
>   // note that none of these keys are shared with the parent graph state
>   bar: z.string(),
>   baz: z.string(),
> });
>
> const subgraphBuilder = new StateGraph(SubgraphState)
>   .addNode("subgraphNode1", (state) => {
>     return { baz: "baz" };
>   })
>   .addNode("subgraphNode2", (state) => {
>     return { bar: state.bar + state.baz };
>   })
>   .addEdge(START, "subgraphNode1")
>   .addEdge("subgraphNode1", "subgraphNode2");
>
> const subgraph = subgraphBuilder.compile();
>
> // Define parent graph
> const ParentState = new StateSchema({
>   foo: z.string(),
> });
>
> const builder = new StateGraph(ParentState)
>   .addNode("node1", (state) => {
>     return { foo: "hi! " + state.foo };
>   })
>   .addNode("node2", async (state) => {
>     const response = await subgraph.invoke({ bar: state.foo });   // [!code highlight]
>     return { foo: response.bar };   // [!code highlight]
>   })
>   .addEdge(START, "node1")
>   .addEdge("node1", "node2");
>
> const graph = builder.compile();
>
> const stream = await graph.streamEvents(
>   { foo: "foo" },
>   { subgraphs: true, version: "v3" }
> );
> for await (const message of stream.messages) {
>   for await (const token of message.text) {
>     process.stdout.write(token);
>   }
> }
> ```
>
> 1. 将状态转换为子图状态
> 2. 将响应转换回父图状态
>
> ```
> [[], { node1: { foo: 'hi! foo' } }]
> [['node2:9c36dd0f-151a-cb42-cbad-fa2f851f9ab7'], { subgraphNode1: { baz: 'baz' } }]
> [['node2:9c36dd0f-151a-cb42-cbad-fa2f851f9ab7'], { subgraphNode2: { bar: 'hi! foobaz' } }]
> [[], { node2: { foo: 'hi! foobaz' } }]
> ```

> **完整示例：不同的状态模式（两级子图）**
>
> 这是一个包含两级子图的示例：父图 -> 子图 -> 孙图。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
> import * as z from "zod";
>
> // Grandchild graph
> const GrandChildState = new StateSchema({
>   myGrandchildKey: z.string(),
> });
>
> const grandchild = new StateGraph(GrandChildState)
>   .addNode("grandchild1", (state) => {
>     // NOTE: child or parent keys will not be accessible here
>     return { myGrandchildKey: state.myGrandchildKey + ", how are you" };
>   })
>   .addEdge(START, "grandchild1")
>   .addEdge("grandchild1", END);
>
> const grandchildGraph = grandchild.compile();
>
> // Child graph
> const ChildState = new StateSchema({
>   myChildKey: z.string(),
> });
>
> const child = new StateGraph(ChildState)
>   .addNode("child1", async (state) => {
>     // NOTE: parent or grandchild keys won't be accessible here
>     const grandchildGraphInput = { myGrandchildKey: state.myChildKey };   // [!code highlight]
>     const grandchildGraphOutput = await grandchildGraph.invoke(grandchildGraphInput);
>     return { myChildKey: grandchildGraphOutput.myGrandchildKey + " today?" };   // [!code highlight]
>   })   // [!code highlight]
>   .addEdge(START, "child1")
>   .addEdge("child1", END);
>
> const childGraph = child.compile();
>
> // Parent graph
> const ParentState = new StateSchema({
>   myKey: z.string(),
> });
>
> const parent = new StateGraph(ParentState)
>   .addNode("parent1", (state) => {
>     // NOTE: child or grandchild keys won't be accessible here
>     return { myKey: "hi " + state.myKey };
>   })
>   .addNode("child", async (state) => {
>     const childGraphInput = { myChildKey: state.myKey };   // [!code highlight]
>     const childGraphOutput = await childGraph.invoke(childGraphInput);
>     return { myKey: childGraphOutput.myChildKey };   // [!code highlight]
>   })   // [!code highlight]
>   .addNode("parent2", (state) => {
>     return { myKey: state.myKey + " bye!" };
>   })
>   .addEdge(START, "parent1")
>   .addEdge("parent1", "child")
>   .addEdge("child", "parent2")
>   .addEdge("parent2", END);
>
> const parentGraph = parent.compile();
>
> const stream = await parentGraph.streamEvents(
>   { myKey: "Bob" },
>   { subgraphs: true, version: "v3" }
> );
> for await (const message of stream.messages) {
>   for await (const token of message.text) {
>     process.stdout.write(token);
>   }
> }
> ```
>
> 1. 我们正在将状态从子图状态通道（`myChildKey`）转换为孙图状态通道（`myGrandchildKey`）
> 2. 我们正在将状态从孙图状态通道（`myGrandchildKey`）转换回子图状态通道（`myChildKey`）
> 3. 这里我们传入的是一个函数，而不只是编译后的图（`grandchildGraph`）
> 4. 我们正在将状态从父图状态通道（`myKey`）转换为子图状态通道（`myChildKey`）
> 5. 我们正在将状态从子图状态通道（`myChildKey`）转换回父图状态通道（`myKey`）
> 6. 这里我们传入的是一个函数，而不只是一个编译后的图（`childGraph`）
>
> ```
> [[], { parent1: { myKey: 'hi Bob' } }]
> [['child:2e26e9ce-602f-862c-aa66-1ea5a4655e3b', 'child1:781bb3b1-3971-84ce-810b-acf819a03f9c'], { grandchild1: { myGrandchildKey: 'hi Bob, how are you' } }]
> [['child:2e26e9ce-602f-862c-aa66-1ea5a4655e3b'], { child1: { myChildKey: 'hi Bob, how are you today?' } }]
> [[], { child: { myKey: 'hi Bob, how are you today?' } }]
> [[], { parent2: { myKey: 'hi Bob, how are you today? bye!' } }]
> ```

### 将子图作为节点添加

当父图与子图**共享状态键**时，你可以直接将编译后的子图传给 `add_node`。无需包装函数——子图会自动读写父图的状态通道。例如，在[多智能体](https://docs.langchain.com/oss/javascript/langchain/multi-agent.md)系统中，各智能体通常通过共享的 [messages](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#why-use-messages) 键通信。

![SQL 智能体图](https://mintcdn.com/langchain-5e9cc07a/ybiAaBfoBvFquMDz/oss/images/subgraph.png?fit=max\&auto=format\&n=ybiAaBfoBvFquMDz\&q=85\&s=c280df5c968cd4237b0b5d03823d8946)

如果你的子图与父图共享状态键，可以按照以下步骤将其添加到图中：

1. 定义子图工作流（下例中的 `subgraphBuilder`）并编译它
2. 在定义父图工作流时，将编译后的子图传给 `.addNode` 方法

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  foo: z.string(),
});

// Subgraph
const subgraphBuilder = new StateGraph(State)
  .addNode("subgraphNode1", (state) => {
    return { foo: "hi! " + state.foo };
  })
  .addEdge(START, "subgraphNode1");

const subgraph = subgraphBuilder.compile();

// Parent graph
const builder = new StateGraph(State)
  .addNode("node1", subgraph)
  .addEdge(START, "node1");

const graph = builder.compile();
```

> **完整示例：共享状态模式**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, START } from "@langchain/langgraph";
> import * as z from "zod";
>
> // Define subgraph
> const SubgraphState = new StateSchema({
>   foo: z.string(),    // [!code highlight]
>   bar: z.string(),    // [!code highlight]
> });
>
> const subgraphBuilder = new StateGraph(SubgraphState)
>   .addNode("subgraphNode1", (state) => {
>     return { bar: "bar" };
>   })
>   .addNode("subgraphNode2", (state) => {
>     // note that this node is using a state key ('bar') that is only available in the subgraph
>     // and is sending update on the shared state key ('foo')
>     return { foo: state.foo + state.bar };
>   })
>   .addEdge(START, "subgraphNode1")
>   .addEdge("subgraphNode1", "subgraphNode2");
>
> const subgraph = subgraphBuilder.compile();
>
> // Define parent graph
> const ParentState = new StateSchema({
>   foo: z.string(),
> });
>
> const builder = new StateGraph(ParentState)
>   .addNode("node1", (state) => {
>     return { foo: "hi! " + state.foo };
>   })
>   .addNode("node2", subgraph)
>   .addEdge(START, "node1")
>   .addEdge("node1", "node2");
>
> const graph = builder.compile();
>
> const stream = await graph.streamEvents({ foo: "foo" }, { version: "v3" });
> for await (const message of stream.messages) {
>   for await (const token of message.text) {
>     process.stdout.write(token);
>   }
> }
> ```
>
> 1. 该键与父图状态共享
> 2. 该键是 `SubgraphState` 私有的，父图不可见
>
> ```
> { node1: { foo: 'hi! foo' } }
> { node2: { foo: 'hi! foobar' } }
> ```

## 子图持久化

使用子图时，你需要决定其内部数据在多次调用之间如何处理。设想一个将任务委派给专家子智能体的客服机器人：负责「账单」的子智能体应当记住客户之前的问题，还是每次被调用时都从空白开始？

`.compile()` 上的 `checkpointer` 参数控制子图持久化：

| 模式 | `checkpointer=` | 行为 |
| - | - | - |
| [每次调用](#per-invocation-default) | `None`（默认） | 每次调用都从空白开始，并继承父图的检查点写入器，以在单次调用内支持[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)和[持久执行](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)。 |
| [每个线程](#per-thread) | `True` | 状态在同一线程的多次调用之间累积。每次调用都从上次离开的地方继续。 |
| [无状态](#stateless) | `False` | 完全不做检查点——像普通函数调用一样运行。没有中断，也没有持久执行。 |

对于大多数应用来说，每次调用是正确选择，包括由子智能体处理独立请求的[多智能体](https://docs.langchain.com/oss/javascript/langchain/multi-agent.md)系统。当子智能体需要多轮对话记忆时（例如在多次交流中逐步构建上下文的研究助手），请使用每个线程模式。

> [!NOTE]
>
> 父图必须使用检查点写入器编译，子图持久化特性（中断、状态检查、每个线程的记忆）才能正常工作。参见[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)。

> [!NOTE]
>
> 下面的示例使用 LangChain 的 [`create_agent`](https://reference.langchain.com/javascript/langchain/index/createAgent)，这是构建智能体的常见方式。`create_agent` 底层会生成一个 [LangGraph 图](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md)，因此所有子图持久化概念都直接适用。如果你使用原生 LangGraph 的 `StateGraph` 构建，同样的模式和配置选项也适用——详情参见[图 API](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md)。

### 有状态

有状态子图继承父图的检查点写入器，从而启用[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)、[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)和状态检查。两种有状态模式的区别在于状态保留的时长。

#### 每次调用（默认）

> [!TIP]
>
> 这是大多数应用推荐的模式，包括将子智能体作为工具调用的[多智能体](https://docs.langchain.com/oss/javascript/langchain/multi-agent.md)系统。它支持[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)、[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)和并行调用，同时让每次调用保持隔离。

当对子图的每次调用都是独立的、且子智能体无需记住先前调用的任何内容时，请使用每次调用持久化。这是最常见的模式，尤其适用于[多智能体](https://docs.langchain.com/oss/javascript/langchain/multi-agent.md)系统中子智能体处理一次性请求（例如「查询这位客户的订单」或「总结这份文档」）的场景。

省略 `checkpointer` 或将其设为 `None`。每次调用都从空白开始，但在单次调用内部，子图会继承父图的检查点写入器，并可以使用 `interrupt()` 暂停和恢复。

以下示例使用两个子智能体（水果专家、蔬菜专家），并将它们包装为外层智能体的工具：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { createAgent, tool } from "langchain";
import { MemorySaver, Command, interrupt } from "@langchain/langgraph";
import * as z from "zod";

const fruitInfo = tool(
  (input) => `Info about ${input.fruitName}`,
  {
    name: "fruit_info",
    description: "Look up fruit info.",
    schema: z.object({ fruitName: z.string() }),
  }
);

const veggieInfo = tool(
  (input) => `Info about ${input.veggieName}`,
  {
    name: "veggie_info",
    description: "Look up veggie info.",
    schema: z.object({ veggieName: z.string() }),
  }
);

// Subagents - no checkpointer setting (inherits parent)
const fruitAgent = createAgent({
  model: "gpt-5.4-mini",
  tools: [fruitInfo],
  prompt: "You are a fruit expert. Use the fruit_info tool. Respond in one sentence.",
});

const veggieAgent = createAgent({
  model: "gpt-5.4-mini",
  tools: [veggieInfo],
  prompt: "You are a veggie expert. Use the veggie_info tool. Respond in one sentence.",
});

// Wrap subagents as tools for the outer agent
const askFruitExpert = tool(
  async (input) => {
    const response = await fruitAgent.invoke({
      messages: [{ role: "user", content: input.question }],
    });
    return response.messages[response.messages.length - 1].content;
  },
  {
    name: "ask_fruit_expert",
    description: "Ask the fruit expert. Use for ALL fruit questions.",
    schema: z.object({ question: z.string() }),
  }
);

const askVeggieExpert = tool(
  async (input) => {
    const response = await veggieAgent.invoke({
      messages: [{ role: "user", content: input.question }],
    });
    return response.messages[response.messages.length - 1].content;
  },
  {
    name: "ask_veggie_expert",
    description: "Ask the veggie expert. Use for ALL veggie questions.",
    schema: z.object({ question: z.string() }),
  }
);

// Outer agent with checkpointer
const agent = createAgent({
  model: "gpt-5.4-mini",
  tools: [askFruitExpert, askVeggieExpert],
  prompt:
    "You have two experts: ask_fruit_expert and ask_veggie_expert. " +
    "ALWAYS delegate questions to the appropriate expert.",
  checkpointer: new MemorySaver(),
});
```

**中断**

每次调用都可以使用 `interrupt()` 暂停和恢复。在工具函数中添加 `interrupt()`，以便在继续之前要求用户批准：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const fruitInfo = tool(
  (input) => {
    interrupt("continue?");  // [!code highlight]
    return `Info about ${input.fruitName}`;
  },
  {
    name: "fruit_info",
    description: "Look up fruit info.",
    schema: z.object({ fruitName: z.string() }),
  }
);
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };

// Invoke - the subagent's tool calls interrupt()
let response = await agent.invoke(
  { messages: [{ role: "user", content: "Tell me about apples" }] },
  config,
);
// response contains __interrupt__

// Resume - approve the interrupt
response = await agent.invoke(new Command({ resume: true }), config);  // [!code highlight]
// Subagent message count: 4
```

**多轮**

每次调用都以全新的子智能体状态开始。子智能体不会记住之前的调用：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };

// First call
let response = await agent.invoke(
  { messages: [{ role: "user", content: "Tell me about apples" }] },
  config,
);
// Subagent message count: 4

// Second call - subagent starts fresh, no memory of apples
response = await agent.invoke(
  { messages: [{ role: "user", content: "Now tell me about bananas" }] },
  config,
);
// Subagent message count: 4 (still fresh!)
```

**多次调用子图**

对同一子图的多次调用不会冲突，因为每次调用都会获得自己的检查点命名空间：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };

// LLM calls ask_fruit_expert for both apples and bananas
const response = await agent.invoke(
  { messages: [{ role: "user", content: "Tell me about apples and bananas" }] },
  config,
);
// Subagent message count: 4 (apples - fresh)
// Subagent message count: 4 (bananas - fresh)
```

#### 每个线程

当子智能体需要记住先前的交互时，请使用每个线程持久化。例如，在多次交流中逐步构建上下文的研究助手，或跟踪已编辑过哪些文件的编码助手。子智能体的对话历史和数据会在同一线程的多次调用之间累积。每次调用都从上次离开的地方继续。

使用 `checkpointer=True` 编译以启用此行为。

> [!WARNING]
>
> 每个线程的子图**不**支持并行工具调用。当 LLM 可以把每个线程子智能体当作工具使用时，它可能会尝试并行多次调用该工具（例如同时向水果专家询问苹果和香蕉）。这会导致检查点冲突，因为两次调用都写入同一命名空间。
>
> 下面的示例使用 LangChain 的 `ToolCallLimitMiddleware` 来防止这种情况。如果你使用纯 LangGraph 的 `StateGraph` 构建，就需要自己防止并行工具调用——例如通过配置模型禁用并行工具调用，或添加逻辑确保同一子图不会被并行调用多次。

以下示例使用以 `checkpointer=True` 编译的水果专家子智能体：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { createAgent, tool, toolCallLimitMiddleware } from "langchain";
import { MemorySaver, Command, interrupt } from "@langchain/langgraph";
import * as z from "zod";

const fruitInfo = tool(
  (input) => `Info about ${input.fruitName}`,
  {
    name: "fruit_info",
    description: "Look up fruit info.",
    schema: z.object({ fruitName: z.string() }),
  }
);

// Subagent with checkpointer=true for persistent state
const fruitAgent = createAgent({
  model: "gpt-5.4-mini",
  tools: [fruitInfo],
  prompt: "You are a fruit expert. Use the fruit_info tool. Respond in one sentence.",
  checkpointer: true,  // [!code highlight]
});

// Wrap subagent as a tool for the outer agent
const askFruitExpert = tool(
  async (input) => {
    const response = await fruitAgent.invoke({
      messages: [{ role: "user", content: input.question }],
    });
    return response.messages[response.messages.length - 1].content;
  },
  {
    name: "ask_fruit_expert",
    description: "Ask the fruit expert. Use for ALL fruit questions.",
    schema: z.object({ question: z.string() }),
  }
);

// Outer agent with checkpointer
// Use toolCallLimitMiddleware to prevent parallel calls to per-thread subagents,
// which would cause checkpoint conflicts.
const agent = createAgent({
  model: "gpt-5.4-mini",
  tools: [askFruitExpert],
  prompt: "You have a fruit expert. ALWAYS delegate fruit questions to ask_fruit_expert.",
  middleware: [  // [!code highlight]
    toolCallLimitMiddleware({ toolName: "ask_fruit_expert", runLimit: 1 }),  // [!code highlight]
  ],  // [!code highlight]
  checkpointer: new MemorySaver(),
});
```

**中断**

每个线程子智能体与每次调用模式一样支持 `interrupt()`。在工具函数中添加 `interrupt()` 即可要求用户批准：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const fruitInfo = tool(
  (input) => {
    interrupt("continue?");  // [!code highlight]
    return `Info about ${input.fruitName}`;
  },
  {
    name: "fruit_info",
    description: "Look up fruit info.",
    schema: z.object({ fruitName: z.string() }),
  }
);
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };

// Invoke - the subagent's tool calls interrupt()
let response = await agent.invoke(
  { messages: [{ role: "user", content: "Tell me about apples" }] },
  config,
);
// response contains __interrupt__

// Resume - approve the interrupt
response = await agent.invoke(new Command({ resume: true }), config);  // [!code highlight]
// Subagent message count: 4
```

**多轮**

状态在多次调用之间累积——子智能体会记住过去的对话：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };

// First call
let response = await agent.invoke(
  { messages: [{ role: "user", content: "Tell me about apples" }] },
  config,
);
// Subagent message count: 4

// Second call - subagent REMEMBERS apples conversation
response = await agent.invoke(
  { messages: [{ role: "user", content: "Now tell me about bananas" }] },
  config,
);
// Subagent message count: 8 (accumulated!)
```

**多次调用子图**

当你有多个**不同的**每个线程子图时（例如水果专家和蔬菜专家），每一个都需要自己的存储空间，以免它们的检查点互相覆盖。这称为**命名空间隔离**。

如果你[在节点内调用子图](#call-a-subgraph-inside-a-node)，LangGraph 会根据调用顺序（第一次调用、第二次调用等）分配命名空间。这意味着调整调用顺序可能会打乱哪个子图加载哪个状态。为避免这种情况，请将每个子智能体包在各自的 `StateGraph` 中，并使用唯一的节点名称——这样每个子图都能获得稳定、唯一的命名空间：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, MessagesValue, START } from "@langchain/langgraph";

function createSubAgent(model: string, { name, ...kwargs }: { name: string; [key: string]: any }) {
  const agent = createAgent({ model, name, ...kwargs });
  return new StateGraph(new StateSchema({ messages: MessagesValue }))
    .addNode(name, agent)  // unique name → stable namespace  // [!code highlight]
    .addEdge(START, name)
    .compile();
}

const fruitAgent = createSubAgent("gpt-5.4-mini", {
  name: "fruit_agent", tools: [fruitInfo], prompt: "...", checkpointer: true,
});
const veggieAgent = createSubAgent("gpt-5.4-mini", {
  name: "veggie_agent", tools: [veggieInfo], prompt: "...", checkpointer: true,
});
const config = { configurable: { thread_id: "1" } };

// First call - LLM calls both fruit and veggie experts
let response = await agent.invoke(
  { messages: [{ role: "user", content: "Tell me about cherries and broccoli" }] },
  config,
);
// Fruit subagent message count: 4
// Veggie subagent message count: 4

// Second call - both agents accumulate independently
response = await agent.invoke(
  { messages: [{ role: "user", content: "Now tell me about oranges and carrots" }] },
  config,
);
// Fruit subagent message count: 8 (remembers cherries!)
// Veggie subagent message count: 8 (remembers broccoli!)
```

[作为节点添加的](#add-a-subgraph-as-a-node)子图已经自动获得基于名称的命名空间，因此不需要这层包装。

### 无状态

当你希望像普通函数调用一样运行子智能体、不承担任何检查点开销时，请使用此模式。该子图无法暂停/恢复，也不享受[持久执行](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)的好处。使用 `checkpointer=False` 编译。

> [!WARNING]
>
> 没有检查点，子图就没有持久执行能力。如果进程在运行中途崩溃，子图无法恢复，必须从头重新运行。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const subgraphBuilder = new StateGraph(...);
const subgraph = subgraphBuilder.compile({ checkpointer: false });  // [!code highlight]
```

### 检查点写入器参考

使用 `.compile()` 上的 `checkpointer` 参数控制子图持久化：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const subgraph = builder.compile({ checkpointer: false });  // or true, or null
```

| 特性 | 每次调用（默认） | 每个线程 | 无状态 |
| - | - | - | - |
| `checkpointer=` | `None` | `True` | `False` |
| 中断（HITL） | ✅ | ✅ | ❌ |
| 多轮记忆 | ❌ | ✅ | ❌ |
| 多次调用（不同子图） | ✅ | ⚠️（在同一节点内调用多个每个线程子图可能导致命名空间冲突。有可用的变通方案。） | ✅ |
| 多次调用（同一子图） | ✅ | ❌ | ✅ |
| 状态检查 | ⚠️（每次调用持久化下的状态检查仅对当前调用可用（在中断期间）。每次调用都从空白开始，因此调用完成后没有累积状态可检查。） | ✅ | ❌ |

* **中断（HITL）**：子图可以使用 [interrupt()](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md) 暂停执行并等待用户输入，然后从离开处恢复。
* **多轮记忆**：子图在同一[线程](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md#threads)的多次调用之间保留其状态。每次调用都从上次离开处继续，而不是从空白开始。
* **多次调用（不同子图）**：可以在单个节点内调用多个不同的子图实例，而不会产生检查点命名空间冲突。
* **多次调用（同一子图）**：可以在单个节点内多次调用同一个子图实例。在有状态持久化下，这些调用会写入同一检查点命名空间并产生冲突——请改用每次调用持久化。
* **状态检查**：子图状态可通过 `get_state(config, subgraphs=True)` 获取，用于调试和监控。

## 查看子图状态

当你启用[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)后，可以使用 subgraphs 选项检查子图状态。在[无状态](#stateless)检查点（`checkpointer=False`）下，不会保存任何子图检查点，因此子图状态不可用。

> [!NOTE]
>
> 查看子图状态要求 LangGraph 能够**静态发现**子图——即它被[作为节点添加](#add-a-subgraph-as-a-node)或[在节点内调用](#call-a-subgraph-inside-a-node)。当子图在[工具](https://docs.langchain.com/oss/javascript/langchain/tools.md)函数或其他间接层中调用时（例如[子智能体](https://docs.langchain.com/oss/javascript/langchain/multi-agent/subagents.md)模式），该功能不生效。无论嵌套多深，中断仍会传播到顶层图。

**每次调用**

仅返回**当前调用**的子图状态。每次调用都从空白开始。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START, MemorySaver, interrupt, Command } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  foo: z.string(),
});

// Subgraph
const subgraphBuilder = new StateGraph(State)
  .addNode("subgraphNode1", (state) => {
    const value = interrupt("Provide value:");
    return { foo: state.foo + value };
  })
  .addEdge(START, "subgraphNode1");

const subgraph = subgraphBuilder.compile();  // inherits parent checkpointer

// Parent graph
const builder = new StateGraph(State)
  .addNode("node1", subgraph)
  .addEdge(START, "node1");

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });

const config = { configurable: { thread_id: "1" } };

await graph.invoke({ foo: "" }, config);

// View subgraph state for the current invocation
const subgraphState = (await graph.getState(config, { subgraphs: true })).tasks[0].state;  // [!code highlight]

// Resume the subgraph
await graph.invoke(new Command({ resume: "bar" }), config);
```

**每个线程**

返回该线程上所有调用的**累积**子图状态。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, MessagesValue, START, MemorySaver } from "@langchain/langgraph";

// Subgraph with its own persistent state
const SubgraphState = new StateSchema({
  messages: MessagesValue,
});

const subgraphBuilder = new StateGraph(SubgraphState);
// ... add nodes and edges
const subgraph = subgraphBuilder.compile({ checkpointer: true });  // [!code highlight]

// Parent graph
const builder = new StateGraph(SubgraphState)
  .addNode("agent", subgraph)
  .addEdge(START, "agent");

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });

const config = { configurable: { thread_id: "1" } };

await graph.invoke({ messages: [{ role: "user", content: "hi" }] }, config);
await graph.invoke({ messages: [{ role: "user", content: "what did I say?" }] }, config);

// View accumulated subgraph state (includes messages from both invocations)
const subgraphState = (await graph.getState(config, { subgraphs: true })).tasks[0].state;  // [!code highlight]
```

## 流式传输子图输出

要观察嵌套图执行，我们推荐使用[事件流式传输](https://docs.langchain.com/oss/javascript/langgraph/event-streaming.md)：`stream.subgraphs` 投影会发现每个嵌套运行，并暴露其 `path`、`messages` 和 `values`，无需解析命名字符串。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(
  { foo: "foo" },
  {
    subgraphs: true,   // [!code highlight]
    version: "v3",
  }
);
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

1. 设置 `subgraphs: true` 以流式传输来自子图的输出。

> **从子图流式传输**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, START } from "@langchain/langgraph";
> import * as z from "zod";
>
> // Define subgraph
> const SubgraphState = new StateSchema({
>   foo: z.string(),
>   bar: z.string(),
> });
>
> const subgraphBuilder = new StateGraph(SubgraphState)
>   .addNode("subgraphNode1", (state) => {
>     return { bar: "bar" };
>   })
>   .addNode("subgraphNode2", (state) => {
>     // note that this node is using a state key ('bar') that is only available in the subgraph
>     // and is sending update on the shared state key ('foo')
>     return { foo: state.foo + state.bar };
>   })
>   .addEdge(START, "subgraphNode1")
>   .addEdge("subgraphNode1", "subgraphNode2");
>
> const subgraph = subgraphBuilder.compile();
>
> // Define parent graph
> const ParentState = new StateSchema({
>   foo: z.string(),
> });
>
> const builder = new StateGraph(ParentState)
>   .addNode("node1", (state) => {
>     return { foo: "hi! " + state.foo };
>   })
>   .addNode("node2", subgraph)
>   .addEdge(START, "node1")
>   .addEdge("node1", "node2");
>
> const graph = builder.compile();
>
> const stream = await graph.streamEvents(
>   { foo: "foo" },
>   {
>     subgraphs: true,   // [!code highlight]
>     version: "v3",
>   }
> );
> for await (const snapshot of stream.values) {
>   console.log(snapshot);
> }
> ```
>
> 1. 设置 `subgraphs: true` 以流式传输来自子图的输出。
>
> ```
> [[], { node1: { foo: 'hi! foo' } }]
> [['node2:e58e5673-a661-ebb0-70d4-e298a7fc28b7'], { subgraphNode1: { bar: 'bar' } }]
> [['node2:e58e5673-a661-ebb0-70d4-e298a7fc28b7'], { subgraphNode2: { foo: 'hi! foobar' } }]
> [[], { node2: { foo: 'hi! foobar' } }]
> ```

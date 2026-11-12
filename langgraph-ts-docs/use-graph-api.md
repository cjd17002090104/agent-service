> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md

# 使用图 API

本指南演示 LangGraph 图 API 的基础用法。它依次讲解[状态](#define-and-update-state)，以及如何组合常见的图结构，例如[序列](#create-a-sequence-of-steps)、[分支](#create-branches)和[循环](#create-and-control-loops)。它还涵盖 LangGraph 的控制特性，包括用于 map-reduce 工作流的 [Send API](#map-reduce-and-the-send-api)，以及用于把状态更新与跨节点"跳转"结合起来的 [Command API](#combine-control-flow-and-state-updates-with-command)。

## 环境准备

安装 `langgraph`：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install @langchain/langgraph
```

> [!TIP]
>
> **配置 LangSmith 以获得更好的调试体验**
>
> 注册 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-use-graph-api)，即可快速发现问题并提升 LangGraph 项目的性能。LangSmith 让你能够利用追踪数据来调试、测试和监控基于 LangGraph 构建的 LLM 应用——详情请阅读[文档](https://docs.langchain.com/langsmith/observability.md)中的入门说明。

## 定义与更新状态

这里我们展示如何在 LangGraph 中定义和更新[状态](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#state)。我们将演示：

1. 如何使用状态来定义图的[模式](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#schema)
2. 如何使用 [reducer](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers) 来控制状态更新的处理方式。

### 定义状态

LangGraph 中的[状态](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#state)使用 `StateSchema` 类来定义。它提供统一的 API，为各个字段接受[标准模式](https://standardschema.dev/)（如 [Zod](https://zod.dev/)），并支持 `ReducedValue`、`MessagesValue` 和 `UntrackedValue` 之类的特殊值类型。

默认情况下，图具有相同的输入和输出模式，状态决定了该模式。关于如何定义不同的输入和输出模式，参见[定义输入与输出模式](#define-input-and-output-schemas)。

让我们看一个使用[消息](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#working-with-messages-in-graph-state)的简单示例。这是许多 LLM 应用中一种通用灵活的状态表示方式。更多细节参见[概念页面](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#working-with-messages-in-graph-state)。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  extraField: z.number(),
});
```

该状态跟踪一个[消息](https://docs.langchain.com/oss/javascript/langchain/messages.md)对象列表，以及一个额外的整数字段。

### 更新状态

让我们构建一个只含单个节点的示例图。我们的[节点](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#nodes)只是一个 TypeScript 函数，它读取图的状态并对其进行更新。该函数的第一个参数始终是状态：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { AIMessage } from "@langchain/core/messages";
import { GraphNode } from "@langchain/langgraph";

const node: GraphNode<typeof State> = (state) => {
  const messages = state.messages;
  const newMessage = new AIMessage("Hello!");
  return { messages: [newMessage], extraField: 10 };
};
```

该节点只是向我们的消息列表追加一条消息（reducer 负责拼接），并填充一个额外字段。

> [!WARNING]
>
> 节点应直接返回状态更新，而不是直接修改状态本身。

接下来定义一个包含该节点的简单图。我们使用 [`StateGraph`](https://docs.langchain.com/oss/javascript/langgraph/graph-api#stategraph) 定义一个在此状态上运行的图，然后用 [`addNode`](https://docs.langchain.com/oss/javascript/langgraph/graph-api#nodes) 填充图。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph } from "@langchain/langgraph";

const graph = new StateGraph(State)
  .addNode("node", node)
  .addEdge("__start__", "node")
  .compile();
```

LangGraph 提供了内置工具来可视化图。让我们检查一下我们的图。可视化的细节参见[可视化你的图](#visualize-your-graph)。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await graph.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

在这个例子中，我们的图只执行一个节点。让我们进行一次简单的调用：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { HumanMessage } from "@langchain/core/messages";

const result = await graph.invoke({ messages: [new HumanMessage("Hi")], extraField: 0 });
console.log(result);
```

```
{ messages: [HumanMessage { content: 'Hi' }, AIMessage { content: 'Hello!' }], extraField: 10 }
```

注意：

* 我们通过更新状态中的单个键来发起调用。
* 我们在调用结果中收到了完整的状态。

为方便起见，我们经常通过日志查看[消息对象](https://docs.langchain.com/oss/javascript/langchain/messages.md)的内容：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for (const message of result.messages) {
  console.log(`${message.getType()}: ${message.content}`);
}
```

```
human: Hi
ai: Hello!
```

### 用 reducer 处理状态更新

状态中的每个键都可以有自己的独立 [reducer](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers) 函数，它控制来自节点的更新如何被应用。如果没有显式指定 reducer 函数，则假定对该键的所有更新都应覆盖它。

在前面的示例中，我们使用了 `MessagesValue`，它已内置 reducer。对于自定义字段，你可以使用 `ReducedValue` 来定义更新如何被应用。

在之前的示例中，我们的节点通过向 `"messages"` 键追加一条消息来更新它。`MessagesValue` reducer 会自动处理这一点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue, ReducedValue } from "@langchain/langgraph";
import * as z from "zod";

// MessagesValue already has a built-in reducer
const State = new StateSchema({
  messages: MessagesValue,  // [!code highlight]
  extraField: z.number(),
});
```

我们的节点只需返回新消息（reducer 负责拼接）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { GraphNode } from "@langchain/langgraph";

const node: GraphNode<typeof State> = (state) => {
  const newMessage = new AIMessage("Hello!");
  return { messages: [newMessage], extraField: 10 };  // [!code highlight]
};
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START } from "@langchain/langgraph";

const graph = new StateGraph(State)
  .addNode("node", node)
  .addEdge(START, "node")
  .compile();

const result = await graph.invoke({ messages: [new HumanMessage("Hi")] });

for (const message of result.messages) {
  console.log(`${message.getType()}: ${message.content}`);
}
```

```
human: Hi
ai: Hello!
```

#### MessagesValue

在实践中，更新消息列表还有一些额外考虑：

* 我们可能希望更新状态中已有的消息。
* 我们可能希望接受[消息格式](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#using-messages-in-your-graph)的简写，例如 [OpenAI 格式](https://docs.langchain.com/oss/javascript/langchain/messages.md#message-content)。

LangGraph 内置的 `MessagesValue` 会处理这些考虑：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, StateGraph, MessagesValue, GraphNode, START } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({  // [!code highlight]
  messages: MessagesValue,
  extraField: z.number(),
});

const node: GraphNode<typeof State> = (state) => {
  const newMessage = new AIMessage("Hello!");
  return { messages: [newMessage], extraField: 10 };
};

const graph = new StateGraph(State)
  .addNode("node", node)
  .addEdge(START, "node")
  .compile();
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const inputMessage = { role: "user", content: "Hi" };  // [!code highlight]

const result = await graph.invoke({ messages: [inputMessage] });

for (const message of result.messages) {
  console.log(`${message.getType()}: ${message.content}`);
}
```

```
human: Hi
ai: Hello!
```

对于涉及[聊天模型](https://docs.langchain.com/oss/javascript/langchain/models.md)的应用来说，这是一种通用灵活的状态表示。为方便起见，LangGraph 包含了预置的 `MessagesValue`，因此我们可以这样写：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  extraField: z.number(),
});
```

### 用 `Overwrite` 绕过 reducer

在某些情况下，你可能想绕过 reducer，直接覆盖某个状态值。为此 LangGraph 提供了 `Overwrite` 类型。当节点返回用 `Overwrite` 包装的值时，reducer 会被绕过，该通道会被直接设置为该值。

当你希望重置或替换累积的状态（而不是与已有值合并）时，这很有用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  END,
  Overwrite,
  ReducedValue,
  START,
  StateGraph,
  StateSchema,
} from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  messages: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      reducer: (current: string[], update: string[]) => current.concat(update),
    },
  ),
});

const addMessage = () => {
  return { messages: ["first message"] };
};

const replaceMessages = () => {
  // Bypass the reducer and replace the entire messages list
  return { messages: new Overwrite(["replacement message"]) };
};

const graph = new StateGraph(State)
  .addNode("add_message", addMessage)
  .addNode("replace_messages", replaceMessages)
  .addEdge(START, "add_message")
  .addEdge("add_message", "replace_messages")
  .addEdge("replace_messages", END)
  .compile();

const result = await graph.invoke({ messages: ["initial"] });
console.log(result.messages);
```

```
["replacement message"]
```

你也可以使用带有特殊键 `"__overwrite__"` 的 JSON 格式：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const replaceMessages = () => {
  return { messages: { __overwrite__: ["replacement message"] } };
};
```

> [!WARNING]
>
> 当节点并行执行时，在同一个超步中只能有一个节点对同一个状态键使用 `Overwrite`。如果多个节点在同一超步中尝试覆盖同一个键，会抛出 `InvalidUpdateError`。

### 定义输入与输出模式

默认情况下，`StateGraph` 使用单一模式运行，所有节点都应通过该模式通信。不过，也可以为图定义不同的输入和输出模式。

当指定了不同的模式时，节点之间仍会使用一个内部模式进行通信。输入模式确保所提供的输入符合预期结构，而输出模式则按定义的输出模式过滤内部数据，只返回相关信息。

下面我们看看如何定义不同的输入和输出模式。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, START, END } from "@langchain/langgraph";
import * as z from "zod";

// Define the schema for the input
const InputState = new StateSchema({
  question: z.string(),
});

// Define the schema for the output
const OutputState = new StateSchema({
  answer: z.string(),
});

// Define the overall schema, combining both input and output
const OverallState = new StateSchema({
  question: z.string(),
  answer: z.string(),
});

// Define the node that processes the input
const answerNode: GraphNode<typeof OverallState> = (state) => {
  // Example answer and an extra key
  return { answer: "bye", question: state.question };
};

// Build the graph with input and output schemas specified
const graph = new StateGraph({
  input: InputState,
  output: OutputState,
  state: OverallState,
})
  .addNode("answerNode", answerNode)
  .addEdge(START, "answerNode")
  .addEdge("answerNode", END)
  .compile();

// Invoke the graph with an input and print the result
console.log(await graph.invoke({ question: "hi" }));
```

```
{ answer: 'bye' }
```

注意，`invoke` 的输出只包含输出模式。

### 在节点之间传递私有状态

在某些情况下，你可能希望节点之间交换对中间逻辑至关重要、但不需要成为图主模式一部分的信息。这些私有数据与图的整体输入/输出无关，只应在特定节点之间共享。

下面我们将创建一个示例顺序图，由三个节点（node\_1、node\_2 和 node\_3）组成，其中私有数据在前两步（node\_1 和 node\_2）之间传递，而第三步（node\_3）只能访问公共的整体状态。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, START, END } from "@langchain/langgraph";
import * as z from "zod";

// The overall state of the graph (this is the public state shared across nodes)
const OverallState = new StateSchema({
  a: z.string(),
});

// Output from node1 contains private data that is not part of the overall state
const Node1Output = new StateSchema({
  privateData: z.string(),
});

// Node 2 input only requests the private data available after node1
const Node2Input = new StateSchema({
  privateData: z.string(),
});

// The private data is only shared between node1 and node2
const node1: GraphNode<typeof OverallState> = (state) => {
  const output = { privateData: "set by node1" };
  console.log(`Entered node 'node1':\n\tInput: ${JSON.stringify(state)}.\n\tReturned: ${JSON.stringify(output)}`);
  return output;
};

const node2: GraphNode<typeof Node2Input> = (state) => {
  const output = { a: "set by node2" };
  console.log(`Entered node 'node2':\n\tInput: ${JSON.stringify(state)}.\n\tReturned: ${JSON.stringify(output)}`);
  return output;
};

// Node 3 only has access to the overall state (no access to private data from node1)
const node3: GraphNode<typeof OverallState> = (state) => {
  const output = { a: "set by node3" };
  console.log(`Entered node 'node3':\n\tInput: ${JSON.stringify(state)}.\n\tReturned: ${JSON.stringify(output)}`);
  return output;
};

// Connect nodes in a sequence
// node2 accepts private data from node1, whereas
// node3 does not see the private data.
const graph = new StateGraph(OverallState)
  .addNode("node1", node1)
  .addNode("node2", node2, { input: Node2Input })
  .addNode("node3", node3)
  .addEdge(START, "node1")
  .addEdge("node1", "node2")
  .addEdge("node2", "node3")
  .addEdge("node3", END)
  .compile();

// Invoke the graph with the initial state
const response = await graph.invoke({ a: "set at start" });

console.log(`\nOutput of graph invocation: ${JSON.stringify(response)}`);
```

```
Entered node 'node1':
	Input: {"a":"set at start"}.
	Returned: {"privateData":"set by node1"}
Entered node 'node2':
	Input: {"privateData":"set by node1"}.
	Returned: {"a":"set by node2"}
Entered node 'node3':
	Input: {"a":"set by node2"}.
	Returned: {"a":"set by node3"}

Output of graph invocation: {"a":"set by node3"}
```

### 其他状态定义方式

虽然 `StateSchema` 是定义状态的推荐方式，但 LangGraph 还支持其他几种方法。本节涵盖所有可用选项。

#### 通道 API

通道 API 提供对状态管理的底层控制。LangGraph 提供几种内置通道类型：

| 通道类型 | 行为 | 使用场景 |
| - | - | - |
| `LastValue` | 存储最近的值 | 会被覆盖的简单字段 |
| `BinaryOperatorAggregate` | 使用 reducer 函数组合值 | 累积值（计数器、列表） |
| `Topic` | 将所有值收集为一个序列 | 事件流、审计日志 |
| `EphemeralValue` | 在超步之间重置的值 | 临时计算状态 |

**使用对象简写：**

当你传入含 `reducer` 和 `default` 的对象时，会创建一个 `BinaryOperatorAggregate` 通道。传入 `null` 会创建一个 `LastValue` 通道：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { BaseMessage } from "@langchain/core/messages";
import { StateGraph } from "@langchain/langgraph";

interface WorkflowState {
  messages: BaseMessage[];
  question: string;
  answer: string;
}

const workflow = new StateGraph<WorkflowState>({
  channels: {
    // BinaryOperatorAggregate: combines values with a reducer
    messages: {
      reducer: (current, update) => current.concat(update),
      default: () => [],
    },
    // LastValue: stores the most recent value (null = no reducer)
    question: null,
    answer: null,
  },
});
```

**直接使用通道类：**

为了获得更多控制，你可以直接实例化通道类：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { BaseMessage } from "@langchain/core/messages";
import { StateGraph, LastValue, BinaryOperatorAggregate, Topic } from "@langchain/langgraph";

interface WorkflowState {
  messages: BaseMessage[];
  question: string;
  events: string[];
}

const workflow = new StateGraph<WorkflowState>({
  channels: {
    messages: new BinaryOperatorAggregate<BaseMessage[]>(
      (current, update) => current.concat(update),
      () => []
    ),
    question: new LastValue<string>(),
    // Topic collects all values pushed during execution
    events: new Topic<string>(),
  },
});
```

#### Annotation.Root

`Annotation.Root` 提供了一种声明式的方式来定义带 reducer 的状态。它类似于 `StateSchema`，但语法不同：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { BaseMessage } from "@langchain/core/messages";
import { Annotation, StateGraph, messagesStateReducer } from "@langchain/langgraph";

const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  question: Annotation<string>(),
  count: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
});

const graph = new StateGraph(State);
```

#### 使用 Zod v3 的 Zod 对象

使用 Zod v3 时，你可以用普通的 `z.object()` 模式定义状态。LangGraph 为 Zod v3 扩展了 `.langgraph` 插件，提供 `.reducer()` 和 `.metadata()` 方法：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { z } from "zod/v3";
import { BaseMessage } from "@langchain/core/messages";
import { StateGraph, messagesStateReducer } from "@langchain/langgraph";

const State = z.object({
  // Use .langgraph.reducer() to attach a reducer function
  messages: z
    .array(z.custom<BaseMessage>())
    .default([])
    .langgraph.reducer(messagesStateReducer),
  // Simple fields work directly (last-write-wins)
  question: z.string().optional(),
  answer: z.string().optional(),
  // Custom reducer for accumulating values
  count: z
    .number()
    .default(0)
    .langgraph.reducer((current, update) => current + update),
});

const graph = new StateGraph(State);
```

#### 使用 Zod v4 的 Zod 对象

Zod v4 使用基于注册表的方案。使用 LangGraph 注册表为模式字段附加元数据：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { BaseMessage } from "@langchain/core/messages";
import { StateGraph, MessagesZodMeta, messagesStateReducer } from "@langchain/langgraph";
import { registry } from "@langchain/langgraph/zod";

const State = z.object({
  // Use .register() with the LangGraph registry and MessagesZodMeta
  messages: z
    .array(z.custom<BaseMessage>())
    .default([])
    .register(registry, MessagesZodMeta),
  // Simple fields work directly (last-write-wins)
  question: z.string().optional(),
  answer: z.string().optional(),
  // Custom reducer via registry metadata
  count: z
    .number()
    .default(0)
    .register(registry, { reducer: (current: number, update: number) => current + update }),
});

const graph = new StateGraph(State);
```

#### 对比表

| 方式 | reducer | 类型安全 | Zod 版本 | 是否推荐 |
| - | - | - | - | - |
| `StateSchema` | ✅ 内置 | ✅ 完整 | v3 或 v4 | ✅ 是 |
| 通道 API | ✅ 手动 | ⚠️ 部分 | 不适用 | 适用高级场景 |
| `Annotation.Root` | ✅ 内置 | ✅ 完整 | 不适用 | 遗留方式 |
| Zod v3 + `.langgraph` | ✅ 通过插件 | ✅ 完整 | 仅 v3 | 遗留方式 |
| Zod v4 + 注册表 | ✅ 通过注册表 | ✅ 完整 | 仅 v4 | 遗留方式 |

## 添加运行时配置

有时你希望在调用图时能够对其进行配置。例如，你可能希望在运行时指定使用哪个 LLM 或系统提示词，*而又不想用这些参数污染图状态*。

要添加运行时配置：

1. 为你的配置指定一个模式
2. 把该配置添加到节点或条件边的函数签名中
3. 把配置传入图。

参见下面的简单示例：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, END, START } from "@langchain/langgraph";
import * as z from "zod";

// 1. Specify config schema
const ContextSchema = z.object({
  myRuntimeValue: z.string(),
});

// 2. Define a graph that accesses the config in a node
const State = new StateSchema({
  myStateValue: z.number(),
});

const node: GraphNode<typeof State> = (state, runtime) => {
  if (runtime?.context?.myRuntimeValue === "a") {  // [!code highlight]
    return { myStateValue: 1 };
  } else if (runtime?.context?.myRuntimeValue === "b") {  // [!code highlight]
    return { myStateValue: 2 };
  } else {
    throw new Error("Unknown values.");
  }
};

const graph = new StateGraph(State, ContextSchema)
  .addNode("node", node)
  .addEdge(START, "node")
  .addEdge("node", END)
  .compile();

// 3. Pass in configuration at runtime:
console.log(await graph.invoke({}, { context: { myRuntimeValue: "a" } }));  // [!code highlight]
console.log(await graph.invoke({}, { context: { myRuntimeValue: "b" } }));  // [!code highlight]
```

```
{ myStateValue: 1 }
{ myStateValue: 2 }
```

> **扩展示例：在运行时指定 LLM**
>
> 下面演示一个实用示例：我们在运行时配置使用哪个 LLM。我们将同时使用 OpenAI 和 Anthropic 模型。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatOpenAI } from "@langchain/openai";
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, END } from "@langchain/langgraph";
> import * as z from "zod";
>
> const ConfigSchema = z.object({
>   modelProvider: z.string().default("anthropic"),
> });
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const MODELS = {
>   anthropic: new ChatAnthropic({ model: "claude-haiku-4-5-20251001" }),
>   openai: new ChatOpenAI({ model: "gpt-5.4-mini" }),
> };
>
> const callModel: GraphNode<typeof State> = async (state, config) => {
>   const modelProvider = config?.configurable?.modelProvider || "anthropic";
>   const model = MODELS[modelProvider as keyof typeof MODELS];
>   const response = await model.invoke(state.messages);
>   return { messages: [response] };
> };
>
> const graph = new StateGraph(State, ConfigSchema)
>   .addNode("model", callModel)
>   .addEdge(START, "model")
>   .addEdge("model", END)
>   .compile();
>
> // Usage
> const inputMessage = { role: "user", content: "hi" };
> // With no configuration, uses default (Anthropic)
> const response1 = await graph.invoke({ messages: [inputMessage] });
> // Or, can set OpenAI
> const response2 = await graph.invoke(
>   { messages: [inputMessage] },
>   { configurable: { modelProvider: "openai" } },
> );
>
> console.log(response1.messages.at(-1)?.response_metadata?.model);
> console.log(response2.messages.at(-1)?.response_metadata?.model);
> ```
>
> ```
> claude-haiku-4-5-20251001
> gpt-5.4-mini
> ```

> **扩展示例：在运行时指定模型和系统消息**
>
> 下面演示一个实用示例：我们在运行时配置两个参数：要使用的 LLM 和系统消息。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatOpenAI } from "@langchain/openai";
> import { ChatAnthropic } from "@langchain/anthropic";
> import { SystemMessage } from "@langchain/core/messages";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, END } from "@langchain/langgraph";
> import * as z from "zod";
>
> const ConfigSchema = z.object({
>   modelProvider: z.string().default("anthropic"),
>   systemMessage: z.string().optional(),
> });
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const MODELS = {
>   anthropic: new ChatAnthropic({ model: "claude-haiku-4-5-20251001" }),
>   openai: new ChatOpenAI({ model: "gpt-5.4-mini" }),
> };
>
> const callModel: GraphNode<typeof State> = async (state, config) => {
>   const modelProvider = config?.configurable?.modelProvider || "anthropic";
>   const systemMessage = config?.configurable?.systemMessage;
>
>   const model = MODELS[modelProvider as keyof typeof MODELS];
>   let messages = state.messages;
>
>   if (systemMessage) {
>     messages = [new SystemMessage(systemMessage), ...messages];
>   }
>
>   const response = await model.invoke(messages);
>   return { messages: [response] };
> };
>
> const graph = new StateGraph(State, ConfigSchema)
>   .addNode("model", callModel)
>   .addEdge(START, "model")
>   .addEdge("model", END)
>   .compile();
>
> // Usage
> const inputMessage = { role: "user", content: "hi" };
> const response = await graph.invoke(
>   { messages: [inputMessage] },
>   {
>     configurable: {
>       modelProvider: "openai",
>       systemMessage: "Respond in Italian."
>     }
>   }
> );
>
> for (const message of response.messages) {
>   console.log(`${message.getType()}: ${message.content}`);
> }
> ```
>
> ```
> human: hi
> ai: Ciao! Come posso aiutarti oggi?
> ```

## 添加重试策略

在许多场景中，你可能希望为节点设置自定义重试策略，例如在调用 API、查询数据库或调用 LLM 时。LangGraph 允许你为节点添加重试策略。

要配置重试策略，请把 `retryPolicy` 参数传给 [`addNode`](https://reference.langchain.com/javascript/langchain-langgraph/index/Graph)。`retryPolicy` 参数接受一个 `RetryPolicy` 对象。下面我们使用默认参数实例化一个 `RetryPolicy` 对象，并将其关联到一个节点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { RetryPolicy } from "@langchain/langgraph";

const graph = new StateGraph(State)
  .addNode("nodeName", nodeFunction, { retryPolicy: {} })
  .compile();
```

默认情况下，重试策略会对除以下异常之外的任何异常进行重试：

* `TypeError`
* `SyntaxError`
* `ReferenceError`

> **扩展示例：自定义重试策略**
>
> 考虑一个从 SQL 数据库读取数据的例子。下面我们向节点传入两种不同的重试策略：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import Database from "better-sqlite3";
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, END } from "@langchain/langgraph";
> import { AIMessage } from "@langchain/core/messages";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> // Create an in-memory database
> const db: typeof Database.prototype = new Database(":memory:");
>
> const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });
>
> const callModel: GraphNode<typeof State> = async (state) => {
>   const response = await model.invoke(state.messages);
>   return { messages: [response] };
> };
>
> const queryDatabase: GraphNode<typeof State> = async (state) => {
>   const queryResult: string = JSON.stringify(
>     db.prepare("SELECT * FROM Artist LIMIT 10;").all(),
>   );
>
>   return { messages: [new AIMessage({ content: "queryResult" })] };
> };
>
> const workflow = new StateGraph(State)
>   // Define the two nodes we will cycle between
>   .addNode("call_model", callModel, { retryPolicy: { maxAttempts: 5 } })
>   .addNode("query_database", queryDatabase, {
>     retryPolicy: {
>       retryOn: (e: any): boolean => {
>         if (e instanceof Database.SqliteError) {
>           // Retry on "SQLITE_BUSY" error
>           return e.code === "SQLITE_BUSY";
>         }
>         return false; // Don't retry on other errors
>       },
>     },
>   })
>   .addEdge(START, "call_model")
>   .addEdge("call_model", "query_database")
>   .addEdge("query_database", END);
>
> const graph = workflow.compile();
> ```

### 在节点内访问执行信息

你可以通过 `runtime.executionInfo` 访问执行身份和重试信息。它会暴露线程、运行和检查点标识符以及重试状态，无需直接从 `config` 读取。

| 属性 | 类型 | 描述 |
| - | - | - |
| `threadId` | `string \| undefined` | 当前执行的线程 ID。 |
| `runId` | `string \| undefined` | 当前运行的运行 ID。 |
| `checkpointId` | `string` | 当前执行的检查点 ID。 |
| `checkpointNs` | `string` | 当前执行的检查点命名空间。 |
| `taskId` | `string` | 当前执行的任务 ID。 |
| `nodeAttempt` | `number` | 当前执行尝试次数（从 1 开始）。 |
| `nodeFirstAttemptTime` | `number \| undefined` | 首次尝试开始时的 Unix 时间戳（秒）。在重试之间保持不变。 |

#### 访问线程 ID 和运行 ID

使用 `executionInfo` 在节点内访问线程 ID、运行 ID 以及其他身份字段：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  result: z.string(),
});

const myNode: GraphNode<typeof State> = async (state, runtime) => {
  const info = runtime.executionInfo;
  console.log(`Thread: ${info.threadId}, Run: ${info.runId}`);  // [!code highlight]
  return { result: "done" };
};

const graph = new StateGraph(State)
  .addNode("my_node", myNode)
  .addEdge(START, "my_node")
  .addEdge("my_node", END)
  .compile();
```

#### 根据重试状态调整行为

当节点带有重试策略时，使用 `executionInfo` 检查当前尝试次数，并在首次尝试失败后切换到备用方案：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  result: z.string(),
});

const myNode: GraphNode<typeof State> = async (state, runtime) => {
  const info = runtime.executionInfo;
  if (info.nodeAttempt > 1) {  // [!code highlight]
    // use a fallback on retries
    return { result: await callFallbackApi() };
  }
  return { result: await callPrimaryApi() };
};

const graph = new StateGraph(State)
  .addNode("my_node", myNode, { retryPolicy: { maxAttempts: 3 } })
  .addEdge(START, "my_node")
  .addEdge("my_node", END)
  .compile();
```

即使没有重试策略，`Runtime` 对象上也可以使用 `executionInfo`——`nodeAttempt` 默认为 `1`，`nodeFirstAttemptTime` 被设置为节点开始执行的时间。

### 在节点内访问服务器信息

当你的图运行在 LangGraph Server 上时，可以通过 `runtime.serverInfo` 访问服务器特定的元数据。

| 属性 | 类型 | 描述 |
| - | - | - |
| `assistantId` | `string` | 当前部署的 assistant ID。 |
| `graphId` | `string` | 当前部署的图 ID。 |
| `user` | `BaseUser \| null` | 已认证用户（如果配置了[自定义认证](https://docs.langchain.com/langsmith/custom-auth.md)）。 |

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const myNode: GraphNode<typeof State> = async (state, runtime) => {
  const server = runtime.serverInfo;
  if (server != null) {
    console.log(`Assistant: ${server.assistantId}, Graph: ${server.graphId}`);  // [!code highlight]
    if (server.user != null) {
      console.log(`User: ${server.user.identity}`);
    }
  }
  return { result: "done" };
};
```

当图未运行在 LangGraph Server 上时，`serverInfo` 为 `null`。

> [!NOTE]
>
> `runtime.executionInfo` 和 `runtime.serverInfo` 需要 `deepagents>=1.9.0`（或 `@langchain/langgraph>=1.2.8`）。

## 创建步骤序列

> [!NOTE]
>
> **前置条件**
> 本指南假定你已熟悉上文关于[状态](#define-and-update-state)的章节。

这里我们演示如何构建一个简单的步骤序列。我们将展示：

1. 如何构建顺序图
2. 用于构造类似图的内置简写方式。

要添加一串节点，我们使用[图](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#stategraph)的 `.addNode` 和 `.addEdge` 方法：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START, StateGraph } from "@langchain/langgraph";

const builder = new StateGraph(State)
  .addNode("step1", step1)
  .addNode("step2", step2)
  .addNode("step3", step3)
  .addEdge(START, "step1")
  .addEdge("step1", "step2")
  .addEdge("step2", "step3");
```

> **为什么要把应用步骤拆成 LangGraph 中的序列？**
>
> LangGraph 让你可以轻松地为应用添加底层持久化层。
> 这使得状态可以在节点执行之间被写入检查点，因此你的 LangGraph 节点决定了：
>
> * 状态更新如何被[写入检查点](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)
> * [人机回环](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)工作流中的中断如何被恢复
> * 我们如何利用 LangGraph 的[时间旅行](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md)功能"倒回"并分叉执行
>
> 它们还决定了执行步骤如何被[流式传输](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)，以及你的应用如何通过 [Studio](https://docs.langchain.com/langsmith/studio.md) 进行可视化与调试。
>
> 让我们演示一个端到端示例。我们将创建一个包含三个步骤的序列：
>
> 1. 在状态的某个键中填入一个值
> 2. 更新同一个值
> 3. 填入另一个值
>
> 首先定义我们的[状态](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#state)。它决定[图的模式](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#schema)，也可以指定如何应用更新。详情参见[用 reducer 处理状态更新](#process-state-updates-with-reducers)。
>
> 在我们的例子中，只跟踪两个值：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateSchema, GraphNode } from "@langchain/langgraph";
> import * as z from "zod";
>
> const State = new StateSchema({
>   value1: z.string(),
>   value2: z.number(),
> });
> ```
>
> 我们的[节点](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#nodes)只是读取图状态并对其进行更新的 TypeScript 函数。该函数的第一个参数始终是状态：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> const step1: GraphNode<typeof State> = (state) => {
>   return { value1: "a" };
> };
>
> const step2: GraphNode<typeof State> = (state) => {
>   const currentValue1 = state.value1;
>   return { value1: `${currentValue1} b` };
> };
>
> const step3: GraphNode<typeof State> = (state) => {
>   return { value2: 10 };
> };
> ```
>
> > [!NOTE]
> >
> > 注意，在向状态发出更新时，每个节点只需指定它想更新的键的值。
> >
> > 默认情况下，这会**覆盖**对应键的值。你也可以使用 [reducer](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers) 来控制更新如何被处理——例如，你可以改为向某个键连续追加更新。详情参见[用 reducer 处理状态更新](#process-state-updates-with-reducers)。
>
> 最后，我们定义图。我们使用 [StateGraph](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#stategraph) 定义一个在此状态上运行的图。
>
> 然后使用 [addNode](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#nodes) 和 [addEdge](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#edges) 填充图并定义其控制流。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { START, StateGraph } from "@langchain/langgraph";
>
> const graph = new StateGraph(State)
>   .addNode("step1", step1)
>   .addNode("step2", step2)
>   .addNode("step3", step3)
>   .addEdge(START, "step1")
>   .addEdge("step1", "step2")
>   .addEdge("step2", "step3")
>   .compile();
> ```
>
> > [!TIP]
> >
> > **指定自定义名称**
> > 你可以使用 `.addNode` 为节点指定自定义名称：
> >
> > ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> > const graph = new StateGraph(State)
> > .addNode("myNode", step1)
> > .compile();
> > ```
>
> 注意：
>
> * `.addEdge` 接受节点名称，对于函数来说默认为 `node.name`。
> * 我们必须指定图的入口点。为此，我们添加一条指向 [START 节点](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#start-node)的边。
> * 当没有更多节点需要执行时，图会停止。
>
> 接下来我们[编译](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#compiling-your-graph)图。这会对图的结构提供一些基础检查（例如识别孤立节点）。如果我们通过[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)为应用添加持久化，它也会在这里被传入。
>
> LangGraph 提供了内置工具来可视化图。让我们检查一下我们的序列。可视化的细节参见[可视化你的图](#visualize-your-graph)。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import * as fs from "node:fs/promises";
>
> const drawableGraph = await graph.getGraphAsync();
> const image = await drawableGraph.drawMermaidPng();
> const imageBuffer = new Uint8Array(await image.arrayBuffer());
>
> await fs.writeFile("graph.png", imageBuffer);
> ```
>
> 让我们进行一次简单的调用：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> const result = await graph.invoke({ value1: "c" });
> console.log(result);
> ```
>
> ```
> { value1: 'a b', value2: 10 }
> ```
>
> 注意：
>
> * 我们通过为单个状态键提供一个值来发起调用。我们必须始终至少为一个键提供值。
> * 我们传入的值被第一个节点覆盖了。
> * 第二个节点更新了该值。
> * 第三个节点填充了另一个值。

## 创建分支

节点的并行执行对于加速整体图操作至关重要。LangGraph 原生支持节点并行执行，可以显著提升基于图的工作流性能。这种并行化通过扇出（fan-out）和扇入（fan-in）机制实现，并同时利用标准边和[条件边](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addConditionalEdges)。下面是一些示例，展示如何添加适合你的分支数据流。

### 并行运行图节点

在这个例子中，我们从 `Node A` 扇出到 `B 和 C`，然后扇入到 `D`。在我们的状态中，[我们指定了相加的 reducer 操作](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers)。这会为 State 中的特定键组合或累积值，而不是简单地覆盖已有值。对于列表而言，这意味着把新列表与已有列表拼接。关于用 reducer 更新状态的更多细节，参见上文关于[状态 reducer](#process-state-updates-with-reducers)的章节。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, GraphNode, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  // The reducer makes this append-only
  aggregate: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
});

const nodeA: GraphNode<typeof State> = (state) => {
  console.log(`Adding "A" to ${state.aggregate}`);
  return { aggregate: ["A"] };
};

const nodeB: GraphNode<typeof State> = (state) => {
  console.log(`Adding "B" to ${state.aggregate}`);
  return { aggregate: ["B"] };
};

const nodeC: GraphNode<typeof State> = (state) => {
  console.log(`Adding "C" to ${state.aggregate}`);
  return { aggregate: ["C"] };
};

const nodeD: GraphNode<typeof State> = (state) => {
  console.log(`Adding "D" to ${state.aggregate}`);
  return { aggregate: ["D"] };
};

const graph = new StateGraph(State)
  .addNode("a", nodeA)
  .addNode("b", nodeB)
  .addNode("c", nodeC)
  .addNode("d", nodeD)
  .addEdge(START, "a")
  .addEdge("a", "b")
  .addEdge("a", "c")
  .addEdge("b", "d")
  .addEdge("c", "d")
  .addEdge("d", END)
  .compile();
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await graph.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

使用 reducer 后，你可以看到每个节点中添加的值都被累积起来。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await graph.invoke({
  aggregate: [],
});
console.log(result);
```

```
Adding "A" to []
Adding "B" to ['A']
Adding "C" to ['A']
Adding "D" to ['A', 'B', 'C']
{ aggregate: ['A', 'B', 'C', 'D'] }
```

> [!NOTE]
>
> 在上面的例子中，节点 `"b"` 和 `"c"` 在同一个[超步](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graphs)中并发执行。由于它们处于同一步，节点 `"d"` 会在 `"b"` 和 `"c"` 都完成后才执行。
>
> 重要的是，来自并行超步的更新可能不会以一致的顺序排列。如果你需要来自并行超步的更新具有一致的、预先确定的顺序，应把输出写入状态中的独立字段，并附带一个用于排序的值。

> **异常处理？**
>
> LangGraph 在[超步](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graphs)内执行节点，这意味着虽然并行分支是并行执行的，但整个超步是**事务性的**。如果其中任何分支抛出异常，**没有任何**更新会被应用到状态（整个超步报错）。
>
> 重要的是，使用[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)时，超步内成功节点的结果会被保存，恢复时不会重复执行。
>
> 如果你有容易出错的代码（也许想处理不稳定的 API 调用），LangGraph 提供两种应对方式：
>
> 1. 你可以在节点内编写普通代码来捕获并处理异常。
> 2. 你可以设置 **[`RetryPolicy`](https://reference.langchain.com/python/langgraph/types)**，指示图对抛出特定类型异常的节点进行重试。只有失败的分支会被重试，因此不必担心重复劳动。
>
> 两者结合起来，让你能够执行并行操作并完全控制异常处理。

> [!TIP]
>
> **设置最大并发数**
> 你可以在调用图时通过[配置](https://reference.langchain.com/javascript/langchain-langgraph/index/LangGraphRunnableConfig)中的 `maxConcurrency` 控制并发任务的最大数量。`maxConcurrency` 是一个独立的配置键，因此应设置在配置的顶层，而不是 `configurable` 内部。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> const result = await graph.invoke({ value1: "c" }, { maxConcurrency: 10 });
> ```

### 条件分支

如果你的扇出需要在运行时根据状态变化，可以使用 [`addConditionalEdges`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) 通过图状态选择一个或多个路径。参见下面的示例，其中节点 `a` 生成的状态更新决定了后续节点。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, GraphNode, ConditionalEdgeRouter, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  aggregate: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
  // Add a key to the state. We will set this key to determine
  // how we branch.
  which: z.string(),  // [!code highlight]
});

const nodeA: GraphNode<typeof State> = (state) => {
  console.log(`Adding "A" to ${state.aggregate}`);
  return { aggregate: ["A"], which: "c" };
};

const nodeB: GraphNode<typeof State> = (state) => {
  console.log(`Adding "B" to ${state.aggregate}`);
  return { aggregate: ["B"] };
};

const nodeC: GraphNode<typeof State> = (state) => {
  console.log(`Adding "C" to ${state.aggregate}`);
  return { aggregate: ["C"] };  // [!code highlight]
};

const conditionalEdge: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "b" | "c" }> = (state) => {
  // Fill in arbitrary logic here that uses the state
  // to determine the next node
  return state.which as "b" | "c";
};

const graph = new StateGraph(State)
  .addNode("a", nodeA)
  .addNode("b", nodeB)
  .addNode("c", nodeC)
  .addEdge(START, "a")
  .addEdge("b", END)
  .addEdge("c", END)
  .addConditionalEdges("a", conditionalEdge)
  .compile();
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await graph.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await graph.invoke({ aggregate: [] });
console.log(result);
```

```
Adding "A" to []
Adding "C" to ['A']
{ aggregate: ['A', 'C'], which: 'c' }
```

> [!TIP]
>
> 你的条件边可以路由到多个目标节点。例如：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> const routeBcOrCd: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "b" | "c" | "d" }> = (state) => {
>   if (state.which === "cd") {
>     return ["c", "d"];
>   }
>   return ["b", "c"];
> };
> ```

## Map-Reduce 与 Send API

LangGraph 通过 Send API 支持 map-reduce 以及其他高级分支模式。以下是如何使用它的示例：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, GraphNode, START, END, Send } from "@langchain/langgraph";
import * as z from "zod";

const OverallState = new StateSchema({
  topic: z.string(),
  subjects: z.array(z.string()),
  jokes: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
  bestSelectedJoke: z.string(),
});

const generateTopics: GraphNode<typeof OverallState> = (state) => {
  return { subjects: ["lions", "elephants", "penguins"] };
};

const generateJoke: GraphNode<typeof OverallState> = (state) => {
  const jokeMap: Record<string, string> = {
    lions: "Why don't lions like fast food? Because they can't catch it!",
    elephants: "Why don't elephants use computers? They're afraid of the mouse!",
    penguins: "Why don't penguins like talking to strangers at parties? Because they find it hard to break the ice."
  };
  return { jokes: [jokeMap[state.subject]] };
};

const continueToJokes: ConditionalEdgeRouter<{ InputSchema: typeof OverallState; Nodes: "generateJoke" }> = (state) => {
  return state.subjects.map((subject) => new Send("generateJoke", { subject }));
};

const bestJoke: GraphNode<typeof OverallState> = (state) => {
  return { bestSelectedJoke: "penguins" };
};

const graph = new StateGraph(OverallState)
  .addNode("generateTopics", generateTopics)
  .addNode("generateJoke", generateJoke)
  .addNode("bestJoke", bestJoke)
  .addEdge(START, "generateTopics")
  .addConditionalEdges("generateTopics", continueToJokes)
  .addEdge("generateJoke", "bestJoke")
  .addEdge("bestJoke", END)
  .compile();
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await graph.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Call the graph: here we call it to generate a list of jokes
const stream = await graph.streamEvents({ topic: "animals" }, { version: "v3" });
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

```
{ generateTopics: { subjects: [ 'lions', 'elephants', 'penguins' ] } }
{ generateJoke: { jokes: [ "Why don't lions like fast food? Because they can't catch it!" ] } }
{ generateJoke: { jokes: [ "Why don't elephants use computers? They're afraid of the mouse!" ] } }
{ generateJoke: { jokes: [ "Why don't penguins like talking to strangers at parties? Because they find it hard to break the ice." ] } }
{ bestJoke: { bestSelectedJoke: 'penguins' } }
```

## 创建与控制循环

在创建带循环的图时，我们需要一种终止执行的机制。最常见的做法是添加一条[条件边](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#conditional-edges)，在达到某个终止条件后路由到 [END](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#end-node) 节点。

你也可以在调用或流式传输图时设置图递归上限。递归上限设置图在抛出错误之前允许执行的[超步](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graphs)数量。了解更多关于[递归上限概念](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#recursion-limit)的内容。

让我们考虑一个带循环的简单图，以便更好地理解这些机制如何工作。

> [!TIP]
>
> 要返回状态的最后一个值而不是收到递归上限错误，参见[下一节](#impose-a-recursion-limit)。

创建循环时，你可以包含一条指定终止条件的条件边：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const route: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "b" }> = (state) => {
  if (terminationCondition(state)) {
    return END;
  } else {
    return "b";
  }
};

const graph = new StateGraph(State)
  .addNode("a", nodeA)
  .addNode("b", nodeB)
  .addEdge(START, "a")
  .addConditionalEdges("a", route)
  .addEdge("b", "a")
  .compile();
```

要控制递归上限，请在配置中指定 `"recursionLimit"`。这会抛出 `GraphRecursionError`，你可以捕获并处理它：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { GraphRecursionError } from "@langchain/langgraph";

try {
  await graph.invoke(inputs, { recursionLimit: 3 });
} catch (error) {
  if (error instanceof GraphRecursionError) {
    console.log("Recursion Error");
  }
}
```

让我们定义一个带简单循环的图。注意我们使用条件边来实现终止条件。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, GraphNode, ConditionalEdgeRouter, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  // The reducer makes this append-only
  aggregate: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
});

const nodeA: GraphNode<typeof State> = (state) => {
  console.log(`Node A sees ${state.aggregate}`);
  return { aggregate: ["A"] };
};

const nodeB: GraphNode<typeof State> = (state) => {
  console.log(`Node B sees ${state.aggregate}`);
  return { aggregate: ["B"] };
};

// Define edges
const route: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "b" }> = (state) => {
  if (state.aggregate.length < 7) {
    return "b";
  } else {
    return END;
  }
};

const graph = new StateGraph(State)
  .addNode("a", nodeA)
  .addNode("b", nodeB)
  .addEdge(START, "a")
  .addConditionalEdges("a", route)
  .addEdge("b", "a")
  .compile();
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await graph.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

这种架构类似于 [ReAct 智能体](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents.md)，其中节点 `"a"` 是一个调用工具的模型，节点 `"b"` 代表工具。

在我们的 `route` 条件边中，我们指定当状态中的 `"aggregate"` 列表超过阈值长度时应该结束。

调用该图，我们可以看到它在节点 `"a"` 和 `"b"` 之间交替，直到达到终止条件后结束。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await graph.invoke({ aggregate: [] });
console.log(result);
```

```
Node A sees []
Node B sees ['A']
Node A sees ['A', 'B']
Node B sees ['A', 'B', 'A']
Node A sees ['A', 'B', 'A', 'B']
Node B sees ['A', 'B', 'A', 'B', 'A']
Node A sees ['A', 'B', 'A', 'B', 'A', 'B']
{ aggregate: ['A', 'B', 'A', 'B', 'A', 'B', 'A'] }
```

### 施加递归上限

在某些应用中，我们可能无法保证一定会达到给定的终止条件。这种情况下，我们可以设置图的[递归上限](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#recursion-limit)。它会在经过给定数量的[超步](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graphs)后抛出 `GraphRecursionError`。然后我们可以捕获并处理该异常：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { GraphRecursionError } from "@langchain/langgraph";

try {
  await graph.invoke({ aggregate: [] }, { recursionLimit: 4 });
} catch (error) {
  if (error instanceof GraphRecursionError) {
    console.log("Recursion Error");
  }
}
```

```
Node A sees []
Node B sees ['A']
Node A sees ['A', 'B']
Node B sees ['A', 'B', 'A']
Node A sees ['A', 'B', 'A', 'B']
Recursion Error
```

## 用 `Command` 组合控制流与状态更新

把控制流（边）和状态更新（节点）结合起来可能很有用。例如，你可能想**在同一个节点中**既执行状态更新**又**决定接下来去哪个节点。LangGraph 通过从节点函数返回 [Command](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 对象来支持这一点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

const myNode = (state: State): Command => {
  return new Command({
    // state update
    update: { foo: "bar" },
    // control flow
    goto: "myOtherNode"
  });
};
```

下面我们展示一个端到端示例。让我们创建一个包含 3 个节点的简单图：A、B 和 C。我们将先执行节点 A，然后根据节点 A 的输出决定接下来去 Node B 还是 Node C。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, Command, START } from "@langchain/langgraph";
import * as z from "zod";

// Define graph state
const State = new StateSchema({
  foo: z.string(),
});

// Define the nodes

const nodeA: GraphNode<{ InputSchema: typeof State; Nodes: "nodeB" | "nodeC" }> = (state) => {
  console.log("Called A");
  const value = Math.random() > 0.5 ? "b" : "c";
  // this is a replacement for a conditional edge function
  const goto = value === "b" ? "nodeB" : "nodeC";

  // note how Command allows you to BOTH update the graph state AND route to the next node
  return new Command({
    // this is the state update
    update: { foo: value },
    // this is a replacement for an edge
    goto,
  });
};

const nodeB: GraphNode<typeof State> = (state) => {
  console.log("Called B");
  return { foo: state.foo + "b" };
};

const nodeC: GraphNode<typeof State> = (state) => {
  console.log("Called C");
  return { foo: state.foo + "c" };
};
```

现在我们可以用上述节点创建 `StateGraph`。注意该图没有用于路由的[条件边](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#conditional-edges)！这是因为控制流是通过 `nodeA` 内部的 `Command` 定义的。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = new StateGraph(State)
  .addNode("nodeA", nodeA, {
    ends: ["nodeB", "nodeC"],
  })
  .addNode("nodeB", nodeB)
  .addNode("nodeC", nodeC)
  .addEdge(START, "nodeA")
  .compile();
```

> [!WARNING]
>
> 你可能已经注意到，我们用 `ends` 指定了 `nodeA` 可以导航到哪些节点。这对图渲染是必要的，它会告诉 LangGraph `nodeA` 可以导航到 `nodeB` 和 `nodeC`。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await graph.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

如果我们多次运行该图，会看到它根据节点 A 中的随机选择走不同路径（A -> B 或 A -> C）。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await graph.invoke({ foo: "" });
console.log(result);
```

```
Called A
Called C
{ foo: 'cc' }
```

### 导航到父图中的节点

如果你在使用[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)，你可能想从子图内的某个节点导航到另一个子图（即父图中的另一个节点）。为此，你可以在 `Command` 中指定 `graph=Command.PARENT`：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const myNode = (state: State): Command => {
  return new Command({
    update: { foo: "bar" },
    goto: "otherSubgraph",  // where `otherSubgraph` is a node in the parent graph
    graph: Command.PARENT
  });
};
```

让我们用上面的例子来演示。我们将在上面的例子中把 `nodeA` 改成一个单节点图，并把它作为子图添加到父图中。

> [!WARNING]
>
> **使用 `Command.PARENT` 时的状态更新**
> 当你把更新从子图节点发送到父图节点，且该键同时被父图和子图的[状态模式](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#schema)共享时，你**必须**在父图状态中为该键定义 [reducer](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers)。参见下面的示例。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, GraphNode, Command, START } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  // NOTE: we define a reducer here
  foo: new ReducedValue(  // [!code highlight]
    z.string().default(""),
    { reducer: (x, y) => x + y }
  ),
});

const nodeA: GraphNode<{ InputSchema: typeof State; Nodes: "nodeB" | "nodeC" }> = (state) => {
  console.log("Called A");
  const value = Math.random() > 0.5 ? "nodeB" : "nodeC";

  // note how Command allows you to BOTH update the graph state AND route to the next node
  return new Command({
    update: { foo: "a" },  // [!code highlight]
    goto: value,
    // this tells LangGraph to navigate to nodeB or nodeC in the parent graph
    // NOTE: this will navigate to the closest parent graph relative to the subgraph
    graph: Command.PARENT,
  });
};

const subgraph = new StateGraph(State)
  .addNode("nodeA", nodeA, { ends: ["nodeB", "nodeC"] })
  .addEdge(START, "nodeA")
  .compile();

const nodeB: GraphNode<typeof State> = (state) => {
  console.log("Called B");  // [!code highlight]
  // NOTE: since we've defined a reducer, we don't need to manually append
  // new characters to existing 'foo' value. instead, reducer will append these
  // automatically
  return { foo: "b" };
};  // [!code highlight]

const nodeC: GraphNode<typeof State> = (state) => {
  console.log("Called C");
  return { foo: "c" };
};

const graph = new StateGraph(State)
  .addNode("subgraph", subgraph, { ends: ["nodeB", "nodeC"] })
  .addNode("nodeB", nodeB)
  .addNode("nodeC", nodeC)
  .addEdge(START, "subgraph")
  .compile();
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await graph.invoke({ foo: "" });
console.log(result);
```

```
Called A
Called C
{ foo: 'ac' }
```

### 在工具内部使用

一个常见用例是在工具内部更新图状态。例如，在客服应用中，你可能希望在对话开始时根据客户的账号或 ID 查询客户信息。要从工具更新图状态，你可以从工具返回 `Command(update={"my_custom_key": "foo", "messages": [...]})`：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import * as z from "zod";

const lookupUserInfo = tool(
  async (input, runtime) => {
    const userId = runtime.serverInfo?.user?.identity;  // [!code highlight]
    const userInfo = getUserInfo(userId);
    return new Command({
      update: {
        // update the state keys
        userInfo: userInfo,
        // update the message history
        messages: [{
          role: "tool",
          content: "Successfully looked up user information",
          tool_call_id: runtime.toolCall.id
        }]
      }
    });
  },
  {
    name: "lookupUserInfo",
    description: "Use this to look up user information to better assist them with their questions.",
    schema: z.object({}),
  }
);
```

> [!WARNING]
>
> 当你从工具返回 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 时，**必须**在 `Command.update` 中包含 `messages`（或任何用于消息历史的状态键），并且 `messages` 中的消息列表**必须**包含一个 `ToolMessage`。这对于保证生成的消息历史有效是必要的（LLM 提供方要求带工具调用的 AI 消息后面必须跟随工具结果消息）。

如果你使用通过 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 更新状态的工具，我们建议使用预置的 [`ToolNode`](https://reference.langchain.com/javascript/langchain-langgraph/prebuilt/ToolNode)，它会自动处理返回 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 对象的工具，并将它们传播到图状态。如果你编写调用工具的自定义节点，则需要手动把工具返回的 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 对象作为节点的更新进行传播。

## 可视化你的图

这里我们演示如何可视化你创建的图。

你可以可视化任意 [Graph](https://reference.langchain.com/python/langgraph/graphs/)，包括 [`StateGraph`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph)。

让我们创建一个简单的示例图来演示可视化。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, MessagesValue, ReducedValue, GraphNode, ConditionalEdgeRouter, START, END } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  value: new ReducedValue(
    z.number().default(0),
    { reducer: (x, y) => x + y }
  ),
});

const node1: GraphNode<typeof State> = (state) => {
  return { value: state.value + 1 };
};

const node2: GraphNode<typeof State> = (state) => {
  return { value: state.value * 2 };
};

const router: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "node2" }> = (state) => {
  if (state.value < 10) {
    return "node2";
  }
  return END;
};

const app = new StateGraph(State)
  .addNode("node1", node1)
  .addNode("node2", node2)
  .addEdge(START, "node1")
  .addConditionalEdges("node1", router)
  .addEdge("node2", "node1")
  .compile();
```

### Mermaid

我们也可以把图类转换为 Mermaid 语法。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const drawableGraph = await app.getGraphAsync();
console.log(drawableGraph.drawMermaid());
```

```
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
    tart__([<p>__start__</p>]):::first
    e1(node1)
    e2(node2)
    nd__([<p>__end__</p>]):::last
    tart__ --> node1;
    e1 -.-> node2;
    e1 -.-> __end__;
    e2 --> node1;
    ssDef default fill:#f2f0ff,line-height:1.2
    ssDef first fill-opacity:0
    ssDef last fill:#bfb6fc
```

### PNG

如果愿意，我们也可以把图渲染为 `.png`。这会使用 Mermaid.ink API 来生成图表。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as fs from "node:fs/promises";

const drawableGraph = await app.getGraphAsync();
const image = await drawableGraph.drawMermaidPng();
const imageBuffer = new Uint8Array(await image.arrayBuffer());

await fs.writeFile("graph.png", imageBuffer);
```

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/event-streaming.md

# 事件流式传输

> 以带类型的投影（projection）对 LangGraph 运行进行流式传输，涵盖消息、状态、子图、输出和扩展。

事件流式传输是大多数 LangGraph 应用代码推荐的进程内流式传输模型。它返回一个运行流对象，可以同时以多种方式消费。

## 快速开始

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(
  { messages: [{ role: "user", content: "What is 42 * 17?" }] },
  { version: "v3" }
);

for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}

const finalState = await stream.output;
```

要针对部署在 Agent Server 之后的图进行流式传输，请参阅 [LangSmith 流式传输 API](https://docs.langchain.com/langsmith/streaming.md)。

## 各部分如何协同工作

流式传输栈有两个主要层次：

1. **流式传输（streaming）** 从 Pregel 引擎发出原始的图执行事件。
2. **事件流式传输（event streaming）** 规范化这些事件，让它们经过流转换器（stream transformer），并暴露带类型的投影。

Pregel 引擎运行图步骤

发出

原始 Pregel 事件`updates`、`values`、`messages`、`custom`、`checkpoints`、`tasks`、`debug`

发送至

事件路由器让每个事件经过转换器管线

级联经过

流转换器

ValuesTransformerMessagesTransformer...自定义转换器

产出

事件流为应用代码投影出的事件

事件路由器是这两层之间的桥梁。它接收规范化后的 Pregel 事件，并把每个事件传入已注册的流转换器。内置转换器会创建标准投影，例如 `stream.messages`、`stream.values`、`stream.subgraphs` 和 `stream.output`。自定义转换器可以在 `stream.extensions` 下添加应用特有的投影。

## 事件流式传输提供的能力

运行流在单一底层事件流之上暴露带类型的投影：

| 投影 | 用途 |
| - | - |
| `stream` | 逐个迭代所有协议事件。 |
| `stream.messages` | 流式传输聊天模型消息与 token 增量。 |
| `stream.values` | 迭代状态快照，并等待最终值。 |
| `stream.output` | 等待最终输出。 |
| `stream.subgraphs` | 发现并观察嵌套的图执行。 |
| `stream.interrupts` | 查看人在环路的中断载荷。 |
| `stream.interrupted` | 检查运行是否因等待人工输入而暂停。 |
| `stream.extensions` | 消费自定义流转换器的投影。 |

多个消费者可以并发读取这些投影。读取 `stream.messages` 不会消耗 `stream.values`、`stream.subgraphs` 或 `stream.output` 所需的事件。

事件流式传输位于[流式传输](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)之上——后者通过 `updates`、`values`、`messages`、`custom`、`checkpoints`、`tasks` 和 `debug` 等 `stream_mode` 模式暴露原始的图执行事件。当你需要对这些模式进行底层访问时，使用流式传输；当应用代码能从带类型的投影中获益时，使用事件流式传输。

## 流式传输消息

使用 `stream.messages` 获取聊天模型的输出：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(input, { version: "v3" });

for await (const message of stream.messages) {
  const text = await message.text;
  const usage = await message.usage;

  console.log(text);
  console.log(usage);
}
```

`message.text` 既是异步可迭代对象，也是类 Promise 的值。迭代它可以逐 token 获取输出，await 它可以得到完整文本。

## 流式传输子图

使用 `stream.subgraphs` 观察嵌套的图工作，而无需解析命名空间字符串：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(input, { version: "v3" });

for await (const subgraph of stream.subgraphs) {
  console.log(subgraph.name, subgraph.path);

  for await (const message of subgraph.messages) {
    console.log(await message.text);
  }
}
```

`subgraph.graph_name` 是已编译图或智能体的 `name`。从工具中分发的具名智能体（例如通过 Deep Agents 的 `task` 工具调用 `create_agent(name=...)`）会以该名称出现在这里，而开启该作用域的 `lifecycle` 事件会携带一个 `cause`，指回分发它的工具调用。更多信息请参阅[生命周期](#lifecycle)。

关于特定产品的流，子智能体流请参阅 [Deep Agents 流式传输](https://docs.langchain.com/oss/javascript/deepagents/event-streaming.md)，工具调用和中间件事件请参阅 [LangChain 智能体流式传输](https://docs.langchain.com/oss/javascript/langchain/streaming.md)。

## 流式传输状态

使用 `stream.values` 在每一步之后流式传输完整状态快照：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(input, { version: "v3" });

for await (const snapshot of stream.values) {
  console.log(snapshot);
}

const finalState = await stream.output;
```

## 流式传输多个投影

在 JavaScript 中需要多个投影时，请使用并发消费者：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
await Promise.all([
  (async () => {
    for await (const message of stream.messages) {
      console.log(await message.text);
    }
  })(),
  (async () => {
    for await (const subgraph of stream.subgraphs) {
      console.log(subgraph.path);
    }
  })(),
]);
```

## 中断后恢复

当图因等待人工输入而暂停时，查看 `stream.interrupted` 和 `stream.interrupts`，然后带上 `Command` 再次调用 `stream_events(..., version="v3")` 来恢复。

恢复要求图使用检查点保存器编译，且配置中携带线程 ID —— 请参阅[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

let stream = await graph.streamEvents(input, { version: "v3" });

for await (const message of stream.messages) {
  console.log(await message.text);
}

if (stream.interrupted) {
  console.log(stream.interrupts);
}

stream = await graph.streamEvents(
  new Command({ resume: { decisions: [{ type: "approve" }] } }),
  { version: "v3" }
);
const finalState = await stream.output;
```

## 流式传输所有协议事件

当你需要原始协议事件流时，直接使用运行对象本身：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(
  { messages: [{ role: "user", content: "What is 42 * 17?" }] },
  { version: "v3" }
);

for await (const event of stream) {
  const namespace = event.params.namespace;
  console.log(namespace, event.method, event.params.data);
}
```

每个事件都是一个 `ProtocolEvent` 信封，包装着特定通道的载荷。转换器的 `process(event)` 接收的也是同样的结构。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
interface ProtocolEvent {
  readonly seq: number;         // strictly increasing within a run; use for ordering
  readonly method: string;      // channel name: "messages", "values", "updates", "custom", "tools", "lifecycle", ...
  readonly params: {
    readonly namespace: string[];  // path of "<name>:<runtime_id>" segments from the root graph; [] is the root
    readonly timestamp: number;    // wall-clock milliseconds; can drift, don't rely on for ordering
    readonly node?: string;        // graph node that emitted this event, when applicable
    readonly data: unknown;        // channel-specific payload; shape depends on `method`
  };
}
```

`namespace` 是从根图到发出该事件的作用域的路径。根是空数组 `[]`。每个子执行会添加一个 `"name:runtime_id"` 段，因此子图内嵌套的工具调用看起来像 `["researcher:6f4d", "tools:91ac"]`。`:` 之前的名称是稳定的图或节点名称；后缀是每次调用专属的运行时 ID。当你只关心某个特定子树时，请自行按命名空间过滤原始事件——`stream.subgraphs` 已经为嵌套图执行做了这件事。

## 通道与事件生命周期

原始事件在通道上流动。通道名称会作为事件的 `method` 出现；每个通道发出特定的事件结构。

| 通道 | 用途 |
| - | - |
| `values` | 完整图状态快照。 |
| `updates` | 按节点的状态增量。 |
| `messages` | 以内容块为中心的聊天模型输出。 |
| `tools` | 工具调用的开始、流式输出、结束和错误事件。 |
| `lifecycle` | 运行、子图和子智能体的状态变化。 |
| `checkpoints` | 用于分支和时间旅行的轻量检查点信封。 |
| `input` | 人在环路输入请求与响应。 |
| `tasks` | Pregel 任务创建与结果事件。 |
| `custom` | 来自图代码的用户自定义载荷。 |
| `custom:<name>` | 应用定义的流转换器输出。 |

带类型的投影（`stream.messages`、`stream.values` 等）就是由这些通道构建的。当你直接迭代运行对象时，通道名称会作为原始事件上的 `method` 字段出现。

### 消息

`messages` 通道把输出建模为内容块。数据的 `event` 字段是以下之一：

* `message-start`
* `content-block-start`
* `content-block-delta`
* `content-block-finish`
* `message-finish`

内容块具有明确的边界：一个块开始、发出零个或多个增量，并在同一消息中的下一个块开始之前结束。这使得 token 流式输出、推理块、工具调用块和多模态内容都变得明确，而无需依赖特定提供方的格式。`message-finish` 可能包含 token 用量；不可恢复的模型调用失败会以消息错误事件的形式到达。

每个 `content-block-delta` 事件携带其 `index` 处块的一个增量：

| 增量 `type` | 对块的影响 |
| - | - |
| `text-delta` | 把其 `text` 追加到块的 `text`。 |
| `reasoning-delta` | 把其 `reasoning` 追加到块的 `reasoning`。 |
| `data-delta` | 把其 `data` 追加到块的 `base64`。 |
| `tool-call-delta` | 把其 `args` 追加到块的 `args`。 |
| `block-delta` | 在块上设置 `fields` 中的每个键，替换先前的值。 |

`content-block-finish` 携带完整的内容块。忽略任何你不认识的增量类型，并继续读取流。

要直接消费原始内容块事件，而不使用 `stream.messages` 投影：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const event of stream) {
  if (event.method !== "messages") continue;

  const data = event.params.data;
  if (data.event !== "content-block-delta") continue;

  const block = data.delta ?? {};
  if (block.type === "text-delta") {
    process.stdout.write(block.text ?? "");
  } else if (block.type === "reasoning-delta") {
    process.stdout.write(`[thinking]${block.reasoning ?? ""}`);
  } else if (block.type === "tool-call-delta") {
    process.stdout.write(`[args]${block.args ?? ""}`);
  }
}
```

### 工具

`tools` 通道暴露工具执行。数据的 `event` 字段是以下之一：

* `tool-started`
* `tool-output-delta`
* `tool-finished`
* `tool-error`

工具事件通过工具调用 ID 关联，因此一次工具执行可以关联回 `messages` 通道上发起它的工具调用内容块。

### 生命周期

`lifecycle` 通道跟踪根运行、子图和子智能体的状态。数据的 `event` 字段是以下之一：

* `started`
* `running`
* `completed`
* `failed`
* `interrupted`

除 `event` 之外，生命周期数据还可能包含可选的 `graph_name`、`error`，以及描述子作用域为何启动的 `cause`（父工具调用、fan-out 发送、边转换）。

## 构建你自己的投影

流转换器是事件流式传输中的投影层。它们观察协议事件、维护自己的状态，并暴露一次运行的派生视图——例如工具活动、token 总量、进度事件、产物，或面向另一种协议的消息。`StreamChannel` 是转换器用来发布这些视图的投影原语。

内置投影（`stream.messages`、`stream.values`、`stream.subgraphs`、`stream.output`）和特定产品的投影（LangChain 的 `stream.tool_calls`、Deep Agents 的 `stream.subagents`）本身就是使用同一套契约的转换器。用户转换器可以通过编译时或调用时注册叠加在其上，其投影会出现在 `stream.extensions` 下。

当现有投影不符合应用所需的形态时，就编写一个转换器。

### 转换器如何工作

事件流式传输从 LangGraph Pregel 引擎的流式输出开始。运行时把这些数据块规范化为协议事件，然后由流处理器把每个事件路由经过一叠流转换器。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
flowchart TD
    A[Pregel modes] --> B[Events]
    B --> C[Built-in projections]
    C --> D[User transformers]
    D --> E[Run projections]
```

流处理器是单个流的中心调度器。对于每个协议事件，它会：

1. 按顺序调用每个已注册转换器的 `process(event)` 钩子。
2. 把具名 `StreamChannel` 的推送接回协议事件流。
3. 把事件存入运行流，除非某个转换器抑制了它。
4. 在运行结束时对每个转换器调用 `finalize()` 或 `fail()`。

转换器是观察性的。它们不会回调图运行时。它们只消费事件，并把派生值推入 `StreamChannel`、Promise 或其他投影对象。

### 转换器形态

转换器实现 `StreamTransformer` 接口：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
interface StreamTransformer<TProjection = unknown> {
  init(): TProjection;
  process(event: ProtocolEvent): boolean;
  finalize?(): void | PromiseLike<void>;
  fail?(err: unknown): void;
}
```

* `init()` 创建投影对象。用户转换器的投影会出现在 `stream.extensions` 下。
* `process()` 观察每个协议事件。`ProtocolEvent` 的结构请参阅[流式传输所有协议事件](#stream-all-protocol-events)。只有当你确实想抑制原始事件时，才返回 `false`。
* `finalize()` 在流成功结束后关闭或兑现非通道投影。
* `fail()` 把错误传播到非通道投影。

### 声明所需的流模式

`required_stream_modes` 控制底层图在流式传输期间发出哪些 Pregel 流模式。运行时会取所有已注册转换器 `required_stream_modes` 的并集，并把该并集作为 `stream_mode` 参数传给图的 `.stream()` 调用。**没有任何转换器请求的模式永远不会被发出**——正是声明 `("custom",)` 才使 `custom` 事件能流经整个运行。

`process()` 会接收图发出的每个事件，并负责按 `event["method"]` 过滤。声明的作用是开启上游发出；它不会收窄 `process()` 看到的内容。有效值是 Pregel 流模式：`"messages"`、`"tools"`、`"custom"`、`"values"`、`"updates"`、`"checkpoints"`、`"tasks"`、`"debug"`。每个转换器必须声明它要处理的每一种模式——省略的模式不会被图发出，也永远不会到达 `process()`。

### StreamChannel

`StreamChannel` 是转换器用于流式传输值的投影原语。它始终在 `stream.extensions.<name>` 上暴露一个可迭代流。构造函数参数决定每次 `push()` 是否也作为 `custom:<name>` 事件流入运行的主事件流——也就是说，该投影的值在迭代原始协议事件时是否可见。

| 需求 | 使用方式 |
| - | - |
| 仅作为侧通道投影 | `new StreamChannel<T>()` |
| 同时让每次 push 流入主事件流 | `new StreamChannel<T>(name)` |

具名通道的载荷必须可序列化，因为每个推送的值也会成为主流中的一个 `custom:<name>` 协议事件。把 Promise、异步可迭代对象、类实例及其他进程内句柄放在未命名通道中。

流处理器负责通道的生命周期。一旦 `init()` 返回某个通道，处理器会在运行结束时为你关闭或标记它为失败。转换器只负责推送值。

### 示例：具名通道

给 `StreamChannel` 传入字符串名称，既可以通过 `stream.extensions` 暴露一个流式投影，*又*会把每个推送的值作为 `custom:<name>` 协议事件转发到运行的主事件流中：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StreamChannel } from "@langchain/langgraph";

const toolActivityTransformer = () => {
  const activity = new StreamChannel<{
    name: string;
    status: "started" | "finished" | "error";
  }>("toolActivity");

  return {
    init: () => ({ toolActivity: activity }),
    process(event) {
      if (event.method === "tools") {
        const data = event.params.data as { tool_name?: string; event?: string };
        if (data.tool_name && data.event) {
          activity.push({
            name: data.tool_name,
            status: data.event === "tool-error" ? "error" : "started",
          });
        }
      }
      return true;
    },
  };
};
```

### 示例：未命名通道

不传名称时，该通道仅是侧通道投影——可在 `stream.extensions` 上访问，但对迭代原始事件的消费者不可见。对于持有进程内句柄（Promise、异步可迭代对象、类实例）而无法序列化到主事件流上的投影，这是正确的选择。

下面的示例把未命名通道与 `get_stream_writer` 配对使用，让图节点能够发出 `custom` 通道事件，再由转换器把它们排入投影：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StreamChannel } from "@langchain/langgraph";

const customTransformer = () => {
  const custom = new StreamChannel<unknown>();

  return {
    init: () => ({ custom }),
    process(event) {
      if (event.method === "custom") {
        custom.push(event.params.data);
      }
      return true;
    },
  };
};
```

### 示例：最终值投影

当投影不应流入主事件流时，请使用未命名流、Promise 或其他进程内对象：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const statsTransformer = () => {
  let totalTokens = 0;
  let resolveTotal!: (value: number) => void;
  const totalTokensPromise = new Promise<number>((resolve) => {
    resolveTotal = resolve;
  });

  return {
    init: () => ({ totalTokens: totalTokensPromise }),
    process(event) {
      if (event.method === "messages") {
        const data = event.params.data as { usage?: { output_tokens?: number } };
        totalTokens += data.usage?.output_tokens ?? 0;
      }
      return true;
    },
    finalize: () => resolveTotal(totalTokens),
  };
};
```

### 在调用时或编译时注册

本地实验时在调用时传入转换器：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const stream = await graph.streamEvents(input, {
  version: "v3",
  transformers: [statsTransformer, toolActivityTransformer],
});
```

当该图的每次运行都应产出该投影时，把转换器编译进图：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = builder.compile({
  transformers: [statsTransformer, toolActivityTransformer],
});
```

### 内置：`ToolCallTransformer`

## 相关内容

LangGraph 定义了流式传输的基础原语。关于在 LangChain 或 Deep Agents 中使用流式传输，请查阅相应产品的文档：

* [LangChain 智能体流式传输](https://docs.langchain.com/oss/javascript/langchain/event-streaming.md)涵盖 ReAct 风格的智能体消息、工具调用和中间件更新。
* [Deep Agents 流式传输](https://docs.langchain.com/oss/javascript/deepagents/event-streaming.md)涵盖子智能体、嵌套消息和子智能体工具调用。
* [LangChain 前端模式](https://docs.langchain.com/oss/javascript/langchain/frontend/overview.md)和 [LangGraph 前端模式](https://docs.langchain.com/oss/javascript/langgraph/frontend/overview.md)展示了构建在流式状态之上的 UI 用例。
* [LangSmith 流式传输 API](https://docs.langchain.com/langsmith/streaming.md)涵盖针对部署在 Agent Server 之后的图的流式传输。

线级事件与命令格式定义在 [Agent Protocol](https://github.com/langchain-ai/agent-protocol) 仓库中，并可通过 PyPI 上的 [`langchain-protocol`](https://pypi.org/project/langchain-protocol/) 和 npm 上的 [`@langchain/protocol`](https://www.npmjs.com/package/@langchain/protocol) 使用。

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/streaming.md

# 流式传输

> [!TIP]
>
> 对于新应用，我们推荐使用[事件流式传输](https://docs.langchain.com/oss/javascript/langgraph/event-streaming.md)——这是 LangGraph v1.2 引入的类型化投影 API。事件流式传输为每个投影（messages、values、subgraphs、output）提供独立的迭代器，因此你可以分别消费它们，而不必对 `stream_mode` 分块做分支判断。

本页介绍 LangGraph 的流模式（stream-mode）API。它通过 `updates`、`values`、`messages`、`custom`、`checkpoints`、`tasks` 和 `debug` 等流模式暴露图执行过程。当你需要直接访问图运行时事件或特定的流模式输出时，请使用它。

## 快速开始

### 基本用法

LangGraph 图暴露了 [`stream`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/stream) 方法，以迭代器形式产出流式输出。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const chunk of await graph.stream(inputs, {
  streamMode: "updates",
})) {
  console.log(chunk);
}
```

> [!TIP]
>
> 使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-streaming) 调试流式传输事件、逐 token 检查 LLM 输出并监控延迟。按照[追踪快速入门](https://docs.langchain.com/langsmith/trace-with-langgraph.md)完成配置。

## 流模式

将一个或多个下列流模式以列表形式传给 [`stream`](https://reference.langchain.com/javascript/langchain-langgraph/index/CompiledStateGraph/stream) 方法：

| 模式 | 描述 |
| :- | :- |
| [values](#graph-state) | 每一步之后的完整状态。 |
| [updates](#graph-state) | 每一步之后的状态更新。同一步中的多个更新会被分别流式传输。 |
| [messages](#llm-tokens) | 来自 LLM 调用的（LLM token, 元数据）二元组。 |
| [custom](#custom-data) | 节点通过 `writer` 配置参数发出的自定义数据。 |
| [tools](#tool-progress) | 工具调用生命周期事件（`on_tool_start`、`on_tool_event`、`on_tool_end`、`on_tool_error`）。 |
| [debug](#debug) | 图执行过程中的所有可用信息。 |

### 图状态

使用 `updates` 和 `values` 流模式来流式传输图执行过程中的状态。

* `updates` 流式传输图每一步之后对状态的**更新**。
* `values` 流式传输图每一步之后的**完整状态值**。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  topic: z.string(),
  joke: z.string(),
});

const graph = new StateGraph(State)
  .addNode("refineTopic", (state) => {
    return { topic: state.topic + " and cats" };
  })
  .addNode("generateJoke", (state) => {
    return { joke: `This is a joke about ${state.topic}` };
  })
  .addEdge(START, "refineTopic")
  .addEdge("refineTopic", "generateJoke")
  .addEdge("generateJoke", END)
  .compile();
```

**updates**

使用它只流式传输每一步之后节点返回的**状态更新**。流式输出包含节点名称以及更新内容。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const chunk of await graph.stream(
  { topic: "ice cream" },
  { streamMode: "updates" }
)) {
  for (const [nodeName, state] of Object.entries(chunk)) {
    console.log(`Node ${nodeName} updated:`, state);
  }
}
```

**values**

使用它流式传输每一步之后图的**完整状态**。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const chunk of await graph.stream(
  { topic: "ice cream" },
  { streamMode: "values" }
)) {
  console.log(`topic: ${chunk.topic}, joke: ${chunk.joke}`);
}
```

### LLM token

使用 `messages` 流模式，可以从图的任何部分（包括节点、工具、子图或任务）**逐 token** 流式传输大型语言模型（LLM）的输出。

[`messages` 模式](#stream-modes)的流式输出是一个元组 `[message_chunk, metadata]`，其中：

* `message_chunk`：来自 LLM 的 token 或消息片段。
* `metadata`：包含图节点与 LLM 调用详情的字典。

> 如果你的 LLM 没有对应的 LangChain 集成，你可以改用 `custom` 模式来流式传输其输出。详情参见[与任意 LLM 配合使用](#use-with-any-llm)。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, StateSchema, GraphNode, START } from "@langchain/langgraph";
import * as z from "zod";

const MyState = new StateSchema({
  topic: z.string(),
  joke: z.string().default(""),
});

const model = new ChatOpenAI({ model: "gpt-5.4-mini" });

const callModel: GraphNode<typeof MyState> = async (state) => {
  // Call the LLM to generate a joke about a topic
  // Note that message events are emitted even when the LLM is run using .invoke rather than .stream
  const modelResponse = await model.invoke([
    { role: "user", content: `Generate a joke about ${state.topic}` },
  ]);
  return { joke: modelResponse.content };
};

const graph = new StateGraph(MyState)
  .addNode("callModel", callModel)
  .addEdge(START, "callModel")
  .compile();

// The "messages" stream mode returns an iterator of tuples [messageChunk, metadata]
// where messageChunk is the token streamed by the LLM and metadata is a dictionary
// with information about the graph node where the LLM was called and other information
for await (const [messageChunk, metadata] of await graph.stream(
  { topic: "ice cream" },
  { streamMode: "messages" }
)) {
  if (messageChunk.content) {
    console.log(messageChunk.content + "|");
  }
}
```

#### 按 LLM 调用过滤

你可以为 LLM 调用关联 `tags`，以便按 LLM 调用过滤流式传输的 token。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatOpenAI } from "@langchain/openai";

// model1 is tagged with "joke"
const model1 = new ChatOpenAI({
  model: "gpt-5.4-mini",
  tags: ['joke']
});
// model2 is tagged with "poem"
const model2 = new ChatOpenAI({
  model: "gpt-5.4-mini",
  tags: ['poem']
});

const graph = // ... define a graph that uses these LLMs

// The streamMode is set to "messages" to stream LLM tokens
// The metadata contains information about the LLM invocation, including the tags
for await (const [msg, metadata] of await graph.stream(
  { topic: "cats" },
  { streamMode: "messages" }
)) {
  // Filter the streamed tokens by the tags field in the metadata to only include
  // the tokens from the LLM invocation with the "joke" tag
  if (metadata.tags?.includes("joke")) {
    console.log(msg.content + "|");
  }
}
```

> **扩展示例：按标签过滤**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatOpenAI } from "@langchain/openai";
> import { StateGraph, StateSchema, GraphNode, START } from "@langchain/langgraph";
> import * as z from "zod";
>
> // The jokeModel is tagged with "joke"
> const jokeModel = new ChatOpenAI({
>   model: "gpt-5.4-mini",
>   tags: ["joke"]
> });
> // The poemModel is tagged with "poem"
> const poemModel = new ChatOpenAI({
>   model: "gpt-5.4-mini",
>   tags: ["poem"]
> });
>
> const State = new StateSchema({
>   topic: z.string(),
>   joke: z.string(),
>   poem: z.string(),
> });
>
> const callModel: GraphNode<typeof State> = async (state) => {
>   const topic = state.topic;
>   console.log("Writing joke...");
>
>   const jokeResponse = await jokeModel.invoke([
>     { role: "user", content: `Write a joke about ${topic}` }
>   ]);
>
>   console.log("\n\nWriting poem...");
>   const poemResponse = await poemModel.invoke([
>     { role: "user", content: `Write a short poem about ${topic}` }
>   ]);
>
>   return {
>     joke: jokeResponse.content,
>     poem: poemResponse.content
>   };
> };
>
> const graph = new StateGraph(State)
>   .addNode("callModel", callModel)
>   .addEdge(START, "callModel")
>   .compile();
>
> // The streamMode is set to "messages" to stream LLM tokens
> // The metadata contains information about the LLM invocation, including the tags
> for await (const [msg, metadata] of await graph.stream(
>   { topic: "cats" },
>   { streamMode: "messages" }
> )) {
>   // Filter the streamed tokens by the tags field in the metadata to only include
>   // the tokens from the LLM invocation with the "joke" tag
>   if (metadata.tags?.includes("joke")) {
>     console.log(msg.content + "|");
>   }
> }
> ```

#### 从流中省略消息

使用 `nostream` 标签可以将 LLM 输出完全排除在流之外。带 `nostream` 标签的调用仍会执行并产生输出；只是它们的 token 不会在 `messages` 模式中发出。

这适用于以下场景：

* 你需要 LLM 输出用于内部处理（例如结构化输出），但不希望将其流式传输给客户端
* 你通过其他通道（例如自定义 UI 消息）流式传输同一内容，并希望避免 `messages` 流中出现重复输出

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, StateSchema, START } from "@langchain/langgraph";
import * as z from "zod";

const streamModel = new ChatAnthropic({ model: "claude-haiku-4-5-20251001" });
const internalModel = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
}).withConfig({
  tags: ["nostream"],
});

const State = new StateSchema({
  topic: z.string(),
  answer: z.string().optional(),
  notes: z.string().optional(),
});

const contentToText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (
          typeof block === "object" &&
          block !== null &&
          "text" in block &&
          typeof (block as { text?: unknown }).text === "string"
        ) {
          return (block as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const writeAnswer = async (state: typeof State.State) => {
  const r = await streamModel.invoke([
    { role: "user", content: `Reply briefly about ${state.topic}` },
  ]);
  return { answer: contentToText(r.content) };
};

const internalNotes = async (state: typeof State.State) => {
  // Tokens from this model are omitted from streamMode: "messages" because of nostream
  const r = await internalModel.invoke([
    { role: "user", content: `Private notes on ${state.topic}` },
  ]);
  return { notes: contentToText(r.content) };
};

const graph = new StateGraph(State)
  .addNode("writeAnswer", writeAnswer)
  .addNode("internal_notes", internalNotes)
  .addEdge(START, "writeAnswer")
  .addEdge("writeAnswer", "internal_notes")
  .compile();

const stream = await graph.streamEvents(
  { topic: "AI", answer: "", notes: "" },
  { version: "v3" },
);
```

> **[查看示例追踪](https://smith.langchain.com/public/ba51f3a8-41b5-4403-bf37-5978e9fadb99/r)**
>
> 在 LangSmith 中打开此示例的公开运行记录。

#### 按节点过滤

要只流式传输来自特定节点的 token，请使用 `stream_mode="messages"`，并按流式元数据中的 `langgraph_node` 字段过滤输出：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// The "messages" stream mode returns a tuple of [messageChunk, metadata]
// where messageChunk is the token streamed by the LLM and metadata is a dictionary
// with information about the graph node where the LLM was called and other information
for await (const [msg, metadata] of await graph.stream(
  inputs,
  { streamMode: "messages" }
)) {
  // Filter the streamed tokens by the langgraph_node field in the metadata
  // to only include the tokens from the specified node
  if (msg.content && metadata.langgraph_node === "some_node_name") {
    // ...
  }
}
```

> **扩展示例：流式传输特定节点的 LLM token**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatOpenAI } from "@langchain/openai";
> import { StateGraph, StateSchema, GraphNode, START } from "@langchain/langgraph";
> import * as z from "zod";
>
> const model = new ChatOpenAI({ model: "gpt-5.4-mini" });
>
> const State = new StateSchema({
>   topic: z.string(),
>   joke: z.string(),
>   poem: z.string(),
> });
>
> const writeJoke: GraphNode<typeof State> = async (state) => {
>   const topic = state.topic;
>   const jokeResponse = await model.invoke([
>     { role: "user", content: `Write a joke about ${topic}` }
>   ]);
>   return { joke: jokeResponse.content };
> };
>
> const writePoem: GraphNode<typeof State> = async (state) => {
>   const topic = state.topic;
>   const poemResponse = await model.invoke([
>     { role: "user", content: `Write a short poem about ${topic}` }
>   ]);
>   return { poem: poemResponse.content };
> };
>
> const graph = new StateGraph(State)
>   .addNode("writeJoke", writeJoke)
>   .addNode("writePoem", writePoem)
>   // write both the joke and the poem concurrently
>   .addEdge(START, "writeJoke")
>   .addEdge(START, "writePoem")
>   .compile();
>
> // The "messages" stream mode returns a tuple of [messageChunk, metadata]
> // where messageChunk is the token streamed by the LLM and metadata is a dictionary
> // with information about the graph node where the LLM was called and other information
> for await (const [msg, metadata] of await graph.stream(
>   { topic: "cats" },
>   { streamMode: "messages" }
> )) {
>   // Filter the streamed tokens by the langgraph_node field in the metadata
>   // to only include the tokens from the writePoem node
>   if (msg.content && metadata.langgraph_node === "writePoem") {
>     console.log(msg.content + "|");
>   }
> }
> ```

### 自定义数据

要从 LangGraph 节点或工具内部发送**自定义的用户定义数据**，请按以下步骤操作：

1. 使用 `LangGraphRunnableConfig` 中的 `writer` 参数发出自定义数据。
2. 调用 `.stream()` 时设置 `streamMode: "custom"`，以便在流中获取该自定义数据。你可以组合多个模式（例如 `["updates", "custom"]`），但其中至少一个必须是 `"custom"`。

**node**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, START, LangGraphRunnableConfig } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  query: z.string(),
  answer: z.string(),
});

const node: GraphNode<typeof State> = async (state, config) => {
  // Use the writer to emit a custom key-value pair (e.g., progress update)
  config.writer({ custom_key: "Generating custom data inside node" });
  return { answer: "some data" };
};

const graph = new StateGraph(State)
  .addNode("node", node)
  .addEdge(START, "node")
  .compile();

const inputs = { query: "example" };

// Set streamMode: "custom" to receive the custom data in the stream
for await (const chunk of await graph.stream(inputs, { streamMode: "custom" })) {
  console.log(chunk);
}
```

**tool**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "@langchain/core/tools";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import * as z from "zod";

const queryDatabase = tool(
  async (input, config: LangGraphRunnableConfig) => {
    // Use the writer to emit a custom key-value pair (e.g., progress update)
    config.writer({ data: "Retrieved 0/100 records", type: "progress" });
    // perform query
    // Emit another custom key-value pair
    config.writer({ data: "Retrieved 100/100 records", type: "progress" });
    return "some-answer";
  },
  {
    name: "query_database",
    description: "Query the database.",
    schema: z.object({
      query: z.string().describe("The query to execute."),
    }),
  }
);

const graph = // ... define a graph that uses this tool

// Set streamMode: "custom" to receive the custom data in the stream
for await (const chunk of await graph.stream(inputs, { streamMode: "custom" })) {
  console.log(chunk);
}
```

### 工具进度

使用 `tools` 流模式可以接收工具执行的实时生命周期事件。这有助于在工具运行期间于 UI 中展示进度指示器、部分结果和错误状态。

`tools` 流模式会发出四种事件类型：

| 事件 | 触发时机 | 载荷 |
| - | - | - |
| `on_tool_start` | 工具调用开始 | `name`、`input`、`toolCallId` |
| `on_tool_event` | 工具产出中间数据 | `name`、`data`、`toolCallId` |
| `on_tool_end` | 工具返回最终结果 | `name`、`output`、`toolCallId` |
| `on_tool_error` | 工具抛出错误 | `name`、`error`、`toolCallId` |

#### 定义可流式传输进度的工具

要发出 `on_tool_event` 事件，请将工具函数定义为**异步生成器**（`async function*`）。每次 `yield` 都会向流发送中间数据，而 `return` 值则用作工具的最终结果。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "@langchain/core/tools";
import { z } from "zod/v4";

const searchFlights = tool(
  async function* (input) {
    const airlines = ["United", "Delta", "American", "JetBlue"];
    const completed: string[] = [];

    for (let i = 0; i < airlines.length; i++) {
      await new Promise((r) => setTimeout(r, 500));
      completed.push(airlines[i]);

      // Each yield emits an on_tool_event to the stream
      yield {
        message: `Searching ${airlines[i]}...`,
        progress: (i + 1) / airlines.length,
        completed,
      };
    }

    // The return value becomes the tool result (ToolMessage.content)
    return JSON.stringify({
      flights: [
        { airline: "United", price: 450, duration: "5h 30m" },
        { airline: "Delta", price: 520, duration: "5h 15m" },
      ],
    });
  },
  {
    name: "search_flights",
    description: "Search for available flights to a destination.",
    schema: z.object({
      destination: z.string(),
      date: z.string(),
    }),
  }
);
```

> [!NOTE]
>
> 返回 `Promise` 的已有工具完全兼容。它们会发出 `on_tool_start` 和 `on_tool_end` 事件，但不会发出 `on_tool_event` 事件。

#### 在服务端消费工具事件

将 `streamMode: ["tools"]`（或与其他模式组合）传给 `graph.stream()`：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const [mode, chunk] of await graph.stream(
  { messages: [{ role: "user", content: "Find flights to Tokyo" }] },
  { streamMode: ["updates", "tools"] }
)) {
  if (mode === "tools") {
    switch (chunk.event) {
      case "on_tool_start":
        console.log(`Tool started: ${chunk.name}`, chunk.input);
        break;
      case "on_tool_event":
        console.log(`Tool progress: ${chunk.name}`, chunk.data);
        break;
      case "on_tool_end":
        console.log(`Tool finished: ${chunk.name}`, chunk.output);
        break;
      case "on_tool_error":
        console.error(`Tool failed: ${chunk.name}`, chunk.error);
        break;
    }
  }
}
```

#### 在 React 中使用 `useStream` 展示工具进度

当你在流模式中包含 `"tools"` 时，`@langchain/langgraph-sdk/react` 中的 [`useStream`](https://reference.langchain.com/javascript/langchain-react/index/useStream) hook 会暴露一个 `toolProgress` 数组。每个条目都是一个 `ToolProgress` 对象，用于跟踪运行中工具的当前状态：

| 字段 | 描述 |
| - | - |
| `name` | 工具名称 |
| `state` | 当前生命周期状态：`"starting"`、`"running"`、`"completed"` 或 `"error"` |
| `toolCallId` | 来自 LLM 的工具调用 ID |
| `input` | 工具的输入参数 |
| `data` | 最近一次由 `on_tool_event` 产出的数据 |
| `result` | 最终结果，在 `on_tool_end` 时设置 |
| `error` | 错误，在 `on_tool_error` 时设置 |

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useStream } from "@langchain/langgraph-sdk/react";

function Chat() {
  const stream = useStream({
    assistantId: "my-agent",
    streamMode: ["values", "tools"],
  });

  // Filter for actively running tools
  const activeTools = stream.toolProgress.filter(
    (t) => t.state === "starting" || t.state === "running"
  );

  return (
    <div>
      {stream.messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Show progress cards for running tools */}
      {activeTools.map((tool) => (
        <ToolProgressCard
          key={tool.toolCallId ?? tool.name}
          name={tool.name}
          state={tool.state}
          data={tool.data}
        />
      ))}
    </div>
  );
}
```

> **扩展示例：带工具进度的旅行规划智能体**
>
> 本示例展示一个完整的智能体，它使用异步生成器工具将搜索进度流式传输到 React UI。
>
> **智能体定义：**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { tool } from "@langchain/core/tools";
> import { ChatOpenAI } from "@langchain/openai";
> import { createAgent } from "@langchain/langgraph";
> import { MemorySaver } from "@langchain/langgraph-checkpoint-memory";
> import { z } from "zod/v4";
>
> const searchFlights = tool(
>   async function* (input) {
>     const airlines = ["United", "Delta", "American", "JetBlue"];
>     const completed: string[] = [];
>
>     for (let i = 0; i < airlines.length; i++) {
>       await new Promise((r) => setTimeout(r, 600));
>       completed.push(`${airlines[i]}: checked`);
>       yield {
>         message: `Searching ${airlines[i]}...`,
>         progress: (i + 1) / airlines.length,
>         completed,
>       };
>     }
>
>     return JSON.stringify({
>       flights: [
>         { airline: "United", price: 450, duration: "5h 30m" },
>         { airline: "Delta", price: 520, duration: "5h 15m" },
>       ],
>     });
>   },
>   {
>     name: "search_flights",
>     description: "Search for available flights.",
>     schema: z.object({
>       destination: z.string(),
>       departure_date: z.string(),
>     }),
>   }
> );
>
> const checkHotels = tool(
>   async function* (input) {
>     const hotels = ["Grand Hyatt", "Marriott", "Hilton"];
>     const completed: string[] = [];
>
>     for (let i = 0; i < hotels.length; i++) {
>       await new Promise((r) => setTimeout(r, 400));
>       completed.push(`${hotels[i]}: available`);
>       yield {
>         message: `Checking ${hotels[i]}...`,
>         progress: (i + 1) / hotels.length,
>         completed,
>       };
>     }
>
>     return JSON.stringify({
>       hotels: [
>         { name: "Grand Hyatt", price: 250, rating: 4.5 },
>         { name: "Marriott", price: 180, rating: 4.2 },
>       ],
>     });
>   },
>   {
>     name: "check_hotels",
>     description: "Check hotel availability.",
>     schema: z.object({
>       city: z.string(),
>       check_in: z.string(),
>       nights: z.number(),
>     }),
>   }
> );
>
> export const agent = createAgent({
>   model: new ChatOpenAI({ model: "gpt-5.4-mini" }),
>   tools: [searchFlights, checkHotels],
>   checkpointer: new MemorySaver(),
> });
> ```
>
> **带进度卡片的 React 组件：**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { useStream } from "@langchain/langgraph-sdk/react";
>
> function TravelPlanner() {
>   const stream = useStream<typeof agent>({
>     assistantId: "travel-agent",
>     streamMode: ["values", "tools"],
>   });
>
>   const activeTools = stream.toolProgress.filter(
>     (t) => t.state === "starting" || t.state === "running"
>   );
>
>   return (
>     <div>
>       {stream.messages.map((msg) => (
>         <div key={msg.id}>{msg.content}</div>
>       ))}
>
>       {activeTools.map((tool) => {
>         const data = tool.data as {
>           message?: string;
>           progress?: number;
>           completed?: string[];
>         } | undefined;
>
>         return (
>           <div key={tool.toolCallId ?? tool.name}>
>             <strong>{tool.name}</strong>
>             {data?.message && <p>{data.message}</p>}
>             {data?.progress != null && (
>               <div style={{ width: "100%", background: "#eee" }}>
>                 <div
>                   style={{
>                     width: `${data.progress * 100}%`,
>                     background: "#4CAF50",
>                     height: 8,
>                     transition: "width 0.3s ease",
>                   }}
>                 />
>               </div>
>             )}
>             {data?.completed?.map((step, i) => (
>               <div key={i}>&#10003; {step}</div>
>             ))}
>           </div>
>         );
>       })}
>     </div>
>   );
> }
> ```

#### `tools` 与 `custom` 流模式的对比

两种流模式都可以呈现工具进度，但它们的用途不同：

* **`tools`**——自动发出结构化的生命周期事件（`on_tool_start`、`on_tool_event`、`on_tool_end`、`on_tool_error`），除了使用 `async function*` 之外，工具内部无需任何代码改动。`useStream` hook 开箱即提供响应式的 `toolProgress` 数组。
* **`custom`**——通过 `config.writer()` 让你完全控制发出什么数据以及何时发出。当你需要与工具生命周期不对应的自由格式数据，或想从节点（而不仅是工具）流式传输时，请使用它。

### 子图输出

要将[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)的输出包含在流式输出中，你可以在父图的 `.stream()` 方法中设置 `subgraphs: true`。这样会同时流式传输父图和所有子图的输出。

输出将以元组 `[namespace, data]` 的形式流式传输，其中 `namespace` 是包含子图调用节点路径的元组，例如 `["parent_node:<task_id>", "child_node:<task_id>"]`。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const chunk of await graph.stream(
  { foo: "foo" },
  {
    // Set subgraphs: true to stream outputs from subgraphs
    subgraphs: true,
    streamMode: "updates",
  }
)) {
  console.log(chunk);
}
```

> [!NOTE]
>
> 这适用于所有 `streamMode`，包括 `"messages"`。[`createAgent`](https://reference.langchain.com/javascript/langchain/index/createAgent) 返回的是一个 `ReactAgent` 包装对象；将其添加为节点时请传入 `agent.graph`，这样父图才会将其视为子图。使用 `subgraphs: true` 时，消息分块的形式是 `[namespace, [token, metadata]]`，因此你可以分辨它们来自哪个子图。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { createAgent } from "langchain";
> import { END, START, StateGraph } from "@langchain/langgraph";
>
> const agent = createAgent({ model, tools, stateSchema: State });
>
> const graph = new StateGraph(State)
>     .addNode("agent", agent.graph)
>     .addEdge(START, "agent")
>     .addEdge("agent", END)
>     .compile();
>
> for await (const [ns, data] of await graph.stream(
>     { messages: [{ role: "user", content: "..." }] },
>     {
>         streamMode: "messages",
>         subgraphs: true, // [!code highlight]
>     }
> )) {
>     const [token, metadata] = data;
>     console.log(ns, token, metadata);
> }
> ```

> **扩展示例：从子图流式传输**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, START } from "@langchain/langgraph";
> import { z } from "zod/v4";
>
> // Define subgraph
> const SubgraphState = new StateSchema({
>   foo: z.string(), // note that this key is shared with the parent graph state
>   bar: z.string(),
> });
>
> const subgraphBuilder = new StateGraph(SubgraphState)
>   .addNode("subgraphNode1", (state) => {
>     return { bar: "bar" };
>   })
>   .addNode("subgraphNode2", (state) => {
>     return { foo: state.foo + state.bar };
>   })
>   .addEdge(START, "subgraphNode1")
>   .addEdge("subgraphNode1", "subgraphNode2");
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
> const graph = builder.compile();
>
> for await (const chunk of await graph.stream(
>   { foo: "foo" },
>   {
>     streamMode: "updates",
>     // Set subgraphs: true to stream outputs from subgraphs
>     subgraphs: true,
>   }
> )) {
>   console.log(chunk);
> }
> ```
>
> ```
> [[], {'node1': {'foo': 'hi! foo'}}]
> [['node2:dfddc4ba-c3c5-6887-5012-a243b5b377c2'], {'subgraphNode1': {'bar': 'bar'}}]
> [['node2:dfddc4ba-c3c5-6887-5012-a243b5b377c2'], {'subgraphNode2': {'foo': 'hi! foobar'}}]
> [[], {'node2': {'foo': 'hi! foobar'}}]
> ```
>
> **注意**，我们收到的不仅是节点更新，还包括命名空间，它告诉我们正在从哪个图（或子图）流式传输。

### 调试

使用 `debug` 流模式可以在图执行过程中尽可能多地流式传输信息。流式输出包含节点名称以及完整状态。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const chunk of await graph.stream(
  { topic: "ice cream" },
  { streamMode: "debug" }
)) {
  console.log(chunk);
}
```

### 同时使用多个模式

你可以将数组作为 `streamMode` 参数传入，从而同时流式传输多个模式。

流式输出将是 `[mode, chunk]` 元组，其中 `mode` 是流模式的名称，`chunk` 是该模式流式传输的数据。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for await (const [mode, chunk] of await graph.stream(inputs, {
  streamMode: ["updates", "custom"],
})) {
  console.log(chunk);
}
```

## 进阶

### 与任意 LLM 配合使用

你可以使用 `streamMode: "custom"` 来流式传输来自**任意 LLM API** 的数据——即使该 API **并未**实现 LangChain 的聊天模型接口。

这让你可以集成提供自有流式接口的原始 LLM 客户端或外部服务，使 LangGraph 在自定义配置下具有高度灵活性。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, GraphNode, StateSchema } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({ result: z.string() });

const callArbitraryModel: GraphNode<typeof State> = async (state, config) => {
  // Example node that calls an arbitrary model and streams the output
  // Assume you have a streaming client that yields chunks
  // Generate LLM tokens using your custom streaming client
  for await (const chunk of yourCustomStreamingClient(state.topic)) {
    // Use the writer to send custom data to the stream
    config.writer({ custom_llm_chunk: chunk });
  }
  return { result: "completed" };
};

const graph = new StateGraph(State)
  .addNode("callArbitraryModel", callArbitraryModel)
  // Add other nodes and edges as needed
  .compile();

// Set streamMode: "custom" to receive the custom data in the stream
for await (const chunk of await graph.stream(
  { topic: "cats" },
  { streamMode: "custom" }
)) {
  // The chunk will contain the custom data streamed from the llm
  console.log(chunk);
}
```

> **扩展示例：流式传输任意聊天模型**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, LangGraphRunnableConfig } from "@langchain/langgraph";
> import { tool } from "@langchain/core/tools";
> import * as z from "zod";
> import OpenAI from "openai";
>
> const openaiClient = new OpenAI();
> const modelName = "gpt-5.4-mini";
>
> async function* streamTokens(modelName: string, messages: any[]) {
>   const response = await openaiClient.chat.completions.create({
>     messages,
>     model: modelName,
>     stream: true,
>   });
>
>   let role: string | null = null;
>   for await (const chunk of response) {
>     const delta = chunk.choices[0]?.delta;
>
>     if (delta?.role) {
>       role = delta.role;
>     }
>
>     if (delta?.content) {
>       yield { role, content: delta.content };
>     }
>   }
> }
>
> // this is our tool
> const getItems = tool(
>   async (input, config: LangGraphRunnableConfig) => {
>     let response = "";
>     for await (const msgChunk of streamTokens(
>       modelName,
>       [
>         {
>           role: "user",
>           content: `Can you tell me what kind of items i might find in the following place: '${input.place}'. List at least 3 such items separating them by a comma. And include a brief description of each item.`,
>         },
>       ]
>     )) {
>       response += msgChunk.content;
>       config.writer?.(msgChunk);
>     }
>     return response;
>   },
>   {
>     name: "get_items",
>     description: "Use this tool to list items one might find in a place you're asked about.",
>     schema: z.object({
>       place: z.string().describe("The place to look up items for."),
>     }),
>   }
> );
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const callTool: GraphNode<typeof State> = async (state) => {
>   const aiMessage = state.messages.at(-1);
>   const toolCall = aiMessage.tool_calls?.at(-1);
>
>   const functionName = toolCall?.function?.name;
>   if (functionName !== "get_items") {
>     throw new Error(`Tool ${functionName} not supported`);
>   }
>
>   const functionArguments = toolCall?.function?.arguments;
>   const args = JSON.parse(functionArguments);
>
>   const functionResponse = await getItems.invoke(args);
>   const toolMessage = {
>     tool_call_id: toolCall.id,
>     role: "tool",
>     name: functionName,
>     content: functionResponse,
>   };
>   return { messages: [toolMessage] };
> };
>
> const graph = new StateGraph(State)
>   // this is the tool-calling graph node
>   .addNode("callTool", callTool)
>   .addEdge(START, "callTool")
>   .compile();
> ```
>
> 让我们用一个包含工具调用的 [`AIMessage`](https://reference.langchain.com/javascript/langchain-core/messages/AIMessage) 来调用该图：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> const inputs = {
>   messages: [
>     {
>       content: null,
>       role: "assistant",
>       tool_calls: [
>         {
>           id: "1",
>           function: {
>             arguments: '{"place":"bedroom"}',
>             name: "get_items",
>           },
>           type: "function",
>         }
>       ],
>     }
>   ]
> };
>
> for await (const chunk of await graph.stream(
>   inputs,
>   { streamMode: "custom" }
> )) {
>   console.log(chunk.content + "|");
> }
> ```

### 为特定聊天模型禁用流式传输

如果你的应用混合使用支持流式传输与不支持流式传输的模型，你可能需要为不支持流式传输的模型显式禁用它。

初始化模型时设置 `streaming: false`。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-5.5",
  // Set streaming: false to disable streaming for the chat model
  streaming: false,
});
```

> [!NOTE]
>
> 并非所有聊天模型集成都支持 `streaming` 参数。如果你的模型不支持，请改用 `disableStreaming: true`。该参数通过基类在所有聊天模型上可用。

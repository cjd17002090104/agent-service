> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/add-memory.md

# 记忆

AI 应用需要[记忆](https://docs.langchain.com/oss/javascript/concepts/memory.md)来在多次交互之间共享上下文。在 LangGraph 中，你可以添加两类记忆：

* [添加短期记忆](#add-short-term-memory)，作为智能体[状态](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#state)的一部分，以支持多轮对话。
* [添加长期记忆](#add-long-term-memory)，用于跨会话存储用户特定或应用级数据。

## 添加短期记忆

**短期**记忆（线程级[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)）使智能体能够跟踪多轮对话。要添加短期记忆：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MemorySaver, StateGraph } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

const builder = new StateGraph(...);
const graph = builder.compile({ checkpointer });

await graph.invoke(
  { messages: [{ role: "user", content: "hi! i am Bob" }] },
  { configurable: { thread_id: "1" } }
);
```

### 在生产环境中使用

生产环境中，请使用由数据库支撑的检查点写入器：

**Postgres**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const DB_URI = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
const checkpointer = PostgresSaver.fromConnString(DB_URI);

const builder = new StateGraph(...);
const graph = builder.compile({ checkpointer });
```

**MongoDB**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";

const client = new MongoClient("mongodb://user:password@localhost:27017");
const checkpointer = new MongoDBSaver({ client });

const builder = new StateGraph(...);
const graph = builder.compile({ checkpointer });
```

> **示例：使用 Postgres 检查点写入器**
>
> ```
> npm install @langchain/langgraph-checkpoint-postgres
> ```
>
> > [!TIP]
> >
> > 首次使用 Postgres 检查点写入器时，你需要调用 `checkpointer.setup()`
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
> import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatAnthropic({ model: "claude-haiku-4-5-20251001" });
>
> const DB_URI = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
> const checkpointer = PostgresSaver.fromConnString(DB_URI);
> // await checkpointer.setup();
>
> const callModel: GraphNode<typeof State> = async (state) => {
>   const response = await model.invoke(state.messages);
>   return { messages: [response] };
> };
>
> const builder = new StateGraph(State)
>   .addNode("call_model", callModel)
>   .addEdge(START, "call_model");
>
> const graph = builder.compile({ checkpointer });
>
> const config = {
>   configurable: {
>     thread_id: "1"
>   }
> };
>
> const stream1 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "hi! I'm bob" }] },
>   { ...config, version: "v3" }
> );
> for await (const snapshot of stream1.values) {
>   console.log(snapshot);
> }
>
> const stream2 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "what's my name?" }] },
>   { ...config, version: "v3" }
> );
> for await (const snapshot of stream2.values) {
>   console.log(snapshot);
> }
> ```

> **示例：使用 MongoDB 检查点写入器**
>
> ```
> npm install @langchain/langgraph-checkpoint-mongodb
> ```
>
> > [!TIP]
> >
> > **配置**
> > 要使用 `MongoDBSaver`，你需要一个 MongoDB 集群。如果还没有，请按照[本指南](https://www.mongodb.com/docs/guides/atlas/cluster/)创建集群。如需面向智能体的完整演练，参见[使用 MongoDB Atlas 实现短期记忆](https://docs.langchain.com/oss/javascript/integrations/memory/mongodb-short-term-memory)。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
> import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
> import { MongoClient } from "mongodb";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatAnthropic({ model: "claude-haiku-4-5-20251001" });
>
> const client = new MongoClient("mongodb://user:password@localhost:27017");
> const checkpointer = new MongoDBSaver({ client, dbName: "langgraph" });
>
> const callModel: GraphNode<typeof State> = async (state) => {
>   const response = await model.invoke(state.messages);
>   return { messages: [response] };
> };
>
> const builder = new StateGraph(State)
>   .addNode("call_model", callModel)
>   .addEdge(START, "call_model");
>
> const graph = builder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "1" } };
>
> const stream1 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "hi! I'm bob" }] },
>   { ...config, version: "v3" }
> );
> for await (const snapshot of stream1.values) {
>   console.log(snapshot);
> }
>
> const stream2 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "what's my name?" }] },
>   { ...config, version: "v3" }
> );
> for await (const snapshot of stream2.values) {
>   console.log(snapshot);
> }
> ```

### 在子图中使用

如果你的图包含[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)，你只需在编译父图时提供检查点写入器。LangGraph 会自动将检查点写入器传播到子图。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START, MemorySaver } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({ foo: z.string() });

const subgraphBuilder = new StateGraph(State)
  .addNode("subgraph_node_1", (state) => {
    return { foo: state.foo + "bar" };
  })
  .addEdge(START, "subgraph_node_1");
const subgraph = subgraphBuilder.compile();

const builder = new StateGraph(State)
  .addNode("node_1", subgraph)
  .addEdge(START, "node_1");

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });
```

你可以配置子图专属的检查点行为。关于包含中断支持与有状态延续在内的各持久化级别的详情，参见[子图持久化](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md#subgraph-persistence)。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const subgraphBuilder = new StateGraph(...);
const subgraph = subgraphBuilder.compile({ checkpointer: true });  // [!code highlight]
```

## 添加长期记忆

使用长期记忆可以在多次对话之间存储用户特定或应用特定的数据。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { InMemoryStore, StateGraph } from "@langchain/langgraph";

const store = new InMemoryStore();

const builder = new StateGraph(...);
const graph = builder.compile({ store });
```

### 在节点内访问存储

一旦你用存储编译了图，LangGraph 就会自动将该存储注入到节点函数中。推荐的访问方式是通过 `Runtime` 对象。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
import { v7 as uuid7 } from "uuid";

const State = new StateSchema({
  messages: MessagesValue,
});

const callModel: GraphNode<typeof State> = async (state, runtime) => {
  const userId = runtime.context?.userId;
  const namespace = [userId, "memories"];

  // Search for relevant memories
  const memories = await runtime.store?.search(namespace, {
    query: state.messages.at(-1)?.content,
    limit: 3,
  });
  const info = memories?.map((d) => d.value.data).join("\n") || "";

  // ... Use memories in model call

  // Store a new memory
  await runtime.store?.put(namespace, uuid7(), { data: "User prefers dark mode" });
};

const builder = new StateGraph(State)
  .addNode("call_model", callModel)
  .addEdge(START, "call_model");
const graph = builder.compile({ store });

// Pass context at invocation time
await graph.invoke(
  { messages: [{ role: "user", content: "hi" }] },
  { configurable: { thread_id: "1" }, context: { userId: "1" } }
);
```

### 在生产环境中使用

生产环境中，请使用由数据库支撑的存储：

**Postgres**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";

const DB_URI = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
const store = PostgresStore.fromConnString(DB_URI);

const builder = new StateGraph(...);
const graph = builder.compile({ store });
```

**MongoDB**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";

const MONGODB_URI = "mongodb://user:password@localhost:27017";
const store = await MongoDBStore.fromConnString(MONGODB_URI, {
  dbName: "langgraph",
  collectionName: "store",
});

const builder = new StateGraph(...);
const graph = builder.compile({ store });
```

> **示例：使用 Postgres 存储**
>
> ```
> npm install @langchain/langgraph-checkpoint-postgres
> ```
>
> > [!TIP]
> >
> > 首次使用 Postgres 存储时，你需要调用 `store.setup()`
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
> import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
> import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
>
> import { v7 as uuid7 } from "uuid";
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatAnthropic({ model: "claude-haiku-4-5-20251001" });
>
> const callModel: GraphNode<typeof State> = async (state, runtime) => {
>   const userId = runtime.context?.userId;
>   const namespace = ["memories", userId];
>   const memories = await runtime.store?.search(namespace, { query: state.messages.at(-1)?.content });
>   const info = memories?.map(d => d.value.data).join("\n") || "";
>   const systemMsg = `You are a helpful assistant talking to the user. User info: ${info}`;
>
>   // Store new memories if the user asks the model to remember
>   const lastMessage = state.messages.at(-1);
>   if (lastMessage?.content?.toLowerCase().includes("remember")) {
>     const memory = "User name is Bob";
>     await runtime.store?.put(namespace, uuid7(), { data: memory });
>   }
>
>   const response = await model.invoke([
>     { role: "system", content: systemMsg },
>     ...state.messages
>   ]);
>   return { messages: [response] };
> };
>
> const DB_URI = "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";
>
> const store = PostgresStore.fromConnString(DB_URI);
> const checkpointer = PostgresSaver.fromConnString(DB_URI);
> // await store.setup();
> // await checkpointer.setup();
>
> const builder = new StateGraph(State)
>   .addNode("call_model", callModel)
>   .addEdge(START, "call_model");
>
> const graph = builder.compile({
>   checkpointer,
>   store,
> });
>
> const stream1 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "Hi! Remember: my name is Bob" }] },
>   { configurable: { thread_id: "1" }, context: { userId: "1" }, version: "v3" }
> );
> for await (const snapshot of stream1.values) {
>   console.log(snapshot);
> }
>
> const stream2 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "what is my name?" }] },
>   { configurable: { thread_id: "2" }, context: { userId: "1" }, version: "v3" }
> );
> for await (const snapshot of stream2.values) {
>   console.log(snapshot);
> }
> ```

> **示例：使用 MongoDB 存储**
>
> ```
> npm install @langchain/langgraph-checkpoint-mongodb
> ```
>
> > [!TIP]
> >
> > 如需面向智能体的完整演练，参见[使用 MongoDB Atlas 实现长期记忆](https://docs.langchain.com/oss/javascript/integrations/memory/mongodb-long-term-memory)。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatAnthropic } from "@langchain/anthropic";
> import { MemorySaver, StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
> import { MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";
>
> import { v7 as uuid7 } from "uuid";
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });
>
> const callModel: GraphNode<typeof State> = async (state, runtime) => {
>   const userId = runtime.context?.userId;
>   const namespace = ["memories", userId];
>   const memories = await runtime.store?.search(namespace);
>   const info = memories?.map(d => d.value.data).join("\n") || "n/a";
>   const systemMsg = `You are a helpful assistant talking to the user. User info: ${info}`;
>
>   // Store new memories if the user asks the model to remember
>   const lastMessage = state.messages.at(-1);
>   if (lastMessage?.content?.toLowerCase().includes("remember")) {
>     const memory = "User name is Bob";
>     await runtime.store?.put(namespace, uuid7(), { data: memory });
>   }
>
>   const response = await model.invoke([
>     { role: "system", content: systemMsg },
>     ...state.messages
>   ]);
>   return { messages: [response] };
> };
>
> const MONGODB_URI = "mongodb://user:password@localhost:27017";
>
> const store = await MongoDBStore.fromConnString(MONGODB_URI, {
>   dbName: "langgraph",
>   collectionName: "store",
> });
>
> const checkpointer = new MemorySaver();
>
> const builder = new StateGraph(State)
>   .addNode("call_model", callModel)
>   .addEdge(START, "call_model");
>
> const graph = builder.compile({ checkpointer, store });
>
> const stream1 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "Hi! Remember: my name is Bob" }] },
>   { configurable: { thread_id: "1" }, context: { userId: "1" }, version: "v3" }
> );
> for await (const snapshot of stream1.values) {
>   console.log(snapshot);
> }
>
> const stream2 = await graph.streamEvents(
>   { messages: [{ role: "user", content: "what is my name?" }] },
>   { configurable: { thread_id: "2" }, context: { userId: "1" }, version: "v3" }
> );
> for await (const snapshot of stream2.values) {
>   console.log(snapshot);
> }
> ```

### 使用语义搜索

在图的内存存储中启用语义搜索，可让图智能体按语义相似度搜索存储中的条目。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { OpenAIEmbeddings } from "@langchain/openai";
import { InMemoryStore } from "@langchain/langgraph";

// Create store with semantic search enabled
const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
const store = new InMemoryStore({
  index: {
    embeddings,
    dims: 1536,
  },
});

await store.put(["user_123", "memories"], "1", { text: "I love pizza" });
await store.put(["user_123", "memories"], "2", { text: "I am a plumber" });

const items = await store.search(["user_123", "memories"], {
  query: "I'm hungry",
  limit: 1,
});
```

> [!TIP]
>
> `InMemoryStore` 适合开发环境。生产环境请使用持久化存储，例如 `PostgresStore`、`MongoDBStore` 或 `RedisStore`。

> **带语义搜索的长期记忆**
>
> **InMemoryStore**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, InMemoryStore } from "@langchain/langgraph";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatOpenAI({ model: "gpt-5.4-mini" });
>
> // Create store with semantic search enabled
> const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
> const store = new InMemoryStore({
>   index: {
>     embeddings,
>     dims: 1536,
>   }
> });
>
> await store.put(["user_123", "memories"], "1", { text: "I love pizza" });
> await store.put(["user_123", "memories"], "2", { text: "I am a plumber" });
>
> const chat: GraphNode<typeof State> = async (state, runtime) => {
>   // Search based on user's last message
>   const items = await runtime.store.search(
>     ["user_123", "memories"],
>     { query: state.messages.at(-1)?.content, limit: 2 }
>   );
>   const memories = items.map(item => item.value.text).join("\n");
>   const memoriesText = memories ? `## Memories of user\n${memories}` : "";
>
>   const response = await model.invoke([
>     { role: "system", content: `You are a helpful assistant.\n${memoriesText}` },
>     ...state.messages,
>   ]);
>
>   return { messages: [response] };
> };
>
> const builder = new StateGraph(State)
>   .addNode("chat", chat)
>   .addEdge(START, "chat");
> const graph = builder.compile({ store });
>
> const stream = await graph.streamEvents(
>   { messages: [{ role: "user", content: "I'm hungry" }] },
>   { version: "v3" }
> );
> for await (const message of stream.messages) {
>   for await (const token of message.text) {
>     process.stdout.write(token);
>   }
> }
> ```
>
> **MongoDB（手动嵌入）**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
> import { MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatOpenAI({ model: "gpt-5.4-mini" });
>
> // Create store with semantic search enabled
> const MONGODB_URI = "mongodb://user:password@localhost:27017";
> const store = await MongoDBStore.fromConnString(MONGODB_URI, {
>   dbName: "langgraph",
>   collectionName: "store",
>   embeddings: new OpenAIEmbeddings({ model: "text-embedding-3-small" }),
>   indexConfig: {
>     name: "store_vector_index",
>     dims: 1536,
>     embeddingKey: "text",
>   },
> });
>
> await store.put(["user_123", "memories"], "1", { text: "I love pizza" });
> await store.put(["user_123", "memories"], "2", { text: "I am a plumber" });
>
> const chat: GraphNode<typeof State> = async (state, runtime) => {
>   // Search based on user's last message
>   const items = await runtime.store.search(
>     ["user_123", "memories"],
>     { query: state.messages.at(-1)?.content, limit: 2 }
>   );
>   const memories = items.map(item => item.value.text).join("\n");
>   const memoriesText = memories ? `## Memories of user\n${memories}` : "";
>
>   const response = await model.invoke([
>     { role: "system", content: `You are a helpful assistant.\n${memoriesText}` },
>     ...state.messages,
>   ]);
>
>   return { messages: [response] };
> };
>
> const builder = new StateGraph(State)
>   .addNode("chat", chat)
>   .addEdge(START, "chat");
> const graph = builder.compile({ store });
>
> const stream = await graph.streamEvents(
>   { messages: [{ role: "user", content: "I'm hungry" }] },
>   { version: "v3" }
> );
> for await (const message of stream.messages) {
>   for await (const token of message.text) {
>     process.stdout.write(token);
>   }
> }
> ```
>
> **MongoDB（自动嵌入）**
>
> > [!NOTE]
> >
> > 自动嵌入需要 MongoDB Atlas。MongoDB 通过 Voyage AI 在服务端生成嵌入。更多信息参见[自动嵌入文档](https://www.mongodb.com/docs/atlas/atlas-vector-search/automated-embedding/)。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START } from "@langchain/langgraph";
> import { MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";
> import { ChatOpenAI } from "@langchain/openai";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatOpenAI({ model: "gpt-5.4-mini" });
>
> // Auto embedding: no embeddings instance needed.
> // Configure the Voyage AI model and the field path MongoDB will read server-side.
> const MONGODB_URI = "mongodb://user:password@localhost:27017";
> const store = await MongoDBStore.fromConnString(MONGODB_URI, {
>   dbName: "langgraph",
>   collectionName: "store",
>   indexConfig: {
>     name: "store_vector_index",
>     path: "value.content",  // MongoDB reads this field and embeds it server-side
>     model: "voyage-4",      // Voyage AI model used by MongoDB Atlas
>   },
> });
>
> // Values must have the content field matching the configured path (value.content)
> await store.put(["user_123", "memories"], "1", { content: "I love pizza" });
> await store.put(["user_123", "memories"], "2", { content: "I am a plumber" });
>
> const chat: GraphNode<typeof State> = async (state, runtime) => {
>   // MongoDB generates the query embedding server-side
>   const items = await runtime.store.search(
>     ["user_123", "memories"],
>     { query: state.messages.at(-1)?.content, limit: 2 }
>   );
>   const memories = items.map(item => item.value.content).join("\n");
>   const memoriesText = memories ? `## Memories of user\n${memories}` : "";
>
>   const response = await model.invoke([
>     { role: "system", content: `You are a helpful assistant.\n${memoriesText}` },
>     ...state.messages,
>   ]);
>
>   return { messages: [response] };
> };
>
> const builder = new StateGraph(State)
>   .addNode("chat", chat)
>   .addEdge(START, "chat");
> const graph = builder.compile({ store });
>
> const stream = await graph.streamEvents(
>   { messages: [{ role: "user", content: "I'm hungry" }] },
>   { version: "v3" }
> );
> for await (const message of stream.messages) {
>   for await (const token of message.text) {
>     process.stdout.write(token);
>   }
> }
> ```

## 管理短期记忆

启用[短期记忆](#add-short-term-memory)后，很长的对话可能超出 LLM 的上下文窗口。常见的解决方案有：

* [裁剪消息](#trim-messages)：移除开头或结尾的 N 条消息（在调用 LLM 之前）
* 从 LangGraph 状态中[永久删除消息](#delete-messages)
* [总结消息](#summarize-messages)：将历史中较早的消息总结后替换为一条摘要
* [管理检查点](#manage-checkpoints)以存储和检索消息历史
* 自定义策略（例如消息过滤等）

这样，智能体就能在不超过 LLM 上下文窗口的前提下跟踪对话。

### 裁剪消息

大多数 LLM 都有支持的最大上下文窗口（以 token 计）。决定何时截断消息的一种方法是统计消息历史中的 token 数，并在接近该上限时截断。如果你使用 LangChain，可以使用裁剪消息工具，指定要保留的 token 数量，以及处理边界的 `strategy`（例如保留最后 `maxTokens` 个 token）。

要裁剪消息历史，请使用 [`trimMessages`](https://reference.langchain.com/javascript/langchain-core/messages/trimMessages) 函数：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { trimMessages } from "@langchain/core/messages";
import { StateSchema, MessagesValue, GraphNode } from "@langchain/langgraph";

const State = new StateSchema({
  messages: MessagesValue,
});

const callModel: GraphNode<typeof State> = async (state) => {
  const messages = trimMessages(state.messages, {
    strategy: "last",
    maxTokens: 128,
    startOn: "human",
    endOn: ["human", "tool"],
  });
  const response = await model.invoke(messages);
  return { messages: [response] };
};

const builder = new StateGraph(State)
  .addNode("call_model", callModel);
  // ...
```

> **完整示例：裁剪消息**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { trimMessages } from "@langchain/core/messages";
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, MemorySaver } from "@langchain/langgraph";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });
>
> const callModel: GraphNode<typeof State> = async (state) => {
>   const messages = trimMessages(state.messages, {
>     strategy: "last",
>     maxTokens: 128,
>     startOn: "human",
>     endOn: ["human", "tool"],
>     tokenCounter: model,
>   });
>   const response = await model.invoke(messages);
>   return { messages: [response] };
> };
>
> const checkpointer = new MemorySaver();
> const builder = new StateGraph(State)
>   .addNode("call_model", callModel)
>   .addEdge(START, "call_model");
> const graph = builder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "1" } };
> await graph.invoke({ messages: [{ role: "user", content: "hi, my name is bob" }] }, config);
> await graph.invoke({ messages: [{ role: "user", content: "write a short poem about cats" }] }, config);
> await graph.invoke({ messages: [{ role: "user", content: "now do the same but for dogs" }] }, config);
> const finalResponse = await graph.invoke({ messages: [{ role: "user", content: "what's my name?" }] }, config);
>
> console.log(finalResponse.messages.at(-1)?.content);
> ```
>
> ```
> Your name is Bob, as you mentioned when you first introduced yourself.
> ```

### 删除消息

你可以从图状态中删除消息以管理消息历史。当你想要移除特定消息或清空整个消息历史时，这很有用。

要从图状态中删除消息，你可以使用 `RemoveMessage`。要让 `RemoveMessage` 生效，你需要使用带 [`messagesStateReducer`](https://reference.langchain.com/javascript/langchain-langgraph/index/messagesStateReducer) [归约器](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers)的状态键，例如 `MessagesValue`。

删除特定消息：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { RemoveMessage } from "@langchain/core/messages";

const deleteMessages = (state) => {
  const messages = state.messages;
  if (messages.length > 2) {
    // remove the earliest two messages
    return {
      messages: messages
        .slice(0, 2)
        .map((m) => new RemoveMessage({ id: m.id })),
    };
  }
};
```

> [!WARNING]
>
> 删除消息时，**务必确保**结果消息历史是有效的。请查阅你所使用 LLM 提供方的限制。例如：
>
> * 某些提供方要求消息历史以 `user` 消息开头
> * 大多数提供方要求带有工具调用的 `assistant` 消息后面必须跟随对应的 `tool` 结果消息。

> **完整示例：删除消息**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { RemoveMessage } from "@langchain/core/messages";
> import { ChatAnthropic } from "@langchain/anthropic";
> import { StateGraph, StateSchema, MessagesValue, GraphNode, START, MemorySaver } from "@langchain/langgraph";
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });
>
> const deleteMessages: GraphNode<typeof State> = (state) => {
>   const messages = state.messages;
>   if (messages.length > 2) {
>     // remove the earliest two messages
>     return { messages: messages.slice(0, 2).map(m => new RemoveMessage({ id: m.id })) };
>   }
>   return {};
> };
>
> const callModel: GraphNode<typeof State> = async (state) => {
>   const response = await model.invoke(state.messages);
>   return { messages: [response] };
> };
>
> const builder = new StateGraph(State)
>   .addNode("call_model", callModel)
>   .addNode("delete_messages", deleteMessages)
>   .addEdge(START, "call_model")
>   .addEdge("call_model", "delete_messages");
>
> const checkpointer = new MemorySaver();
> const app = builder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "1" } };
>
> const stream1 = await app.streamEvents(
>   { messages: [{ role: "user", content: "hi! I'm bob" }] },
>   { ...config, version: "v3" }
> );
> for await (const snapshot of stream1.values) {
>   console.log(snapshot.messages.map(message => [message.getType(), message.content]));
> }
>
> const stream2 = await app.streamEvents(
>   { messages: [{ role: "user", content: "what's my name?" }] },
>   { ...config, version: "v3" }
> );
> for await (const snapshot of stream2.values) {
>   console.log(snapshot.messages.map(message => [message.getType(), message.content]));
> }
> ```
>
> ```
> [['human', "hi! I'm bob"]]
> [['human', "hi! I'm bob"], ['ai', 'Hi Bob! How are you doing today? Is there anything I can help you with?']]
> [['human', "hi! I'm bob"], ['ai', 'Hi Bob! How are you doing today? Is there anything I can help you with?'], ['human', "what's my name?"]]
> [['human', "hi! I'm bob"], ['ai', 'Hi Bob! How are you doing today? Is there anything I can help you with?'], ['human', "what's my name?"], ['ai', 'Your name is Bob.']]
> [['human', "what's my name?"], ['ai', 'Your name is Bob.']]
> ```

### 总结消息

如上所示，裁剪或删除消息的问题在于，从消息队列中剔除内容可能会丢失信息。因此，一些应用受益于更精细的做法：使用聊天模型对消息历史进行总结。

![摘要](https://mintcdn.com/langchain-5e9cc07a/ybiAaBfoBvFquMDz/oss/images/summary.png?fit=max\&auto=format\&n=ybiAaBfoBvFquMDz\&q=85\&s=c8ed3facdccd4ef5c7e52902c72ba938)

可以使用提示与编排逻辑来总结消息历史。例如，在 LangGraph 中，你可以在状态里除了 `messages` 键之外再加一个 `summary` 键：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue, GraphNode } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  messages: MessagesValue,
  summary: z.string().optional(),
});
```

然后，你可以生成聊天历史的摘要，并将已有的摘要作为下一次总结的上下文。这个 `summarizeConversation` 节点可以在 `messages` 状态键中累积了一定数量的消息之后被调用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { RemoveMessage, HumanMessage } from "@langchain/core/messages";

const summarizeConversation: GraphNode<typeof State> = async (state) => {
  // First, we get any existing summary
  const summary = state.summary || "";

  // Create our summarization prompt
  let summaryMessage: string;
  if (summary) {
    // A summary already exists
    summaryMessage =
      `This is a summary of the conversation to date: ${summary}\n\n` +
      "Extend the summary by taking into account the new messages above:";
  } else {
    summaryMessage = "Create a summary of the conversation above:";
  }

  // Add prompt to our history
  const messages = [
    ...state.messages,
    new HumanMessage({ content: summaryMessage })
  ];
  const response = await model.invoke(messages);

  // Delete all but the 2 most recent messages
  const deleteMessages = state.messages
    .slice(0, -2)
    .map(m => new RemoveMessage({ id: m.id }));

  return {
    summary: response.content,
    messages: deleteMessages
  };
};
```

> **完整示例：总结消息**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { ChatAnthropic } from "@langchain/anthropic";
> import {
>   SystemMessage,
>   HumanMessage,
>   RemoveMessage,
> } from "@langchain/core/messages";
> import {
>   StateGraph,
>   StateSchema,
>   MessagesValue,
>   GraphNode,
>   ConditionalEdgeRouter,
>   START,
>   END,
>   MemorySaver,
> } from "@langchain/langgraph";
> import * as z from "zod";
>
> import { v7 as uuid7 } from "uuid";
> const memory = new MemorySaver();
>
> // We will add a `summary` attribute (in addition to `messages` key)
> const GraphState = new StateSchema({
>   messages: MessagesValue,
>   summary: z.string().default(""),
> });
>
> // We will use this model for both the conversation and the summarization
> const model = new ChatAnthropic({ model: "claude-haiku-4-5-20251001" });
>
> // Define the logic to call the model
> const callModel: GraphNode<typeof GraphState> = async (state) => {
>   // If a summary exists, we add this in as a system message
>   const { summary } = state;
>   let { messages } = state;
>   if (summary) {
>     const systemMessage = new SystemMessage({
>       id: uuid7(),
>       content: `Summary of conversation earlier: ${summary}`,
>     });
>     messages = [systemMessage, ...messages];
>   }
>   const response = await model.invoke(messages);
>   // We return an object, because this will get added to the existing state
>   return { messages: [response] };
> };
>
> // We now define the logic for determining whether to end or summarize the conversation
> const shouldContinue: ConditionalEdgeRouter<{ InputSchema: typeof GraphState; Nodes: "summarize_conversation" }> = (state) => {
>   const messages = state.messages;
>   // If there are more than six messages, then we summarize the conversation
>   if (messages.length > 6) {
>     return "summarize_conversation";
>   }
>   // Otherwise we can just end
>   return END;
> };
>
> const summarizeConversation: GraphNode<typeof GraphState> = async (state) => {
>   // First, we summarize the conversation
>   const { summary, messages } = state;
>   let summaryMessage: string;
>   if (summary) {
>     // If a summary already exists, we use a different system prompt
>     // to summarize it than if one didn't
>     summaryMessage =
>       `This is summary of the conversation to date: ${summary}\n\n` +
>       "Extend the summary by taking into account the new messages above:";
>   } else {
>     summaryMessage = "Create a summary of the conversation above:";
>   }
>
>   const allMessages = [
>     ...messages,
>     new HumanMessage({ id: uuid7(), content: summaryMessage }),
>   ];
>
>   const response = await model.invoke(allMessages);
>
>   // We now need to delete messages that we no longer want to show up
>   // I will delete all but the last two messages, but you can change this
>   const deleteMessages = messages
>     .slice(0, -2)
>     .map((m) => new RemoveMessage({ id: m.id! }));
>
>   if (typeof response.content !== "string") {
>     throw new Error("Expected a string response from the model");
>   }
>
>   return { summary: response.content, messages: deleteMessages };
> };
>
> // Define a new graph
> const workflow = new StateGraph(GraphState)
>   // Define the conversation node and the summarize node
>   .addNode("conversation", callModel)
>   .addNode("summarize_conversation", summarizeConversation)
>   // Set the entrypoint as conversation
>   .addEdge(START, "conversation")
>   // We now add a conditional edge
>   .addConditionalEdges(
>     // First, we define the start node. We use `conversation`.
>     // This means these are the edges taken after the `conversation` node is called.
>     "conversation",
>     // Next, we pass in the function that will determine which node is called next.
>     shouldContinue,
>   )
>   // We now add a normal edge from `summarize_conversation` to END.
>   // This means that after `summarize_conversation` is called, we end.
>   .addEdge("summarize_conversation", END);
>
> // Finally, we compile it!
> const app = workflow.compile({ checkpointer: memory });
> ```

### 管理检查点

你可以查看和删除检查点写入器所存储的信息。

#### 查看线程状态

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "1",
    // optionally provide an ID for a specific checkpoint,
    // otherwise the latest checkpoint is shown
    // checkpoint_id: "1f029ca3-1f5b-6704-8004-820c16b69a5a"
  },
};
await graph.getState(config);
```

```
{
  values: { messages: [HumanMessage(...), AIMessage(...), HumanMessage(...), AIMessage(...)] },
  next: [],
  config: { configurable: { thread_id: '1', checkpoint_ns: '', checkpoint_id: '1f029ca3-1f5b-6704-8004-820c16b69a5a' } },
  metadata: {
    source: 'loop',
    writes: { call_model: { messages: AIMessage(...) } },
    step: 4,
    parents: {},
    thread_id: '1'
  },
  createdAt: '2025-05-05T16:01:24.680462+00:00',
  parentConfig: { configurable: { thread_id: '1', checkpoint_ns: '', checkpoint_id: '1f029ca3-1790-6b0a-8003-baf965b6a38f' } },
  tasks: [],
  interrupts: []
}
```

#### 查看线程历史

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "1",
  },
};

const history = [];
for await (const state of graph.getStateHistory(config)) {
  history.push(state);
}
```

#### 删除线程的所有检查点

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const threadId = "1";
await checkpointer.deleteThread(threadId);
```

## 数据库管理

如果你使用任何由数据库支撑的持久化实现（例如 Postgres、Redis 或 Oracle）来存储短期和/或长期记忆，那么在与数据库配合使用之前，你需要运行迁移来建立所需模式（schema）。

按照惯例，大多数数据库专用库会在检查点写入器或存储实例上定义一个 `setup()` 方法，用于运行所需的迁移。不过，你应当查阅你具体实现的 [`BaseCheckpointSaver`](https://reference.langchain.com/javascript/langchain-langgraph/index/BaseCheckpointSaver) 或 [`BaseStore`](https://reference.langchain.com/javascript/langchain-core/stores/BaseStore)，以确认确切的方法名和用法。

我们建议将迁移作为专门的部署步骤来运行，或者确保它们在服务器启动时运行。

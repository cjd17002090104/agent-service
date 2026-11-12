> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/stores.md

# 存储

> LangGraph 存储提供跨线程的长期记忆，与按线程的检查点保存器持久化能力互为补充。

存储让智能体能够跨线程持久化信息，包括用户偏好、累积的知识，以及应超越单次对话而保留的事实。与[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md)（它保存作用域限定在单个线程内的完整图状态）不同，存储保存的是可从任意线程访问的任意键值数据。

![共享状态模型](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/shared_state.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=354526fb48c5eb11b4b2684a2df40d6c)

> [!NOTE]
>
> **Agent Server 会自动处理存储**
> 使用 [Agent Server](https://docs.langchain.com/langsmith/agent-server.md) 时，你无需手动实现或配置存储。API 会在后台为你处理所有存储基础设施。

> [!NOTE]
>
> [InMemoryStore](https://reference.langchain.com/javascript/langchain-core/stores/InMemoryStore) 适用于开发和测试。生产环境请使用持久化存储，例如 `PostgresStore`、`MongoDBStore`、`RedisStore` 或 `UpstashStore`。所有实现都继承自 [BaseStore](https://reference.langchain.com/javascript/langchain-core/stores/BaseStore)，这也是在节点函数签名中应使用的类型标注。

> [!NOTE]
>
> 完整的可用提供方列表请参阅[存储集成](https://docs.langchain.com/oss/javascript/integrations/long-term-memory/index.md)。

## 基本用法

以下代码片段展示了在不使用 LangGraph 的情况下单独使用 [InMemoryStore](https://reference.langchain.com/javascript/langchain-core/stores/InMemoryStore)：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { InMemoryStore } from "@langchain/langgraph";

const memoryStore = new InMemoryStore();
```

记忆按 `tuple` 划分命名空间，在下面的示例中为 `(<user_id>, "memories")`。命名空间可以是任意长度、表示任意含义，不必与用户相关。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const userId = "1";
const namespaceForMemory = [userId, "memories"];
```

使用 `store.put` 方法把记忆保存到存储中的命名空间。指定上面定义的命名空间，以及记忆的键值对：键只是记忆的唯一标识符（`memory_id`），值（一个字典）就是记忆本身。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { v7 as uuid7 } from "uuid";
const memoryId = uuid7();
const memory = { food_preference: "I like pizza" };
await memoryStore.put(namespaceForMemory, memoryId, memory);
```

使用 `store.search` 方法从命名空间中读取记忆，它会以列表形式返回给定用户的记忆，数量最多为 `limit` 参数指定的值（默认 `10`）。对于 `InMemoryStore`，条目按插入顺序返回，因此最近的记忆位于列表末尾；其他后端可能以不同方式排序记忆（见[列出命名空间中的条目](#listing-items-in-a-namespace)）。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const memories = await memoryStore.search(namespaceForMemory);
memories[memories.length - 1];

// {
//   value: { food_preference: 'I like pizza' },
//   key: '07e0caf4-1631-47b7-b15f-65515d4c1843',
//   namespace: ['1', 'memories'],
//   createdAt: '2024-10-02T17:22:31.590602+00:00',
//   updatedAt: '2024-10-02T17:22:31.590605+00:00'
// }
```

它具有以下属性：

* `value`：该记忆的值

* `key`：该命名空间内该记忆的唯一键

* `namespace`：一个字符串元组，即该记忆类型的命名空间

  > [!NOTE]
  >
  > 虽然类型是 `tuple`，但在转换为 JSON 时可能会被序列化为列表（例如 `['1', 'memories']`）。

* `createdAt`：该记忆创建时的时间戳

* `updatedAt`：该记忆更新时的时间戳

## 列出命名空间中的条目

在不传 `query` 也不传 `filter` 的情况下调用 `store.search`，会返回存储在该命名空间前缀下的条目，数量最多为 `limit`。当你不需要语义排序时，可以用它来枚举某个命名空间中的所有内容。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Return up to 100 items stored under ["alice", "memories"].
const items = await store.search(["alice", "memories"], { limit: 100 });
```

有三点行为需要留意：

* **`namespace_prefix` 按前缀匹配，而不是精确匹配。** `("alice",)` 也会返回 `("alice", "memories")`、`("alice", "preferences")` 等下的条目。若要限制在单一层级，请传入完整命名空间，或在客户端按 `item.namespace` 过滤返回的条目。
* **超出 `limit` 的结果会被静默截断。** 没有溢出信号——请把 `limit` 设为高于你预期的最大值，或使用 `offset` 分页。
* **默认排序取决于存储后端。** `PostgresStore` 和 `AsyncPostgresStore` 按 `updated_at` 降序返回结果（最近更新的在前）。`InMemoryStore` 按插入顺序返回结果（最近插入的在最后）。不要依赖跨实现一致的排序；如果顺序很重要，请在客户端按 `item.updated_at` 排序。

要分页遍历大型命名空间：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const pageSize = 50;
let offset = 0;
while (true) {
  const page = await store.search(["alice", "memories"], { limit: pageSize, offset });
  if (page.length === 0) break;
  for (const item of page) {
    // ...
  }
  offset += pageSize;
}
```

要发现存在哪些命名空间（例如，在列出每个用户的记忆之前先遍历所有用户），请使用 `store.listNamespaces`：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// All namespaces that start with ["alice"], truncated to two levels deep.
const namespaces = await store.listNamespaces({ prefix: ["alice"], maxDepth: 2 });
```

## 语义搜索

除了简单的检索之外，存储还支持语义搜索，允许你基于含义而非精确匹配来查找记忆。要启用它，请为存储配置一个嵌入模型：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { OpenAIEmbeddings } from "@langchain/openai";

const store = new InMemoryStore({
  index: {
    embeddings: new OpenAIEmbeddings({ model: "text-embedding-3-small" }),
    dims: 1536,
    fields: ["food_preference", "$"], // Fields to embed
  },
});
```

现在搜索时，你可以使用自然语言查询来查找相关记忆：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Find memories about food preferences
// (This can be done after putting memories into the store)
const memories = await store.search(namespaceForMemory, {
  query: "What does the user like to eat?",
  limit: 3, // Return top 3 matches
});
```

你可以通过配置 `fields` 参数，或在存储记忆时指定 `index` 参数，来控制记忆的哪些部分会被嵌入：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Store with specific fields to embed
await store.put(
  namespaceForMemory,
  uuid7(),
  {
    food_preference: "I love Italian cuisine",
    context: "Discussing dinner plans",
  },
  { index: ["food_preference"] } // Only embed "food_preferences" field
);

import { v7 as uuid7 } from "uuid";
// Store without embedding (still retrievable, but not searchable)
await store.put(
  namespaceForMemory,
  uuid7(),
  { system_info: "Last updated: 2024-01-01" },
  { index: false }
);
```

## 在 LangGraph 中使用

`memoryStore` 与检查点保存器协同工作：如前所述，检查点保存器把状态保存到线程，而 `memoryStore` 允许你存储任意信息以便*跨*线程访问。同时使用检查点保存器和 `memoryStore` 编译图，如下所示。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MemorySaver } from "@langchain/langgraph";

// We need this because we want to enable threads (conversations)
const checkpointer = new MemorySaver();

// ... Define the graph ...

// Compile the graph with the checkpointer and store
const graph = workflow.compile({ checkpointer, store: memoryStore });
```

然后像之前一样用 `thread_id` 调用图，同时传入 `user_id`，它和之前一样充当该特定用户记忆的命名空间。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Invoke the graph
const userId = "1";
const config = { configurable: { thread_id: "1" }, context: { userId } };

// First let's just say hi to the AI
for await (const update of await graph.stream(
  { messages: [{ role: "user", content: "hi" }] },
  { ...config, streamMode: "updates" }
)) {
  console.log(update);
}
```

你可以从*任意节点*通过 `runtime` 参数访问存储和 `userId`。可以用它来保存记忆：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue, Runtime } from "@langchain/langgraph";
import { v7 as uuid7 } from "uuid";

const MessagesState = new StateSchema({
  messages: MessagesValue,
});

const updateMemory: GraphNode<typeof MessagesState> = async (state, runtime) => {
  // Get the user id from the config
  const userId = runtime.context?.user_id;
  if (!userId) throw new Error("User ID is required");

  // Namespace the memory
  const namespace = [userId, "memories"];

  // ... Analyze conversation and create a new memory
  const memory = "Some memory content";

  // Create a new memory ID
  const memoryId = uuid7();

  // We create a new memory
  await runtime.store?.put(namespace, memoryId, { memory });
};
```

你也可以从任意节点访问存储，并使用 `store.search` 方法获取记忆。记忆以对象列表形式返回，可以转换为字典。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
memories[memories.length - 1];
// {
//   value: { food_preference: 'I like pizza' },
//   key: '07e0caf4-1631-47b7-b15f-65515d4c1843',
//   namespace: ['1', 'memories'],
//   createdAt: '2024-10-02T17:22:31.590602+00:00',
//   updatedAt: '2024-10-02T17:22:31.590605+00:00'
// }
```

你获取这些记忆，并在模型调用中使用它们。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const callModel: GraphNode<typeof MessagesState> = async (state, runtime) => {
  // Get the user id from the config
  const userId = runtime.context?.user_id;

  // Namespace the memory
  const namespace = [userId, "memories"];

  // Search based on the most recent message
  const memories = await runtime.store?.search(namespace, {
    query: state.messages[state.messages.length - 1].content,
    limit: 3,
  });
  const info = memories.map((d) => d.value.memory).join("\n");

  // ... Use memories in the model call
};
```

如果你创建新线程，只要 `user_id` 相同，你仍然可以访问相同的记忆。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Invoke the graph
const config = { configurable: { thread_id: "2" }, context: { userId: "1" } };

// Let's say hi again
for await (const update of await graph.stream(
  { messages: [{ role: "user", content: "hi, tell me about my memories" }] },
  { ...config, streamMode: "updates" }
)) {
  console.log(update);
}
```

当你在本地（例如在 [Studio](https://docs.langchain.com/langsmith/studio.md) 中）或[托管环境](https://docs.langchain.com/langsmith/platform-setup.md)中使用 LangSmith 时，基础存储默认可用，你无需在图编译时指定它。不过，若要启用语义搜索，你**确实**需要在 `langgraph.json` 文件中配置索引设置。例如：

```json theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
    ...
    "store": {
        "index": {
            "embed": "openai:text-embeddings-3-small",
            "dims": 1536,
            "fields": ["$"]
        }
    }
}
```

更多细节和配置选项请参阅[部署指南](https://docs.langchain.com/langsmith/semantic-search.md)。

### 后续步骤

* [为 Agent Server 添加自定义存储](https://docs.langchain.com/langsmith/custom-store.md) —— 部署你的实现
* [检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md) —— 线程作用域内的状态持久化

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md

# 检查点保存器

> LangGraph 检查点保存器在每一步把图状态保存为检查点，从而实现持久化、人在环路和容错执行。

检查点保存器（checkpointer）在每个超步保存一份图状态快照，并按**线程**组织。使用检查点保存器编译图，即可启用人在环路工作流、时间旅行调试、容错执行和对话记忆。

![检查点](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/checkpoints.jpg?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=966566aaae853ed4d240c2d0d067467c)

> [!NOTE]
>
> **Agent Server 会自动处理检查点**
> 使用 [Agent Server](https://docs.langchain.com/langsmith/agent-server.md) 时，你无需手动实现或配置检查点保存器。服务器会在后台为你处理所有持久化基础设施。

> [!TIP]
>
> 借助 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-checkpointers) 可以追踪检查点状态，并调试你的智能体如何跨会话恢复。请参考[追踪快速开始](https://docs.langchain.com/langsmith/trace-with-langgraph.md)完成设置。

## 为什么需要检查点保存器

以下功能需要检查点保存器：

* **人在环路**：检查点保存器通过允许人查看、中断并批准图步骤来支持[人在环路工作流](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)。这些工作流需要检查点保存器，因为人必须能够查看图在任意时刻的状态，而图必须能够在人对状态做出任何更新之后恢复执行。示例请参阅[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)。
* **记忆**：检查点保存器允许在多次交互之间保留[“记忆”](https://docs.langchain.com/oss/javascript/concepts/memory.md)。在重复的人际交互（例如对话）中，任何后续消息都可以发送到该线程，而线程会保留对之前交互的记忆。关于如何使用检查点保存器添加和管理对话记忆，请参阅[添加记忆](https://docs.langchain.com/oss/javascript/langgraph/add-memory.md)。
* **时间旅行**：检查点保存器支持[“时间旅行”](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md)，允许用户重放先前的图执行，以查看和/或调试特定的图步骤。此外，检查点保存器还使在任意检查点分叉图状态、探索不同轨迹成为可能。
* **容错**：检查点提供容错与错误恢复能力：如果某个超步上一个或多个节点失败，你可以从上一个成功的步骤重新启动图。

- **待处理写入**：当某个图节点在给定的[超步](#super-steps)执行中途失败时，LangGraph 会保存该超步上其他已成功完成的节点所产生的待处理检查点写入。当你从该超步恢复图执行时，无需重新运行那些已成功的节点。

## 核心概念

### 线程

线程是检查点保存器保存的每个检查点所分配的唯一 ID 或线程标识符。它包含一系列[运行](https://docs.langchain.com/langsmith/runs.md)累积的状态。当一次运行被执行时，助手底层图的[状态](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#state)会被持久化到该线程。

使用检查点保存器调用图时，你**必须**在配置的 `configurable` 部分指定 `thread_id`：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  configurable: {
    thread_id: "1";
  }
}
```

线程的当前状态和历史状态都可以被获取。要持久化状态，必须在线程执行某次运行之前创建该线程。LangSmith API 提供了多个用于创建和管理线程及线程状态的端点。更多详情请参阅 [API 参考](https://reference.langchain.com/python/langsmith/)。

检查点保存器使用 `thread_id` 作为存储和检索检查点的主键。没有它，检查点保存器就无法保存状态，也无法在[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)之后恢复执行，因为检查点保存器依赖 `thread_id` 来加载已保存的状态。

### 检查点

线程在某一特定时间点的状态称为检查点。检查点是在每个[超步](#super-steps)保存的图状态快照，由 `StateSnapshot` 对象表示（完整字段参考见 [StateSnapshot 字段](#statesnapshot-fields)）。

#### 超步

LangGraph 在每个**超步**边界创建一个检查点。超步是图的一个“时钟节拍”，在该步中调度的所有节点会（可能并行地）执行。对于像 `START -> A -> B -> END` 这样的顺序图，输入、节点 A 和节点 B 各自有独立的超步——每执行一步之后都会产生一个检查点。理解超步边界对[时间旅行](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md)很重要，因为你只能从检查点（即超步边界）恢复执行。

除了超步检查点之外，LangGraph 还会在**节点（任务）级别**持久化写入。当超步中的每个节点完成时，它的输出会作为任务条目写入检查点保存器的 `checkpoint_writes` 表，并与进行中的检查点关联。正是这些按任务的写入实现了[待处理写入](#pending-writes)恢复：如果同一超步中的另一个节点失败，已成功节点的写入已经是持久化的，在恢复时无需重新运行。随后在整个超步完成时提交完整的状态快照。

LangGraph 还会持久化一个超步内各个节点执行产生的写入。这些写入以任务形式存储，并用于容错：如果同一超步中的另一个节点失败，恢复时无需重新计算已成功节点的写入。这些任务写入不是完整的 `StateSnapshot` 检查点，因此时间旅行仍从超步边界处的完整检查点恢复。

检查点会被持久化，并可在之后用于恢复线程的状态。

下面看看当一个简单图按如下方式被调用时会保存哪些检查点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, START, END, MemorySaver } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  foo: z.string(),
  bar: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.array(z.string()),
      reducer: (x, y) => x.concat(y),
    }
  ),
});

const workflow = new StateGraph(State)
  .addNode("nodeA", (state) => {
    return { foo: "a", bar: ["a"] };
  })
  .addNode("nodeB", (state) => {
    return { foo: "b", bar: ["b"] };
  })
  .addEdge(START, "nodeA")
  .addEdge("nodeA", "nodeB")
  .addEdge("nodeB", END);

const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });

const config = { configurable: { thread_id: "1" } };
await graph.invoke({ foo: "", bar: [] }, config);
```

运行该图之后，将恰好有 4 个检查点：

* 空检查点，下一个要执行的节点是 [`START`](https://reference.langchain.com/javascript/langchain-langgraph/index/START)
* 包含用户输入 `{'foo': '', 'bar': []}`、下一个要执行的节点是 `nodeA` 的检查点
* 包含 `nodeA` 的输出 `{'foo': 'a', 'bar': ['a']}`、下一个要执行的节点是 `nodeB` 的检查点
* 包含 `nodeB` 的输出 `{'foo': 'b', 'bar': ['a', 'b']}`、没有下一个要执行节点的检查点

注意 `bar` 通道的值包含两个节点的输出，因为此示例为 `bar` 通道配置了 reducer。

#### 检查点命名空间

每个检查点都有一个 `checkpoint_ns`（检查点命名空间）字段，用于标识它属于哪个图或子图：

* **`""`**（空字符串）：该检查点属于父（根）图。
* **`"node_name:uuid"`**：该检查点属于作为给定节点被调用的子图。对于嵌套子图，命名空间以 `|` 分隔符连接（例如 `"outer_node:uuid|inner_node:uuid"`）。

你可以在节点内部通过配置访问检查点命名空间：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { RunnableConfig } from "@langchain/core/runnables";

function myNode(state: typeof State.Type, config: RunnableConfig) {
  const checkpointNs = config.configurable?.checkpoint_ns;
  // "" for the parent graph, "node_name:uuid" for a subgraph
}
```

关于处理子图状态和检查点的更多细节，请参阅[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)。

## 获取和更新状态

### 获取状态

与已保存的图状态交互时，你**必须**指定一个[线程标识符](#threads)。你可以调用 `graph.getState(config)` 查看图的*最新*状态。这会返回一个 `StateSnapshot` 对象，它对应配置中所提供线程 ID 关联的最新检查点；如果提供了检查点 ID，则对应该线程中与该检查点 ID 关联的检查点。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// get the latest state snapshot
const config = { configurable: { thread_id: "1" } };
await graph.getState(config);

// get a state snapshot for a specific checkpoint_id
const config = {
  configurable: {
    thread_id: "1",
    checkpoint_id: "1ef663ba-28fe-6528-8002-5a559208592c",
  },
};
await graph.getState(config);
```

在本示例中，`getState` 的输出如下所示：

```
StateSnapshot {
  values: { foo: 'b', bar: ['a', 'b'] },
  next: [],
  config: {
    configurable: {
      thread_id: '1',
      checkpoint_ns: '',
      checkpoint_id: '1ef663ba-28fe-6528-8002-5a559208592c'
    }
  },
  metadata: {
    source: 'loop',
    writes: { nodeB: { foo: 'b', bar: ['b'] } },
    step: 2
  },
  createdAt: '2024-08-29T19:19:38.821749+00:00',
  parentConfig: {
    configurable: {
      thread_id: '1',
      checkpoint_ns: '',
      checkpoint_id: '1ef663ba-28f9-6ec4-8001-31981c2c39f8'
    }
  },
  tasks: []
}
```

#### StateSnapshot 字段

| 字段 | 类型 | 说明 |
| - | - | - |
| `values` | `object` | 该检查点处的状态通道值。 |
| `next` | `string[]` | 接下来要执行的节点名称。空的 `[]` 表示图已完成。 |
| `config` | `object` | 包含 `thread_id`、`checkpoint_ns` 和 `checkpoint_id`。 |
| `metadata` | `object` | 执行元数据。包含 `source`（`"input"`、`"loop"` 或 `"update"`）、`writes`（节点输出）和 `step`（超步计数器）。 |
| `createdAt` | `string` | 该检查点创建时间的 ISO 8601 时间戳。 |
| `parentConfig` | `object \| null` | 上一个检查点的配置。第一个检查点为 `null`。 |
| `tasks` | `PregelTask[]` | 该步要执行的任务。每个任务有 `id`、`name`、`error`、`interrupts`，以及可选的 `state`（使用 `subgraphs: true` 时的子图快照）。 |

### 获取状态历史

你可以调用 `graph.getStateHistory(config)` 获取给定线程的完整图执行历史。这会返回与该配置中所提供线程 ID 关联的 `StateSnapshot` 对象列表。重要的是，检查点按时间顺序排列，最近的检查点 / `StateSnapshot` 位于列表最前面。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };
for await (const state of graph.getStateHistory(config)) {
  console.log(state);
}
```

在本示例中，`getStateHistory` 的输出如下所示：

```
[
  StateSnapshot {
    values: { foo: 'b', bar: ['a', 'b'] },
    next: [],
    config: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28fe-6528-8002-5a559208592c'
      }
    },
    metadata: {
      source: 'loop',
      writes: { nodeB: { foo: 'b', bar: ['b'] } },
      step: 2
    },
    createdAt: '2024-08-29T19:19:38.821749+00:00',
    parentConfig: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28f9-6ec4-8001-31981c2c39f8'
      }
    },
    tasks: []
  },
  StateSnapshot {
    values: { foo: 'a', bar: ['a'] },
    next: ['nodeB'],
    config: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28f9-6ec4-8001-31981c2c39f8'
      }
    },
    metadata: {
      source: 'loop',
      writes: { nodeA: { foo: 'a', bar: ['a'] } },
      step: 1
    },
    createdAt: '2024-08-29T19:19:38.819946+00:00',
    parentConfig: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28f4-6b4a-8000-ca575a13d36a'
      }
    },
    tasks: [
      PregelTask {
        id: '6fb7314f-f114-5413-a1f3-d37dfe98ff44',
        name: 'nodeB',
        error: null,
        interrupts: []
      }
    ]
  },
  StateSnapshot {
    values: { foo: '', bar: [] },
    next: ['node_a'],
    config: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28f4-6b4a-8000-ca575a13d36a'
      }
    },
    metadata: {
      source: 'loop',
      writes: null,
      step: 0
    },
    createdAt: '2024-08-29T19:19:38.817813+00:00',
    parentConfig: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28f0-6c66-bfff-6723431e8481'
      }
    },
    tasks: [
      PregelTask {
        id: 'f1b14528-5ee5-579c-949b-23ef9bfbed58',
        name: 'node_a',
        error: null,
        interrupts: []
      }
    ]
  },
  StateSnapshot {
    values: { bar: [] },
    next: ['__start__'],
    config: {
      configurable: {
        thread_id: '1',
        checkpoint_ns: '',
        checkpoint_id: '1ef663ba-28f0-6c66-bfff-6723431e8481'
      }
    },
    metadata: {
      source: 'input',
      writes: { foo: '' },
      step: -1
    },
    createdAt: '2024-08-29T19:19:38.816205+00:00',
    parentConfig: null,
    tasks: [
      PregelTask {
        id: '6d27aa2e-d72b-5504-a36f-8620e54a76dd',
        name: '__start__',
        error: null,
        interrupts: []
      }
    ]
  }
]
```

![状态](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/get_state.jpg?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=38ffff52be4d8806b287836295a3c058)

#### 查找特定检查点

你可以对状态历史进行过滤，以查找符合特定条件的检查点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const history: StateSnapshot[] = [];
for await (const state of graph.getStateHistory(config)) {
  history.push(state);
}

// Find the checkpoint before a specific node executed
const beforeNodeB = history.find((s) => s.next.includes("nodeB"));

// Find a checkpoint by step number
const step2 = history.find((s) => s.metadata.step === 2);

// Find checkpoints created by updateState
const forks = history.filter((s) => s.metadata.source === "update");

// Find the checkpoint where an interrupt occurred
const interrupted = history.find(
  (s) => s.tasks.length > 0 && s.tasks.some((t) => t.interrupts.length > 0)
);
```

### 重放

重放会从先前的检查点重新执行步骤。用先前的 `checkpoint_id` 调用图，即可重新运行该检查点之后的节点。该检查点之前的节点会被跳过（它们的结果已经保存）。该检查点之后的节点会重新执行，包括任何 LLM 调用、API 请求或[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)——中断在重放期间总是会被重新触发。

关于重放以往执行的完整细节和代码示例，请参阅[时间旅行](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md)。

![重放](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/re_play.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=d7b34b85c106e55d181ae1f4afb50251)

### 更新状态

你可以使用 `graph.updateState()` 编辑图状态。这会用更新后的值创建一个新检查点——它不会修改原始检查点。该更新与节点更新被同等对待：如果定义了 [reducer](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers) 函数，值会经过这些函数处理，因此带 reducer 的通道会*累积*值，而不是覆盖它们。

你可以选择指定 `asNode`，以控制该更新被视为来自哪个节点，这会影响接下来执行哪个节点。详情请参阅[时间旅行：`asNode`](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel#from-a-specific-node)。

![更新](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/checkpoints_full_story.jpg?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=a52016b2c44b57bd395d6e1eac47aa36)

## 持久化模式

LangGraph 支持三种持久化模式，让你在性能和数据一致性之间取得平衡。你可以在调用任何图执行方法时指定持久化模式：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
await graph.stream(
  { input: "test" },
  { durability: "sync" }
)
```

持久化模式从最不持久到最持久依次为：

* `"exit"`：LangGraph 仅在图执行退出时持久化变更——无论是成功退出、因错误退出，还是因人在环路中断而退出。这为长时间运行的图提供了最佳性能，但意味着中间状态不会被保存，因此你无法从执行中途的系统故障（例如进程崩溃）中恢复。
* `"async"`：LangGraph 在下一步执行的同时异步持久化变更。这提供了良好的性能和持久性，但如果进程在执行期间崩溃，LangGraph 存在未写入检查点的少量风险。
* `"sync"`：LangGraph 在下一步开始之前同步持久化变更。这确保 LangGraph 在继续执行之前写入每个检查点，以一定的性能开销换取高持久性。

## 优化检查点存储

## 检查点保存器库

在底层，检查点由符合 [`BaseCheckpointSaver`](https://reference.langchain.com/javascript/langchain-langgraph/index/BaseCheckpointSaver) 接口的检查点保存器对象提供支持。LangGraph 提供多种检查点保存器实现，全部通过独立的、可安装的库实现。

* `@langchain/langgraph-checkpoint`：检查点保存器（[`BaseCheckpointSaver`](https://reference.langchain.com/javascript/langchain-langgraph/index/BaseCheckpointSaver)）的基础接口，以及序列化/反序列化接口（[`SerializerProtocol`](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint/SerializerProtocol)）。包含用于实验的内存检查点保存器实现（[`MemorySaver`](https://reference.langchain.com/javascript/langchain-langgraph/index/MemorySaver)）。LangGraph 自带 `@langchain/langgraph-checkpoint`。
* `@langchain/langgraph-checkpoint-sqlite`：使用 SQLite 数据库的 LangGraph 检查点保存器实现（[`SqliteSaver`](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-sqlite/SqliteSaver)）。非常适合实验和本地工作流。需要单独安装。
* `@langchain/langgraph-checkpoint-postgres`：使用 Postgres 数据库的高级检查点保存器（[`PostgresSaver`](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-postgres/index/PostgresSaver)），在 LangSmith 中使用。非常适合生产环境。需要单独安装。
* `@langchain/langgraph-checkpoint-mongodb`：由 MongoDB 支持的高级检查点保存器（`MongoDBSaver`）和长期记忆存储（`MongoDBStore`）。该存储支持跨线程持久化，并可选集成向量搜索。非常适合生产环境使用。需要单独安装。
* `@langchain/langgraph-checkpoint-redis`：使用 Redis 数据库的高级检查点保存器（`RedisSaver`）。非常适合生产环境使用。需要单独安装。

### 检查点保存器接口

每个检查点保存器都符合 [`BaseCheckpointSaver`](https://reference.langchain.com/javascript/langchain-langgraph/index/BaseCheckpointSaver) 接口，并实现以下方法：

* `.put` - 存储检查点及其配置和元数据。
* `.putWrites` - 存储与某个检查点关联的中间写入（即[待处理写入](#pending-writes)）。
* `.getTuple` - 根据给定配置（`thread_id` 和 `checkpoint_id`）获取检查点元组。它用于填充 `graph.getState()` 中的 `StateSnapshot`。
* `.list` - 列出符合给定配置和过滤条件的检查点。它用于填充 `graph.getStateHistory()` 中的状态历史。

## 构建自定义检查点保存器

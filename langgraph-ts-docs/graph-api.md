> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/graph-api.md

# 图 API 概览

> LangGraph 将智能体工作流建模为图：用 StateGraph 定义状态、节点和边，从而构建可循环、有状态的工作流。

## 图

从本质上讲，LangGraph 将智能体工作流建模为图。你通过三个关键组件来定义智能体的行为：

1. [`State`](#state)：一个共享数据结构，表示应用程序当前的快照。它可以是任意数据类型，但通常使用共享的状态模式来定义。

2. [`Nodes`](#nodes)：编码智能体逻辑的函数。它们接收当前状态作为输入，执行某种计算或副作用，并返回更新后的状态。

3. [`Edges`](#edges)：根据当前状态决定接下来执行哪个 `Node` 的函数。它们可以是条件分支，也可以是固定跳转。

通过组合 `Nodes` 和 `Edges`，你可以创建复杂、可循环、随时间演进状态的工作流。而真正的威力在于 LangGraph 如何管理这些状态。

需要强调的是：`Nodes` 和 `Edges` 不过是函数——它们可以包含 LLM，也可以只是普普通通的代码。

简而言之：*节点负责干活，边负责指明下一步做什么*。

LangGraph 底层的图算法使用[消息传递](https://en.wikipedia.org/wiki/Message_passing)来定义通用程序。当一个 Node 完成其操作后，它会沿一条或多条边向其他节点发送消息。这些接收节点随后执行各自的函数，把产生的消息传给下一批节点，如此继续。受 Google 的 [Pregel](https://research.google/pubs/pregel-a-system-for-large-scale-graph-processing/) 系统启发，该程序以离散的"超步"（super-step）推进。

一个超步可以看作对图中节点的一次迭代。并行运行的节点属于同一个超步，而顺序运行的节点属于不同的超步。在图执行开始时，所有节点都处于 `inactive` 状态。当某个节点在其任意入边（或"通道"）上收到新消息（状态）时，它就变为 `active`。随后该活跃节点运行其函数并返回更新。在每个超步结束时，没有收到消息的节点通过将自身标记为 `inactive` 来投票"暂停"（`halt`）。当所有节点都处于 `inactive` 且没有消息在传输时，图执行终止。

### StateGraph

[`StateGraph`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) 类是主要使用的图类。它由用户定义的 `State` 对象参数化。

### 编译你的图

要构建你的图，你首先定义[状态](#state)，然后添加[节点](#nodes)和[边](#edges)，最后编译它。编译图究竟是什么，为什么需要它？

编译是一个相当简单的步骤。它对图的结构提供一些基础检查（不存在孤立节点等）。你还可以在这里指定运行时参数，例如[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)和断点。只需调用 `.compile` 方法即可编译图：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = new StateGraph(StateAnnotation)
  .addNode("nodeA", nodeA)
  .addEdge(START, "nodeA")
  .addEdge("nodeA", END)
  .compile();
```

> [!WARNING]
>
> 在使用图之前，你**必须**先编译它。

## 状态

定义图时你做的第一件事就是定义图的 `State`。`State` 由[图的模式](#schema)以及[`reducer` 函数](#reducers)组成，后者规定了如何将更新应用到状态上。`State` 的模式将成为图中所有 `Nodes` 和 `Edges` 的输入模式。你使用 `StateSchema` 类来定义状态，它为各个字段接受任意[标准模式](https://standardschema.dev/)（如 [Zod](https://zod.dev/)），并支持 `ReducedValue` 和 `MessagesValue` 之类的特殊值类型。所有 `Nodes` 都会发出对 `State` 的更新，然后使用指定的 `reducer` 函数应用这些更新。

### 模式

指定图的模式的主要方式是使用 `StateSchema` 类。模式中的每个字段可以是：

* 用于简单字段的**标准模式**（成为"最后值"通道，更新时覆盖）
* 用于需要自定义 reducer 函数的字段的 **`ReducedValue`**（当节点并行运行时）
* 用于聊天消息列表的 **`MessagesValue`**（预置，带有消息感知的 reducer）
* 用于不应被写入检查点的临时状态的 **`UntrackedValue`**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateSchema,
  ReducedValue,
  MessagesValue,
  UntrackedValue
} from "@langchain/langgraph";
import { z } from "zod/v4";

const AgentState = new StateSchema({
  // Prebuilt messages value with built-in reducer
  messages: MessagesValue,

  // Simple fields use Zod schemas directly
  currentStep: z.string(),

  // Fields with defaults
  retryCount: z.number().default(0),

  // Custom reducer for accumulating values
  allSteps: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, newStep) => [...current, newStep],
    }
  ),

  // Transient state not saved to checkpoints
  tempCache: new UntrackedValue(z.record(z.string(), z.unknown())),
});

// Type extraction
type State = typeof AgentState.State;   // Full state type
type Update = typeof AgentState.Update; // Partial update type

// Use in graph
const graph = new StateGraph(AgentState)
  .addNode("myNode", ...)
  .compile();
```

默认情况下，图具有相同的输入和输出模式。如果你想改变这一点，也可以直接指定显式的输入和输出模式。当你有很多键、其中一些明确用于输入而另一些用于输出时，这很有用。

#### 多个模式

通常，图的所有节点都通过单一模式通信。这意味着它们会读写相同的状态通道。但有时我们希望对此有更多控制：

* 内部节点可以传递图输入/输出中不需要的信息。
* 我们可能还想为图使用不同的输入/输出模式。例如，输出可能只包含一个相关的输出键。

节点可以向图内部的私有状态通道写入数据，以实现内部节点间的通信。我们只需定义一个私有模式 `PrivateState`。

也可以为图定义显式的输入和输出模式。在这种情况下，我们定义一个"内部"模式，包含与图操作相关的*所有*键。同时，我们定义 `input` 和 `output` 模式，它们是"内部"模式的子集，用于约束图的输入和输出。详情参见[定义输入与输出模式](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#define-input-and-output-schemas)。

让我们看一个例子：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import * as z from "zod";

const InputState = new StateSchema({
  userInput: z.string(),
});

const OutputState = new StateSchema({
  graphOutput: z.string(),
});

const OverallState = new StateSchema({
  foo: z.string(),
  userInput: z.string(),
  graphOutput: z.string(),
});

const PrivateState = new StateSchema({
  bar: z.string(),
});

const graph = new StateGraph({
  state: OverallState,
  input: InputState,
  output: OutputState,
})
  .addNode("node1", (state) => {
    // Write to OverallState
    return { foo: state.userInput + " name" };
  })
  .addNode("node2", (state) => {
    // Read from OverallState, write to the private bar channel
    return { bar: state.foo + " is" };
  })
  .addNode(
    "node3",
    (state) => {
      // Read from the private bar channel, write to OutputState
      return { graphOutput: state.bar + " Lance" };
    },
    // This input schema declares what node3 reads and registers bar as a graph channel.
    { input: PrivateState },
  )
  .addEdge(START, "node1")
  .addEdge("node1", "node2")
  .addEdge("node2", "node3")
  .addEdge("node3", END)
  .compile();

await graph.invoke({ userInput: "My" });
// { graphOutput: 'My name is Lance' }
```

> **[查看示例追踪](https://smith.langchain.com/public/8fd9e17e-fd75-4829-a402-cb7e0bf18736/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

这里有两个微妙而重要的点需要注意：

1. 我们把 `state` 作为输入模式传给了 `node1`。但我们却向 `foo` 写入，而它是 `OverallState` 中的通道。我们怎么能向不包含在输入模式中的状态通道写入呢？这是因为节点*可以向图状态中的任意状态通道写入*。图状态是初始化时定义的所有状态通道的并集，其中包括 `OverallState` 以及作为过滤器的 `InputState` 和 `OutputState`。

2. 我们用 `StateGraph({ state: OverallState, input: InputState, output: OutputState })` 初始化了图。那么 `node2` 怎么就能向 `PrivateState` 写入呢？如果该模式没有在 `StateGraph` 初始化时传入，图又是如何获得它的访问权限的？我们能做到这一点，是因为*只要状态模式定义存在，节点也可以声明额外的状态通道*。在这个例子中，`PrivateState` 模式已经定义，因此我们可以把 `bar` 作为新的状态通道加入图中并向其写入。

> [!WARNING]
>
> **私有通道在流式传输时不会被隐去。**
>
> 输入、输出和私有模式约束了每个节点*读取*什么（其输入模式）以及 `invoke` *返回*什么（输出模式）。它们并**不会**在 `stream` 中隐藏通道。
>
> 当你使用 `streamMode: "values"` 进行流式传输时，图默认会发出**所有**状态通道——包括私有通道——因为值流式传输默认使用完整的通道集合，而不是输出模式。这就是为什么像 `bar` 这样的私有通道会被 `invoke` 隐藏，却在流式传输时可见：
>
> ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
> import * as z from "zod";
>
> const InputState = new StateSchema({
>   userInput: z.string(),
> });
>
> const OutputState = new StateSchema({
>   graphOutput: z.string(),
> });
>
> const OverallState = new StateSchema({
>   foo: z.string(),
>   userInput: z.string(),
>   graphOutput: z.string(),
> });
>
> const PrivateState = new StateSchema({
>   bar: z.string(),
> });
>
> const graph = new StateGraph({
>   state: OverallState,
>   input: InputState,
>   output: OutputState,
> })
>   .addNode("node1", (state) => {
>     return { foo: state.userInput + " name" };
>   })
>   .addNode("node2", (state) => {
>     return { bar: state.foo + " is" };
>   })
>   .addNode(
>     "node3",
>     (state) => {
>       return { graphOutput: state.bar + " Lance" };
>     },
>     { input: PrivateState },
>   )
>   .addEdge(START, "node1")
>   .addEdge("node1", "node2")
>   .addEdge("node2", "node3")
>   .addEdge("node3", END)
>   .compile();
>
> const stream = await graph.streamEvents({ userInput: "My" }, { version: "v3" });
> for await (const snapshot of stream.values) {
>   console.log(snapshot);
> }
> // { userInput: 'My' }
> // { foo: 'My name', userInput: 'My' }
> // { foo: 'My name', userInput: 'My', bar: 'My name is' }            // <-- private channel
> // { foo: 'My name', userInput: 'My', graphOutput: 'My name is Lance', bar: 'My name is' }
> ```
>
> > **[查看示例追踪](https://smith.langchain.com/public/32188285-dc90-4281-b140-d3bbf033748c/r)**
> >
> > 打开该示例的公开 LangSmith 运行记录。
>
> 要将流式输出的值限制为特定通道集合（例如只保留输出模式），请传入 `outputKeys`：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> const stream = await graph.streamEvents(
>   { userInput: "My" },
>   { version: "v3", outputKeys: ["graphOutput"] }  // [!code highlight]
> );
> for await (const snapshot of stream.values) {
>   console.log(snapshot);
> }
> // { graphOutput: 'My name is Lance' }
> ```
>
> 如果你只需要每个步骤中节点实际产生的通道（而不是完整的累积状态），请改用 `streamMode: "updates"`。

### reducer

reducer 是理解节点更新如何应用到 `State` 的关键。`State` 中的每个键都有各自独立的 reducer 函数。如果没有显式指定 reducer 函数，则假定对该键的所有更新都应覆盖它。reducer 有几种不同类型，首先是默认的 reducer 类型：

#### reducer 参数

每个 reducer 都是一个二元函数，接受两个位置参数：

* **左参数**：该键在状态中已存储的当前值。
* **右参数**：节点返回的该键的更新。

当节点返回部分更新时，LangGraph 会为每个被更新的键调用 reducer，并将返回值保存为新的状态值：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const newValue = reducer(currentState[key], nodeUpdate[key]); // left, right
```

左参数始终来自累积的状态。右参数始终来自最新的节点更新。下面的例子显式命名了这两个参数：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ReducedValue, StateSchema } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  tags: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      reducer: (left: string[], right: string[]) => {
        // left: existing state; right: update from a node
        return left.concat(right);
      },
    }
  ),
});
```

> **[查看示例追踪](https://smith.langchain.com/public/c4537752-96b4-4e3a-832b-9733d2486e85/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

假设状态是 `{ tags: ["draft"] }`，某个节点返回 `{ tags: ["review"] }`。LangGraph 会调用：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const reducer = (left: string[], right: string[]) => left.concat(right);

reducer(["draft"], ["review"]); // left, right → ["draft", "review"]
```

`tags` 的新状态值为 `["draft", "review"]`。

自定义 reducer 会组合左参数和右参数。[默认 reducer](#default-reducer) 则丢弃左参数，只保留右参数。

#### 默认 reducer

默认 reducer 忽略左参数，用右参数替换状态值。下面的例子展示了如何使用默认 reducer：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  foo: z.number(),
  bar: z.array(z.string()),
});
```

> **[查看示例追踪](https://smith.langchain.com/public/62bd5fab-0acd-46c3-9689-42a37da3c7f5/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

在这个例子中，没有为任何键指定 reducer 函数。假设图的输入是：

`{ foo: 1, bar: ["hi"] }`。再假设第一个 `Node` 返回 `{ foo: 2 }`。这会被视为对状态的一次更新。注意 `Node` 不需要返回完整的 `State` 模式——只需返回更新即可。应用该更新后，`State` 变为 `{ foo: 2, bar: ["hi"] }`。如果第二个节点返回 `{ bar: ["bye"] }`，那么 `State` 会变为 `{ foo: 2, bar: ["bye"] }`。

#### 自定义 reducer

自定义 reducer 会组合左参数和右参数，而不是替换状态值，这对于累积值（例如向列表追加更新）很有用。下面的例子展示了如何指定自定义 reducer：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  foo: z.number(),
  bar: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
});
```

> **[查看示例追踪](https://smith.langchain.com/public/e9ae6a10-b6dc-49c9-bb16-5f307b57d2e4/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

在这个例子中，我们使用 `ReducedValue` 为第二个键（`bar`）指定了 reducer 函数。注意第一个键保持不变。假设图的输入是 `{ foo: 1, bar: ["hi"] }`。再假设第一个 `Node` 返回 `{ foo: 2 }`。这会被视为对状态的一次更新。注意 `Node` 不需要返回完整的 `State` 模式——只需返回更新即可。应用该更新后，`State` 变为 `{ foo: 2, bar: ["hi"] }`。如果第二个节点返回 `{ bar: ["bye"] }`，那么 `State` 会变为 `{ foo: 2, bar: ["hi", "bye"] }`。注意这里 `bar` 键是通过将两个数组拼接来更新的。

#### 重置 reducer 字段

使用 reducer 时一个常见的困惑来源：对于合并型 reducer，返回空值**不会**清空该字段。因为 reducer 会把右参数合并进左参数，空更新会被合并进来，此前累积的值仍然保留。

这种模式对错误缓冲区或重试计数器很重要——它们必须在重试之间被清空：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  errors: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (state: string[], update: string[]) => state.concat(update) },
  ),
});

// node A returns { errors: ["bad sql"] }
// node B returns { errors: [] }
// state.errors is still ["bad sql"]; the empty array is merged in, not cleared
```

> **[查看示例追踪](https://smith.langchain.com/public/3bb1b2e1-f021-488d-86ec-0b09f71b4d14/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

要让节点能够重置（清空）该字段，可以定义一个用替换代替合并的自定义 reducer：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  errors: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (_state: string[], update: string[]) => update }
  ),
});

// node can now clear the field with { errors: [] }
```

> **[查看示例追踪](https://smith.langchain.com/public/0ddacd70-2b42-4e9e-97c3-064e5c5d1f4d/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

或者，用 `Overwrite` 包装更新，以绕过单次更新的 reducer，同时对该字段的其他每次更新保留正常的合并行为：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Overwrite, ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  errors: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (state: string[], update: string[]) => state.concat(update) },
  ),
});

const clearErrors = (_state: typeof State.State) => {
  return { errors: new Overwrite([]) };
};

// node can clear the field with { errors: new Overwrite([]) }
// while a normal node can still append with { errors: ["new error"] }
```

更多信息参见[用 Overwrite 绕过 reducer](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#bypass-reducers-with-overwrite)。

### 未跟踪值

`UntrackedValue` 用于那些在图执行期间应存在、但**绝不应被写入检查点**的状态字段。当图从检查点恢复时，未跟踪的值会被重置为初始状态（或变得不可用）。

这适用于：

* 无法序列化的**数据库连接**
* 恢复时应重建的**临时缓存**
* 你不想持久化的**大对象**
* 每次都应全新传入的**仅运行时配置**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, UntrackedValue, MessagesValue } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  messages: MessagesValue,

  // Untracked: throws if multiple nodes write in same step (guard: true is default)
  dbConnection: new UntrackedValue<DatabaseConnection>(),

  // Untracked with guard: false allows multiple writes, keeps last value
  tempCache: new UntrackedValue(
    z.record(z.string(), z.unknown()),
    { guard: false }
  ),

  // Untracked without a schema (for maximum flexibility)
  runtimeConfig: new UntrackedValue(),
});
```

**行为：**

* 执行期间：值会像普通状态一样被存储和访问
* 写入检查点时：未跟踪的值被**排除**在检查点数据之外
* 恢复时：未跟踪的值从头开始（为空或使用其默认值）
* 使用 `guard: true`（默认）：如果多个节点在同一步写入，则抛出错误
* 使用 `guard: false`：允许多次写入，最后的值生效

> [!WARNING]
>
> 不要用 `UntrackedValue` 存放需要跨中断或时间旅行持久化的数据。持久化数据请使用常规状态字段或 `ReducedValue`。

### 类型工具

LangGraph 提供了若干类型工具，用于在定义节点和条件边时获得更好的 TypeScript 类型安全性。

#### `GraphNode`

使用 `GraphNode` 为在图构建器之外定义的节点函数标注类型：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { GraphNode, StateSchema, Command } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  count: z.number().default(0),
  result: z.string(),
});

// Basic node - receives state, returns partial update
const incrementNode: GraphNode<typeof State> = (state) => {
  return { count: state.count + 1 };
};

// Async node
const fetchNode: GraphNode<typeof State> = async (state, config) => {
  const response = await fetch(`/api/data/${state.count}`);
  return { result: await response.text() };
};

// Node with Command routing - specify valid destinations
const routerNode: GraphNode<{ InputSchema: typeof State; Nodes: "process" | "done" }> = (state) => {
  if (state.count >= 10) {
    return new Command({ goto: "done" });
  }
  return new Command({
    update: { count: state.count + 1 },
    goto: "process"
  });
};
```

#### `State.Node` 简写

每个 `StateSchema` 实例都有一个 `Node` 属性，可用于为节点标注类型的简写：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const State = new StateSchema({
  messages: MessagesValue,
  step: z.string(),
});

// These are equivalent:
const myNode1: GraphNode<typeof State> = (state) => ({ step: "done" });
const myNode2: typeof State.Node = (state) => ({ step: "done" });
```

#### `ConditionalEdgeRouter`

在条件边中为路由函数使用 `ConditionalEdgeRouter`（不更新状态，只做路由）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ConditionalEdgeRouter, END } from "@langchain/langgraph";

const State = new StateSchema({
  shouldContinue: z.boolean(),
  step: z.string(),
});

// Router returns node name(s) or END
const router: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "process" | "summarize" }> = (state) => {
  if (!state.shouldContinue) {
    return END;
  }
  return state.step === "initial" ? "process" : "summarize";
};

// Use in graph
graph.addConditionalEdges("check", router);
```

#### `StateSchema.State` 与 `StateSchema.Update`

从模式中提取状态类型和更新类型，以便用于自定义类型定义：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema } from "@langchain/langgraph";

const MyStateSchema = new StateSchema({
  messages: MessagesValue,
  count: z.number().default(0),
});

// Extract the full state type
type MyState = typeof MyStateSchema.State;
// { messages: BaseMessage[], count: number }

// Extract the update type (partial, with reducer input types)
type MyUpdate = typeof MyStateSchema.Update;
// { messages?: Messages, count?: number }
```

### 在图状态中使用消息

#### 为什么使用消息？

大多数现代 LLM 提供方都有聊天模型接口，接受消息列表作为输入。特别是 LangChain 的[聊天模型接口](https://docs.langchain.com/oss/javascript/langchain/models.md)接受消息对象列表作为输入。这些消息有多种形式，例如 [`HumanMessage`](https://reference.langchain.com/javascript/langchain-core/messages/HumanMessage)（用户输入）或 [`AIMessage`](https://reference.langchain.com/javascript/langchain-core/messages/AIMessage)（LLM 响应）。

要了解更多关于消息对象的内容，请参阅[消息概念指南](https://docs.langchain.com/oss/javascript/langchain/messages.md)。

#### 在你的图中使用消息

在许多情况下，把先前的对话历史以消息列表的形式存储在图状态中会很有帮助。为此，你可以使用预置的 `MessagesValue`，它提供了消息感知的 reducer，可自动处理消息 ID、更新和删除。

`MessagesValue` reducer 至关重要，它告诉图如何在每次状态更新时更新状态中的 `Message` 对象列表。如果你不指定 reducer，每次状态更新都会用最近提供的值覆盖消息列表。`MessagesValue` 会正确处理这一点：对于全新消息，它追加到现有列表；对于已存在的消息（按 ID 匹配），它就地更新。

> [!TIP]
>
> `MessagesValue` 实际上是 `ReducedValue` 的一个特例，预配置了内部的 `messagesStateReducer` 来处理消息列表和更新。这为 LangGraph 图中的聊天消息历史提供了便捷、消息感知的状态管理。

#### 序列化

除了跟踪消息 ID 之外，每当在 `messages` 通道上收到状态更新时，`MessagesValue` 还会尝试把消息反序列化为 LangChain 的 `Message` 对象。这允许以下列格式发送图输入/状态更新：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// this is supported
{
  messages: [new HumanMessage("message")];
}

// and this is also supported
{
  messages: [{ role: "human", content: "message" }];
}
```

由于使用 `MessagesValue` 时状态更新总会被反序列化为 LangChain 的 `Messages`，你应使用点号表示法访问消息属性，例如 `state.messages.at(-1).content`。下面是一个使用 `MessagesValue` 的图示例：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, MessagesValue } from "@langchain/langgraph";

const State = new StateSchema({
  messages: MessagesValue,
});

const graph = new StateGraph(State)
  ...
```

`messages` 字段定义为 `MessagesValue`，它是带有内置 reducer 的 [`BaseMessage`](https://reference.langchain.com/javascript/langchain-core/messages/BaseMessage) 对象列表。通常，需要跟踪的状态比消息更多，所以我们常看到人们扩展此状态并添加更多字段，例如：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, MessagesValue } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  documents: z.array(z.string()),
});
```

## 节点

在 LangGraph 中，节点通常是接受以下参数的函数（同步或异步）：

1. `state`——图的[状态](#state)
2. `config`——一个 [`RunnableConfig`](https://reference.langchain.com/javascript/langchain-core/runnables/RunnableConfig) 对象，包含 `thread_id` 等配置信息以及 `tags` 等追踪信息

你可以使用 `addNode` 方法向图中添加节点。为了获得更好的类型安全，请使用 `GraphNode` 类型工具或 `State.Node` 为节点函数标注类型：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  input: z.string(),
  results: z.string(),
});

// Option 1: Use GraphNode type utility
const myNode: GraphNode<typeof State> = (state, config) => {
  console.log("In node: ", config?.configurable?.user_id);
  return { results: `Hello, ${state.input}!` };
};

// Option 2: Use State.Node shorthand
const otherNode: typeof State.Node = (state) => {
  return state;
};

const builder = new StateGraph(State)
  .addNode("myNode", myNode)
  .addNode("otherNode", otherNode)
  ...
```

在幕后，函数会被转换为 [`RunnableLambda`](https://reference.langchain.com/javascript/langchain-core/runnables/RunnableLambda)，为你的函数增加批处理和异步支持，以及[原生追踪与调试](https://docs.langchain.com/langsmith/observability.md)。

如果你在向图中添加节点时未指定名称，它将获得一个等同于函数名的默认名称。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder.addNode(myNode);
// You can then create edges to/from this node by referencing it as `"myNode"`
```

### 重新执行与幂等性

当你使用[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)编译时，LangGraph 会在[超步](#graphs)边界保存检查点，而不是在节点函数内部中途保存。如果执行停止并在之后恢复（例如在[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)或重试之后），受影响的**节点**会从其函数开头重新运行。暂停之前的代码和副作用会再次执行。

**幂等性。** 设计**节点**逻辑时要保证重新执行不会破坏状态。如果节点插入一行数据库记录，运行两次不应产生重复行，除非这是有意为之。请使用幂等键、upsert 或写前读检查。关于 `interrupt()` 周围的副作用，参见[在 `interrupt` 之前调用的副作用必须幂等](https://docs.langchain.com/oss/javascript/langgraph/interrupts#side-effects-called-before-interrupt-must-be-idempotent)。

**图的变更。** 关于代码变更的[确定性](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#determinism)规则不适用于图结构。你可以增删**节点**和边，而不会破坏已有线程的恢复。恢复后的运行会使用已保存的状态，并执行你现在编译的图。

**节点内的 task 与中断。** 如果**节点**调用了 [**task**](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#task) 或 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt)，则恢复时会适用更严格的确定性规则。LangGraph 会从检查点恢复已完成的 **task** 结果，但在恢复点之前的代码中改变 **task** 或 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的顺序，可能导致缓存值错配。[Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md) 的 **entrypoint** 会编译成单个**节点**，以这种方式运行整个 entrypoint 方法。参见[确定性](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#determinism)、[幂等性](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#idempotency)和[在节点中使用 task](#using-tasks-in-nodes)。

### 在节点中使用 task

如果一个[节点](#nodes)包含多个操作，你可能会发现把每个操作实现为一个 [**task**](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#task) 比把逻辑拆分到多个节点更容易。当图使用检查点保存器时，task 结果会被写入检查点，因此恢复线程时可以跳过节点内已完成的 **task** 工作。

**原始版本**

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { uuid7 } from "langsmith";

import {
  END,
  MemorySaver,
  START,
  StateGraph,
  StateSchema,
} from "@langchain/langgraph";
import type { GraphNode } from "@langchain/langgraph";

const State = new StateSchema({
  url: z.string(),
  result: z.string().optional(),
});

const callApi: GraphNode<typeof State> = async (state) => {
  const response = await fetch(state.url); // [!code highlight]
  const text = await response.text();
  const result = text.slice(0, 100);
  return { result };
};

const builder = new StateGraph(State)
  .addNode("callApi", callApi)
  .addEdge(START, "callApi")
  .addEdge("callApi", END);

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });

const threadId = uuid7();
const config = { configurable: { thread_id: threadId } };

await graph.invoke({ url: "https://www.example.com" }, config);
```

> **[查看示例追踪](https://smith.langchain.com/public/13308e63-ab5d-47b0-b9ac-9a52389969ed/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

**使用 task**

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { uuid7 } from "langsmith";

import {
  END,
  MemorySaver,
  START,
  StateGraph,
  StateSchema,
  task,
} from "@langchain/langgraph";
import type { GraphNode } from "@langchain/langgraph";

const State = new StateSchema({
  urls: z.array(z.string()),
  results: z.array(z.string()).optional(),
});

const makeRequest = task("makeRequest", async (url: string) => {
  const response = await fetch(url); // [!code highlight]
  const text = await response.text();
  return text.slice(0, 100);
});

const callApi: GraphNode<typeof State> = async (state) => {
  const pending = state.urls.map((url) => makeRequest(url)); // [!code highlight]
  const results = await Promise.all(pending);
  return { results };
};

const builder = new StateGraph(State)
  .addNode("callApi", callApi)
  .addEdge(START, "callApi")
  .addEdge("callApi", END);

const checkpointer = new MemorySaver();
const graph = builder.compile({ checkpointer });

const threadId = uuid7();
const config = { configurable: { thread_id: threadId } };

await graph.invoke({ urls: ["https://www.example.com"] }, config);
```

> **[查看示例追踪](https://smith.langchain.com/public/8a472619-c051-4137-95d3-1937c6d0855e/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

### `START` 节点

[`START`](https://reference.langchain.com/javascript/langchain-langgraph/index/START) 节点是一个特殊节点，代表向图发送用户输入的节点。引用该节点的主要目的是确定哪些节点应最先被调用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START } from "@langchain/langgraph";

graph.addEdge(START, "nodeA");
```

### `END` 节点

`END` Node 是一个表示终止节点的特殊节点。当你想要指明哪些边在完成后没有后续动作时，就会引用该节点。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { END } from "@langchain/langgraph";

graph.addEdge("nodeA", END);
```

### 节点缓存

LangGraph 支持基于节点输入对任务/节点进行缓存。要使用缓存：

* 在编译图时（或指定入口点）指定缓存
* 为节点指定缓存策略。每个缓存策略支持：
  * `keyFunc`，用于根据节点输入生成缓存键。
  * `ttl`，缓存存活时间（秒）。如果未指定，缓存永不过期。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, START } from "@langchain/langgraph";
import { InMemoryCache } from "@langchain/langgraph-checkpoint";
import { z } from "zod/v4";

const State = new StateSchema({
  x: z.number(),
  result: z.number(),
});

const expensiveNode: GraphNode<typeof State> = async (state) => {
  // Simulate an expensive operation
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return { result: state.x * 2 };
};

const graph = new StateGraph(State)
  .addNode("expensive_node", expensiveNode, { cachePolicy: { ttl: 3 } })
  .addEdge(START, "expensive_node")
  .compile({ cache: new InMemoryCache() });

await graph.invoke({ x: 5 }, { streamMode: "updates" });   // [!code highlight]
// [{"expensive_node": {"result": 10}}]
await graph.invoke({ x: 5 }, { streamMode: "updates" });   // [!code highlight]
// [{"expensive_node": {"result": 10}, "__metadata__": {"cached": true}}]
```

## 边

边定义了逻辑如何路由，以及图如何决定停止。这是智能体工作方式以及不同节点如何相互通信的重要部分。有几种关键的边类型：

* 普通边：直接从一个节点到下一个节点。
* 条件边：调用一个函数来确定接下来去哪个（些）节点。
* 入口点：当用户输入到达时首先调用哪个节点。
* 条件入口点：调用一个函数来确定当用户输入到达时首先调用哪个（些）节点。

一个节点可以有多个出边。如果一个节点有多个出边，**所有**这些目标节点都会作为下一个超步的一部分并行执行。

> [!WARNING]
>
> 对每个节点，请选择一种路由机制：静态路由使用普通边，动态路由使用条件边 / [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command)。不要混用普通边和来自同一节点的动态路由，因为两条路径都可能执行，使图的行为更难推理。

### 普通边

如果你**总是**想从节点 A 走到节点 B，可以直接使用 [`addEdge`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addEdge) 方法。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.addEdge("nodeA", "nodeB");
```

### 条件边

如果你希望**可选地**路由到一条或多条边（或可选地终止），可以使用 [`addConditionalEdges`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addConditionalEdges) 方法。该方法接受一个节点名称，以及一个在该节点执行后调用的"路由函数"：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.addConditionalEdges("nodeA", routingFunction);
```

与节点类似，`routingFunction` 接受图的当前 `state` 并返回一个值。

默认情况下，`routingFunction` 的返回值被用作接下来要把状态发送到的节点名称（或节点名称列表）。所有这些节点都会作为下一个超步的一部分并行运行。

你还可以提供一个对象，把 `routingFunction` 的输出映射到下一个节点的名称。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.addConditionalEdges("nodeA", routingFunction, {
  true: "nodeB",
  false: "nodeC",
});
```

> [!TIP]
>
> 如果你想在单个函数中同时完成状态更新和路由，请使用 [`Command`](#command) 而不是条件边。

### 入口点

入口点是图启动时最先运行的一个或多个节点。你可以使用 [`addEdge`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addEdge) 方法，从虚拟的 [`START`](https://reference.langchain.com/javascript/langchain-langgraph/index/START) 节点指向第一个要执行的节点，来指定进入图的位置。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START } from "@langchain/langgraph";

graph.addEdge(START, "nodeA");
```

### 条件入口点

条件入口点让你可以根据自定义逻辑从不同节点开始。你可以使用从虚拟 [`START`](https://reference.langchain.com/javascript/langchain-langgraph/index/START) 节点出发的 [`addConditionalEdges`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addConditionalEdges) 来实现。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START } from "@langchain/langgraph";

graph.addConditionalEdges(START, routingFunction);
```

你还可以提供一个对象，把 `routingFunction` 的输出映射到下一个节点的名称。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.addConditionalEdges(START, routingFunction, {
  true: "nodeB",
  false: "nodeC",
});
```

## `Send`

默认情况下，`Nodes` 和 `Edges` 是预先定义好的，并在同一份共享状态上运行。然而，有时确切的边无法预先确定，并且/或者你可能希望同时存在不同版本的 `State`。一个常见例子是 map-reduce 设计模式。在这种模式中，第一个节点可能生成一个对象列表，而你可能想对所有这些对象应用另一个节点。对象的数量可能事先未知（意味着边的数量也可能未知），并且下游 `Node` 的输入 `State` 应该不同（每个生成的对象一个）。

为了支持这种设计模式，LangGraph 支持从条件边返回 [`Send`](https://reference.langchain.com/javascript/langchain-langgraph/index/Send) 对象。`Send` 接受两个参数：第一个是节点名称，第二个是要传给该节点的状态。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Send } from "@langchain/langgraph";

graph.addConditionalEdges("nodeA", (state) => {
  return state.subjects.map(
    (subject) => new Send("generateJoke", { subject })
  );
});
```

## `Command`

[`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 是一个用于控制图执行的通用原语。它接受四个参数：

* `update`：应用状态更新（类似于从节点返回更新）。
* `goto`：导航到指定节点（类似于[条件边](#conditional-edges)）。
* `graph`：从[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)导航时，指定目标父图。
* `resume`：提供一个值，以便在[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)后恢复执行。

`Command` 用于三种场景：

* **[从节点返回](#return-from-nodes)**：使用 `update`、`goto` 和 `graph` 把状态更新与控制流结合起来。
* **[作为 `invoke` 或 `stream` 的输入](#input-to-invoke-or-stream)**：使用 `resume` 在中断后继续执行。
* **[从工具返回](#return-from-tools)**：与从节点返回类似，在工具内部组合状态更新和控制流。

### 从节点返回

#### `update` 与 `goto`

从节点函数返回 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command)，以便在一步中同时更新状态并路由到下一个节点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

graph.addNode("myNode", (state) => {
  return new Command({
    update: { foo: "bar" },
    goto: "myOtherNode",
  });
});
```

使用 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 你还可以实现动态控制流行为（与[条件边](#conditional-edges)完全相同）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

graph.addNode("myNode", (state) => {
  if (state.foo === "bar") {
    return new Command({
      update: { foo: "baz" },
      goto: "myOtherNode",
    });
  }
});
```

当你需要**同时**更新状态**并**路由到不同节点时，请使用 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command)。如果你只需要路由而不需要更新状态，请改用[条件边](#conditional-edges)。

在节点函数中使用 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 时，你必须在添加节点时提供 `ends` 参数，以指明它可以路由到哪些节点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder.addNode("myNode", myNode, {
  ends: ["myOtherNode", END],
});
```

> [!WARNING]
>
> [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 只会添加动态边——用 `add_edge` / `addEdge` 定义的静态边仍会执行。例如，如果 `node_a` 返回 `Command(goto="my_other_node")`，而你还有 `graph.add_edge("node_a", "node_b")`，那么 `node_b` 和 `my_other_node` 都会运行。对每个节点，请使用 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 或静态边之一来路由到后续节点，不要两者同时使用。

查看这份[操作指南](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#combine-control-flow-and-state-updates-with-command)，了解使用 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 的端到端示例。

#### `graph`

如果你在使用[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)，可以在 `Command` 中设置 `graph: Command.PARENT`，从子图中的某个节点导航到父图中的另一个节点：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

graph.addNode("myNode", (state) => {
  return new Command({
    update: { foo: "bar" },
    goto: "otherSubgraph", // where `otherSubgraph` is a node in the parent graph
    graph: Command.PARENT,
  });
});
```

> [!NOTE]
>
> 将 `graph` 设为 `Command.PARENT` 会导航到最近的父图。
>
> 当你把更新从子图节点发送到父图节点，且该键同时被父图和子图的[状态模式](#schema)共享时，你**必须**在父图状态中为该键定义 [reducer](#reducers)。

这在实现[多智能体交接](https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs.md)时特别有用。详情参见[导航到父图中的节点](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#navigate-to-a-node-in-a-parent-graph)。

### 作为 `invoke` 或 `stream` 的输入

> [!WARNING]
>
> `new Command({ resume: ... })` 是**唯一**可用作 `invoke()`/`stream()` 输入的 `Command` 用法（可选地与 `update` 结合，在恢复的同时应用状态变更）。不要单独把 `new Command({ update: ... })` 作为输入来继续多轮对话——因为把任何 `Command` 作为输入都会从最新检查点（即最后运行的步骤，而不是 `__start__`）恢复，如果图已经结束，它会看起来卡住。要在已有线程上继续对话，请传入一个普通的输入对象：
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // WRONG - graph resumes from the latest checkpoint
> // (last step that ran), appears stuck
> await graph.invoke(new Command({ update: { messages: [{ role: "user", content: "follow up" }] } }), config);  // [!code --]
>
> // CORRECT - plain object restarts from __start__
> await graph.invoke({ messages: [{ role: "user", content: "follow up" }] }, config);  // [!code ++]
> ```

#### `resume`

使用 `new Command({ resume: ... })` 提供一个值，并在[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)之后恢复图执行。传给 `resume` 的值会成为暂停节点内 `interrupt()` 调用的返回值：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command, interrupt } from "@langchain/langgraph";

const humanReview = async (state: typeof StateAnnotation.State) => {
  // Pauses the graph and waits for a value
  const answer = interrupt("Do you approve?");
  return { messages: [{ role: "user", content: answer }] };
};

// First invocation - hits the interrupt and pauses
const result = await graph.invoke({ messages: [...] }, config);

// Resume with a value - the interrupt() call returns "yes"
const resumed = await graph.invoke(new Command({ resume: "yes" }), config);
```

关于中断模式（包括多次中断和校验循环）的完整细节，请查看[中断概念指南](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)。

### 从工具返回

你可以从工具返回 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command)，以更新图状态并控制流。使用 `update` 修改状态（例如，保存在对话过程中查询到的客户信息），使用 `goto` 在工具完成后路由到特定节点。

> [!WARNING]
>
> 在工具内部使用时，`goto` 会添加一条动态边——调用该工具的节点上已定义的任何静态边仍会执行。对每个节点，请使用工具驱动的动态路由或静态边之一来路由到后续节点，不要两者同时使用。

详情参见[在工具内部使用](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#use-inside-tools)。

## 图迁移

即使使用检查点保存器来跟踪状态，LangGraph 也能轻松处理图定义（节点、边和状态）的迁移。

* 对于已到达图末尾（即未被中断）的线程，你可以改变图的整个拓扑（即所有节点和边，删除、添加、重命名等）
* 对于当前处于中断状态的线程，我们支持除重命名/删除节点之外的所有拓扑变更（因为该线程可能即将进入一个已不存在的节点）——如果这一点构成阻碍，请联系我们，我们可以优先提供解决方案。
* 对于修改状态，我们在添加和删除键方面具有完整的向后和向前兼容性
* 被重命名的状态键会在已有线程中丢失其保存的状态
* 类型以不兼容方式改变的状态键，目前可能在带有变更前状态的线程中引发问题——如果这一点构成阻碍，请联系我们，我们可以优先提供解决方案。

> [!TIP]
>
> 对于技术上兼容但会改变业务逻辑的变更——例如重写工具集或重构对话流程——参见[业务兼容性](https://docs.langchain.com/oss/javascript/langgraph/backward-compatibility.md#business-compatibility)。该页面介绍了如何在状态中固定一个行为版本，使已有线程沿用旧路径，而新线程采用最新版本。

## 运行时上下文

创建图时，你可以为传给节点的运行时上下文指定 `contextSchema`。这对于向节点传递不属于图状态的信息很有用。例如，你可能想传递模型名称或数据库连接等依赖项。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  input: z.string(),
  output: z.string(),
});

const ContextSchema = z.object({
  llm: z.union([z.literal("openai"), z.literal("anthropic")]),
});

const graph = new StateGraph(State, ContextSchema);
```

然后你可以使用 `context` 属性把这份配置传入图。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { context: { llm: "anthropic" } };

await graph.invoke(inputs, config);
```

之后你可以在节点或条件边内部访问并使用该上下文：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Runtime, GraphNode } from "@langchain/langgraph";
import * as z from "zod";

const nodeA: GraphNode<typeof State> = (state, config) => {
  const llm = getLLM(runtime.context?.llm);
  // ...
  return {};
};
```

关于配置的完整说明，参见[添加运行时配置](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#add-runtime-configuration)。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.addNode("myNode", (state, config) => {
  const llmType = config.context?.llm || "openai";
  const llm = getLLM(llmType);
  return { results: `Hello, ${state.input}!` };
});
```

### 递归上限

递归上限设置图在单次执行期间可以执行的[超步](#graphs)最大数量。一旦达到上限，LangGraph 会抛出 `GraphRecursionError`。默认值为 25 步。递归上限可以在运行时为任意图设置，并通过配置对象传给 `invoke`/`stream`。重要的是，`recursionLimit` 是一个独立的 `config` 键，不应像其他用户自定义配置那样放在 `configurable` 键内。参见下面的示例：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
await graph.invoke(inputs, {
  recursionLimit: 5,
  context: { llm: "anthropic" },
});
```

### 访问与处理递归计数器

当前步数计数器可在任意节点内通过 `config.metadata.langgraph_step` 访问，这使你能够在触及递归上限之前主动处理递归。

#### 工作原理

步数计数器存储在 `config.metadata.langgraph_step` 中。LangGraph 在图执行时递增该计数器，并在超出配置的 `recursionLimit` 后抛出 `GraphRecursionError`。

#### 访问当前步数计数器

你可以在任意节点内访问当前步数计数器，以监控执行进度。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph } from "@langchain/langgraph";

const myNode: GraphNode<typeof State> = async (state, config) => {
  const currentStep = config.metadata?.langgraph_step;
  console.log(`Currently on step: ${currentStep}`);
  return state;
}
```

请为你的图设计明确的终止条件，并捕获 `GraphRecursionError` 作为安全网：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateGraph,
  StateSchema,
  ReducedValue,
  GraphNode,
  ConditionalEdgeRouter,
  END,
  GraphRecursionError
} from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  messages: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
});

// Build graph with explicit termination logic
const graph = new StateGraph(State)
  .addNode("reasoning", async (state) => {
    // Normal processing - design your graph with explicit termination conditions
    return {
      messages: ["thinking..."]
    };
  })
  .addConditionalEdges("reasoning", (state) => {
    // Add your termination condition here
    if (state.messages.length >= 5) {
      return END;
    }
    return "reasoning";
  });

const app = graph.compile();

// Catch GraphRecursionError as a safety net
try {
  const result = await app.invoke(
    { messages: [] },
    { recursionLimit: 10 }
  );
} catch (error) {
  if (error instanceof GraphRecursionError) {
    console.log("Recursion limit reached, handling gracefully");
    // Handle the error - return partial results, notify user, etc.
  }
}
```

#### 主动式与响应式方法

处理递归上限主要有两种方法：主动式（在图内部监控）和响应式（在外部捕获错误）。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateGraph,
  StateSchema,
  ReducedValue,
  GraphNode,
  ConditionalEdgeRouter,
  END,
  GraphRecursionError
} from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  messages: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (x, y) => x.concat(y) }
  ),
});


// Build graph with explicit termination logic
const builder = new StateGraph(State)
  .addNode("agent", async (state) => {
    return {
      messages: ["Processing..."]
    };
  })
  .addConditionalEdges("agent", (state) => {
    // Design termination conditions into your graph
    if (state.messages.length >= 5) {
      return END;
    }
    return "agent";
  });

const graph = builder.compile();

// Reactive Approach - catch GraphRecursionError as safety net
try {
  const result = await graph.invoke(
    { messages: [] },
    { recursionLimit: 10 }
  );
} catch (error) {
  if (error instanceof GraphRecursionError) {
    // Handle externally after graph execution fails
    console.log("Recursion limit exceeded, handling gracefully");
  }
}
```

响应式方法在超出上限之后捕获 `GraphRecursionError`。请为你的图设计明确的终止条件，从根本上避免触及上限。

| 方法 | 检测时机 | 处理位置 | 控制流 |
| - | - | - | - |
| 响应式（捕获 `GraphRecursionError`） | 超出上限之后 | 图外部的 try/catch 中 | 图执行已终止 |

**响应式的优点：**

* 实现简单
* 无需修改图逻辑
* 集中式错误处理

#### 其他可用元数据

除了 `langgraph_step`，`config.metadata` 中还提供以下元数据：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const inspectMetadata: GraphNode<typeof State> = async (state, config) => {
  const metadata = config.metadata;

  console.log(`Step: ${metadata?.langgraph_step}`);
  console.log(`Node: ${metadata?.langgraph_node}`);
  console.log(`Triggers: ${metadata?.langgraph_triggers}`);
  console.log(`Path: ${metadata?.langgraph_path}`);
  console.log(`Checkpoint NS: ${metadata?.langgraph_checkpoint_ns}`);

  return state;
}
```

## 可视化

能够可视化图通常很有用，尤其是当图变得更为复杂时。LangGraph 自带几种内置的图可视化方式。更多信息参见[可视化你的图](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#visualize-your-graph)。

## 可观测性与追踪

要追踪、调试和评估你的智能体，请使用 [LangSmith](https://docs.langchain.com/langsmith/observability.md)。

## 了解更多

* [如何使用图 API](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md)
* [Functional API 概念概览](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md)
* [在图 API 与 Functional API 之间选择](https://docs.langchain.com/oss/javascript/langgraph/choosing-apis.md)

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/pregel.md

# LangGraph 运行时

[`Pregel`](https://reference.langchain.com/javascript/langchain-langgraph/index/Pregel) 实现了 LangGraph 的运行时，负责管理 LangGraph 应用的执行。

编译一个 [StateGraph](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) 或创建一个 [entrypoint](https://reference.langchain.com/javascript/langchain-langgraph/index/entrypoint)，会产出一个可带输入调用的 [`Pregel`](https://reference.langchain.com/javascript/langchain-langgraph/index/Pregel) 实例。

本指南从较高层面解释该运行时，并说明如何直接用 Pregel 实现应用。

> **注意：** [`Pregel`](https://reference.langchain.com/javascript/langchain-langgraph/index/Pregel) 运行时以 [Google 的 Pregel 算法](https://research.google/pubs/pub37252/)命名，该算法描述了一种利用图进行大规模并行计算的高效方法。

## 概览

在 LangGraph 中，Pregel 把 [**actor**](https://en.wikipedia.org/wiki/Actor_model) 和**通道（channel）**组合成单一应用。**Actor** 从通道读取数据、向通道写入数据。Pregel 遵循 **Pregel 算法**/**整体同步并行**（Bulk Synchronous Parallel）模型，把应用执行组织成多个步骤。

每个步骤包含三个阶段：

* **计划（Plan）**：确定本步骤要执行哪些 **actor**。例如，第一步选择订阅特殊**输入**通道的 **actor**；后续步骤选择订阅上一步被更新通道的 **actor**。
* **执行（Execution）**：并行执行所有选中的 **actor**，直到全部完成、有一个失败或超时。在此阶段，通道更新对 actor 不可见，直到下一步才可见。
* **更新（Update）**：用 **actor** 在本步骤写入的值更新通道。

重复以上过程，直到没有 **actor** 被选中执行，或达到最大步数。

## Actor

**Actor** 是一个 `PregelNode`。它订阅通道、从通道读取数据、向通道写入数据，可以理解为 Pregel 算法中的 **actor**。`PregelNode` 实现了 LangChain 的 Runnable 接口。

## 通道

通道用于在 actor（PregelNode）之间通信。每个通道有一个值类型、一个更新类型，以及一个更新函数——它接收一串更新并修改所存的值。通道可以把数据从一条链送到另一条链，或在未来的步骤中把数据从一条链送回它自己。

### LastValue

[`LastValue`](https://reference.langchain.com/javascript/langchain-langgraph/channels) 是默认的通道类型。它保存最后写入的值，覆盖之前的值。可用于输入输出值，或在步骤之间传递数据。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { LastValue } from "@langchain/langgraph/channels";

const channel = new LastValue<number>();
```

### Topic

[`Topic`](https://reference.langchain.com/javascript/langchain-langgraph/channels/Topic) 是一个可配置的 PubSub 通道，适合在 actor 之间发送多个值，或跨步骤累积输出。它可以配置为对值去重，或累积一次运行中写入的所有值。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Topic } from "@langchain/langgraph/channels";

// Accumulate all values written across steps
const channel = new Topic<string>({ accumulate: true });
```

### BinaryOperatorAggregate

[`BinaryOperatorAggregate`](https://reference.langchain.com/javascript/langchain-langgraph/channels/BinaryOperatorAggregate) 保存一个持久值，通过把二元运算符应用于当前值和每个新更新来更新它。适合跨步骤计算滚动聚合。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { BinaryOperatorAggregate } from "@langchain/langgraph/channels";

// Running total: each write adds to the current value
const total = new BinaryOperatorAggregate<number>({ operator: (a, b) => a + b });
```

## 示例

虽然大多数用户会通过 [StateGraph](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) API 或 [entrypoint](https://reference.langchain.com/javascript/langchain-langgraph/index/entrypoint) 装饰器使用 Pregel，但也可以直接使用 Pregel。

下面几个示例帮助你了解 Pregel API 的用法。

**单节点**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { EphemeralValue } from "@langchain/langgraph/channels";
import { Pregel, NodeBuilder } from "@langchain/langgraph/pregel";

const node1 = new NodeBuilder()
  .subscribeOnly("a")
  .do((x: string) => x + x)
  .writeTo("b");

const app = new Pregel({
  nodes: { node1 },
  channels: {
    a: new EphemeralValue<string>(),
    b: new EphemeralValue<string>(),
  },
  inputChannels: ["a"],
  outputChannels: ["b"],
});

await app.invoke({ a: "foo" });
```

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{ b: 'foofoo' }
```

**多节点**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { LastValue, EphemeralValue } from "@langchain/langgraph/channels";
import { Pregel, NodeBuilder } from "@langchain/langgraph/pregel";

const node1 = new NodeBuilder()
  .subscribeOnly("a")
  .do((x: string) => x + x)
  .writeTo("b");

const node2 = new NodeBuilder()
  .subscribeOnly("b")
  .do((x: string) => x + x)
  .writeTo("c");

const app = new Pregel({
  nodes: { node1, node2 },
  channels: {
    a: new EphemeralValue<string>(),
    b: new LastValue<string>(),
    c: new EphemeralValue<string>(),
  },
  inputChannels: ["a"],
  outputChannels: ["b", "c"],
});

await app.invoke({ a: "foo" });
```

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{ b: 'foofoo', c: 'foofoofoofoo' }
```

**Topic**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { EphemeralValue, Topic } from "@langchain/langgraph/channels";
import { Pregel, NodeBuilder } from "@langchain/langgraph/pregel";

const node1 = new NodeBuilder()
  .subscribeOnly("a")
  .do((x: string) => x + x)
  .writeTo("b", "c");

const node2 = new NodeBuilder()
  .subscribeTo("b")
  .do((x: { b: string }) => x.b + x.b)
  .writeTo("c");

const app = new Pregel({
  nodes: { node1, node2 },
  channels: {
    a: new EphemeralValue<string>(),
    b: new EphemeralValue<string>(),
    c: new Topic<string>({ accumulate: true }),
  },
  inputChannels: ["a"],
  outputChannels: ["c"],
});

await app.invoke({ a: "foo" });
```

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{ c: ['foofoo', 'foofoofoofoo'] }
```

**BinaryOperatorAggregate**

这个示例演示如何使用 [`BinaryOperatorAggregate`](https://reference.langchain.com/javascript/langchain-langgraph/channels/BinaryOperatorAggregate) 通道实现一个 reducer。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { EphemeralValue, BinaryOperatorAggregate } from "@langchain/langgraph/channels";
import { Pregel, NodeBuilder } from "@langchain/langgraph/pregel";

const node1 = new NodeBuilder()
  .subscribeOnly("a")
  .do((x: string) => x + x)
  .writeTo("b", "c");

const node2 = new NodeBuilder()
  .subscribeOnly("b")
  .do((x: string) => x + x)
  .writeTo("c");

const reducer = (current: string, update: string) => {
  if (current) {
    return current + " | " + update;
  } else {
    return update;
  }
};

const app = new Pregel({
  nodes: { node1, node2 },
  channels: {
    a: new EphemeralValue<string>(),
    b: new EphemeralValue<string>(),
    c: new BinaryOperatorAggregate<string>({ operator: reducer }),
  },
  inputChannels: ["a"],
  outputChannels: ["c"],
});

await app.invoke({ a: "foo" });
```

**循环**

这个示例演示如何在图中引入循环：让一条链向它自己订阅的通道写入。执行会持续进行，直到向通道写入 `null` 值。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { EphemeralValue } from "@langchain/langgraph/channels";
import { Pregel, NodeBuilder, ChannelWriteEntry } from "@langchain/langgraph/pregel";

const exampleNode = new NodeBuilder()
  .subscribeOnly("value")
  .do((x: string) => x.length < 10 ? x + x : null)
  .writeTo(new ChannelWriteEntry("value", { skipNone: true }));

const app = new Pregel({
  nodes: { exampleNode },
  channels: {
    value: new EphemeralValue<string>(),
  },
  inputChannels: ["value"],
  outputChannels: ["value"],
});

await app.invoke({ value: "a" });
```

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{ value: 'aaaaaaaaaaaaaaaa' }
```

## 高层 API

LangGraph 提供两个用于创建 Pregel 应用的高层 API：[StateGraph（Graph API）](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md) 与 [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md)。

**StateGraph（Graph API）**

[StateGraph（Graph API）](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) 是一个更高层的抽象，简化了 Pregel 应用的创建。它让你定义由节点和边构成的图。编译图时，StateGraph API 会自动为你创建 Pregel 应用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START, StateGraph } from "@langchain/langgraph";

interface Essay {
  topic: string;
  content?: string;
  score?: number;
}

const writeEssay = (essay: Essay) => {
  return {
    content: `Essay about ${essay.topic}`,
  };
};

const scoreEssay = (essay: Essay) => {
  return {
    score: 10
  };
};

const builder = new StateGraph<Essay>({
  channels: {
    topic: null,
    content: null,
    score: null,
  }
})
  .addNode("writeEssay", writeEssay)
  .addNode("scoreEssay", scoreEssay)
  .addEdge(START, "writeEssay")
  .addEdge("writeEssay", "scoreEssay");

// Compile the graph.
// This will return a Pregel instance.
const graph = builder.compile();
```

编译后的 Pregel 实例会关联一组节点和通道。你可以打印它们来查看。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
console.log(graph.nodes);
```

你会看到类似这样的内容：

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  __start__: PregelNode { ... },
  writeEssay: PregelNode { ... },
  scoreEssay: PregelNode { ... }
}
```

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
console.log(graph.channels);
```

你应该会看到类似这样的内容：

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  topic: LastValue { ... },
  content: LastValue { ... },
  score: LastValue { ... },
  __start__: EphemeralValue { ... },
  writeEssay: EphemeralValue { ... },
  scoreEssay: EphemeralValue { ... },
  'branch:__start__:__self__:writeEssay': EphemeralValue { ... },
  'branch:__start__:__self__:scoreEssay': EphemeralValue { ... },
  'branch:writeEssay:__self__:writeEssay': EphemeralValue { ... },
  'branch:writeEssay:__self__:scoreEssay': EphemeralValue { ... },
  'branch:scoreEssay:__self__:writeEssay': EphemeralValue { ... },
  'branch:scoreEssay:__self__:scoreEssay': EphemeralValue { ... },
  'start:writeEssay': EphemeralValue { ... }
}
```

**Functional API**

在 [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md) 中，你可以用 [`entrypoint`](https://reference.langchain.com/javascript/langchain-langgraph/index/entrypoint) 创建 Pregel 应用。`entrypoint` 装饰器让你定义一个接收输入并返回输出的函数。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MemorySaver } from "@langchain/langgraph";
import { entrypoint } from "@langchain/langgraph/func";

interface Essay {
  topic: string;
  content?: string;
  score?: number;
}

const checkpointer = new MemorySaver();

const writeEssay = entrypoint(
  { checkpointer, name: "writeEssay" },
  async (essay: Essay) => {
    return {
      content: `Essay about ${essay.topic}`,
    };
  }
);

console.log("Nodes: ");
console.log(writeEssay.nodes);
console.log("Channels: ");
console.log(writeEssay.channels);
```

```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
Nodes:
{ writeEssay: PregelNode { ... } }
Channels:
{
  __start__: EphemeralValue { ... },
  __end__: LastValue { ... },
  __previous__: LastValue { ... }
}
```

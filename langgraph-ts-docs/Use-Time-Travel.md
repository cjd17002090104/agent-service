> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md

# 使用时间旅行

> 重放过去的执行，并通过分叉探索 LangGraph 中的替代路径

## 概述

LangGraph 通过[检查点](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md#checkpoints)支持时间旅行：

* **[重放](#replay)**：从先前的检查点重试。
* **[分叉](#fork)**：从先前检查点带着修改后的状态分支出去，探索替代路径。

两者的工作方式都是从先前的检查点恢复。检查点之前的节点不会重新执行（结果已保存）。检查点之后的节点会重新执行，包括所有 LLM 调用、API 请求和[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)（它们可能产生不同的结果）。

## 重放

使用先前检查点的配置调用图，即可从该点重放。

> [!WARNING]
>
> 重放会重新执行节点——它不只是从缓存读取。LLM 调用、API 请求和[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)都会再次触发，并可能返回不同结果。从最终检查点（没有 `next` 节点）重放是空操作。

![重放](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/re_play.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=d7b34b85c106e55d181ae1f4afb50251)

使用 [`getStateHistory`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/getStateHistory) 找到你要从中重放的检查点，然后用该检查点的配置调用 [`invoke`](https://reference.langchain.com/javascript/langchain-langgraph/index/CompiledStateGraph/invoke)：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { v7 as uuid7 } from "uuid";
import { StateGraph, MemorySaver, START } from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  topic: Annotation<string>(),
  joke: Annotation<string>(),
});

function generateTopic(state: typeof StateAnnotation.State) {
  return { topic: "socks in the dryer" };
}

function writeJoke(state: typeof StateAnnotation.State) {
  return { joke: `Why do ${state.topic} disappear? They elope!` };
}

const checkpointer = new MemorySaver();
const graph = new StateGraph(StateAnnotation)
  .addNode("generateTopic", generateTopic)
  .addNode("writeJoke", writeJoke)
  .addEdge(START, "generateTopic")
  .addEdge("generateTopic", "writeJoke")
  .compile({ checkpointer });

// Step 1: Run the graph
const config = { configurable: { thread_id: uuid7() } };
const result = await graph.invoke({}, config);

// Step 2: Find a checkpoint to replay from
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}

// Step 3: Replay from a specific checkpoint
const beforeJoke = states.find((s) => s.next.includes("writeJoke"));
const replayResult = await graph.invoke(null, beforeJoke.config);
// writeJoke re-executes (runs again), generateTopic does not
```

## 分叉

分叉会从过去的检查点带着修改后的状态创建一条新分支。在先前的检查点上调用 [`update_state`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/updateState) 创建分叉，然后用 `None` 调用 [`invoke`](https://reference.langchain.com/javascript/langchain-langgraph/index/CompiledStateGraph/invoke) 继续执行。

![分叉](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/checkpoints_full_story.jpg?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=a52016b2c44b57bd395d6e1eac47aa36)

> [!WARNING]
>
> `update_state` **不会**回滚线程。它会创建一个从指定点分支出的新检查点。原始的执行历史保持完整。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Find checkpoint before writeJoke
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}
const beforeJoke = states.find((s) => s.next.includes("writeJoke"));

// Fork: update state to change the topic
const forkConfig = await graph.updateState(
  beforeJoke.config,
  { topic: "chickens" },
);

// Resume from the fork — writeJoke re-executes with the new topic
const forkResult = await graph.invoke(null, forkConfig);
console.log(forkResult.joke); // A joke about chickens, not socks
```

### 从特定节点

当你调用 [`update_state`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/updateState) 时，值会使用指定节点的写入器（包括[归约器](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers)）来应用。检查点会记录该节点产生了这次更新，执行则从该节点的后继节点继续。

默认情况下，LangGraph 会从检查点的版本历史中推断 `as_node`。当从特定检查点分叉时，这种推断几乎总是正确的。

在以下情况下请显式指定 `as_node`：

* **并行分支**：多个节点在同一步更新了状态，而 LangGraph 无法确定哪个是最后一个（`InvalidUpdateError`）。
* **无执行历史**：在全新线程上设置状态（常见于[测试](https://docs.langchain.com/oss/javascript/langgraph/test.md)）。
* **跳过节点**：将 `as_node` 设为更靠后的节点，让图认为该节点已经运行过。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// graph: generateTopic -> writeJoke

// Treat this update as if generateTopic produced it.
// Execution resumes at writeJoke (the successor of generateTopic).
const forkConfig = await graph.updateState(
  beforeJoke.config,
  { topic: "chickens" },
  { asNode: "generateTopic" },
);
```

## 中断

如果你的图使用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 实现[人机协同](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)工作流，那么在时间旅行期间中断总会被重新触发。包含中断的节点会重新执行，`interrupt()` 会暂停以等待新的 `Command(resume=...)`。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { interrupt, Command } from "@langchain/langgraph";

function askHuman(state: { value: string[] }) {
  const answer = interrupt("What is your name?");
  return { value: [`Hello, ${answer}!`] };
}

function finalStep(state: { value: string[] }) {
  return { value: ["Done"] };
}

// ... build graph with checkpointer ...

// First run: hits interrupt
await graph.invoke({ value: [] }, config);
// Resume with answer
await graph.invoke(new Command({ resume: "Alice" }), config);

// Replay from before askHuman
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}
const beforeAsk = states.filter((s) => s.next.includes("askHuman")).pop();

const replayResult = await graph.invoke(null, beforeAsk.config);
// Pauses at interrupt — waiting for new Command({ resume: ... })

// Fork from before askHuman
const forkConfig = await graph.updateState(beforeAsk.config, { value: ["forked"] });
const forkResult = await graph.invoke(null, forkConfig);
// Pauses at interrupt — waiting for new Command({ resume: ... })

// Resume the forked interrupt with a different answer
await graph.invoke(new Command({ resume: "Bob" }), forkConfig);
// Result: { value: ["forked", "Hello, Bob!", "Done"] }
```

### 多个中断

如果你的图在多个位置收集输入（例如多步表单），你可以从两个中断之间分叉，从而修改后面的答案而不必重新询问前面的问题。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Fork from BETWEEN the two interrupts (after askName, before askAge)
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}
const between = states.filter((s) => s.next.includes("askAge")).pop();

const forkConfig = await graph.updateState(between.config, { value: ["modified"] });
const result = await graph.invoke(null, forkConfig);
// askName result preserved ("name:Alice")
// askAge pauses at interrupt — waiting for new answer
```

## 子图

带[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)的时间旅行取决于子图是否有自己的检查点写入器。这决定了你可以从哪个粒度的检查点进行时间旅行。

**继承的检查点写入器（默认）**

默认情况下，子图继承父图的检查点写入器。父图将整个子图视为**单个超级步**——整个子图执行只有一个父级检查点。从子图之前进行时间旅行会从头重新执行它。

在默认子图中，你无法时间旅行到各节点**之间**的位置——只能从父级层面进行时间旅行。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Subgraph without its own checkpointer (default)
const subgraph = new StateGraph(StateAnnotation)
  .addNode("stepA", stepA)       // Has interrupt()
  .addNode("stepB", stepB)       // Has interrupt()
  .addEdge(START, "stepA")
  .addEdge("stepA", "stepB")
  .compile();  // No checkpointer — inherits from parent

const graph = new StateGraph(StateAnnotation)
  .addNode("subgraphNode", subgraph)
  .addEdge(START, "subgraphNode")
  .compile({ checkpointer });

// Complete both interrupts
await graph.invoke({ value: [] }, config);
await graph.invoke(new Command({ resume: "Alice" }), config);
await graph.invoke(new Command({ resume: "30" }), config);

// Time travel from before the subgraph
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}
const beforeSub = states.filter((s) => s.next.includes("subgraphNode")).pop();

const forkConfig = await graph.updateState(beforeSub.config, { value: ["forked"] });
const result = await graph.invoke(null, forkConfig);
// The entire subgraph re-executes from scratch
// You cannot time travel to a point between stepA and stepB
```

**子图检查点写入器**

在子图上设置 `checkpointer=True`，使其拥有自己的检查点历史。这会在子图**内部**的每一步创建检查点，允许你从其中的特定点进行时间旅行——例如两个中断之间。

使用带 `subgraphs=True` 的 [`get_state`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/getState) 访问子图自己的检查点配置，然后从那里分叉：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Subgraph with its own checkpointer
const subgraph = new StateGraph(StateAnnotation)
  .addNode("stepA", stepA)       // Has interrupt()
  .addNode("stepB", stepB)       // Has interrupt()
  .addEdge(START, "stepA")
  .addEdge("stepA", "stepB")
  .compile({ checkpointer: true });  // Own checkpoint history

const graph = new StateGraph(StateAnnotation)
  .addNode("subgraphNode", subgraph)
  .addEdge(START, "subgraphNode")
  .compile({ checkpointer });

// Run until stepA interrupt, then resume -> hits stepB interrupt
await graph.invoke({ value: [] }, config);
await graph.invoke(new Command({ resume: "Alice" }), config);

// Get the subgraph's own checkpoint (between stepA and stepB)
const parentState = await graph.getState(config, { subgraphs: true });
const subConfig = parentState.tasks[0].state.config;

// Fork from the subgraph checkpoint
const forkConfig = await graph.updateState(subConfig, { value: ["forked"] });
const result = await graph.invoke(null, forkConfig);
// stepB re-executes, stepA's result is preserved
```

有关配置子图检查点写入器的更多内容，参见[子图持久化](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md#subgraph-persistence)。

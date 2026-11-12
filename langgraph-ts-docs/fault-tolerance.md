> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance.md

# 容错

> 在 LangGraph 中配置按节点的超时、重试和错误处理器。

当节点失败时——无论是外部 API 响应缓慢、临时性的网络错误，还是未捕获的异常——LangGraph 都提供三种可以组合使用的机制来应对：

* [**重试**](#retries)：根据异常类型和退避设置，自动重新运行失败的尝试
* [**超时**](#timeouts)：限制单次尝试可以运行多久
* [**错误处理**](#error-handling)：在所有重试都耗尽之后运行一个恢复函数

使用 [**`setNodeDefaults`**](#graph-defaults) 可以一次性为所有节点配置这些机制，而不必在每次调用 `addNode` 时重复配置。

这些机制按固定顺序组合：当某次节点尝试抛出任何异常（包括超时产生的 [`NodeTimeoutError`](https://reference.langchain.com/javascript/langchain-langgraph/index/NodeTimeoutError)）时，由重试策略决定是否重试。只有在重试耗尽之后，才会运行错误处理器。

关于如何在超步（superstep）边界干净地停止运行并在之后恢复，请参阅[优雅关闭](#graceful-shutdown)。

> [!NOTE]
>
> 按节点的超时和节点级错误处理器需要 `@langchain/langgraph>=1.4.0`。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
%%{init:{'theme':'base','themeVariables':{'lineColor':'#40668D','primaryColor':'#E5F4FF','primaryTextColor':'#030710','primaryBorderColor':'#006DDD'}}}%%
flowchart LR
    start([Attempt starts]) --> exec[Run node]
    exec -->|"success"| done([Continue graph])
    exec -->|"any exception<br/>including NodeTimeoutError"| retry{retry_policy<br/>matches?}
    retry -->|"yes, attempts left"| exec
    retry -->|"exhausted or absent"| handler{error_handler?}
    handler -->|"yes"| run_handler["Invoke handler<br/>with NodeError"]
    run_handler --> route([Update state +<br/>Command goto])
    handler -->|"no"| bubble([Exception<br/>bubbles up])

    classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:2px,color:#030710
    classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
    classDef alert fill:#F8E8E6,stroke:#B27D75,stroke-width:2px,color:#634643
    classDef output fill:#EBD0F0,stroke:#885270,stroke-width:2px,color:#441E33

    class exec,run_handler process
    class retry,handler decision
    class bubble alert
    class done,route,start output
```

## 重试

重试策略会根据异常类型和退避设置，自动重新运行失败的节点尝试。

把 `retryPolicy` 传给 [`addNode`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addNode)：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph } from "@langchain/langgraph";

const graph = new StateGraph(State)
  .addNode("callApi", callApi, { retryPolicy: { maxAttempts: 3 } })
  .compile();
```

### 默认行为

重试是选择性启用的。只有当节点配置了 `retryPolicy`（直接配置，或通过图默认值 [`setNodeDefaults`](#graph-defaults) 配置）时，它才会重试。一个空的策略（`{}`）就足够。没有策略时，第一次失败就会结束该次尝试，LangGraph 不会调用 `retryOn`。

如果策略中省略了 `retryOn`，LangGraph 会使用一个内置处理器，它会重试抛出的错误，但以下情况除外：

* 中止与取消错误：`error.name === "AbortError"`，或 `error.message` 以 `"Cancel"` 或 `"AbortError"` 开头
* `GraphValueError`，按 `error.name` 匹配
* 已中止的连接：`error.code === "ECONNABORTED"`
* 状态码为 400、401、402、403、404、405、406、407 或 409 的 HTTP 客户端错误，对于 `fetch`、Axios 及类似客户端，从 `error.response?.status` 或 `error.status` 读取
* OpenAI 风格的配额错误：`error.error?.code === "insufficient_quota"`

其他 HTTP 状态码（包括 408 和 5xx 响应）都是可重试的，除非你覆盖了 `retryOn`。[`NodeTimeoutError`](https://reference.langchain.com/javascript/langchain-langgraph/index/NodeTimeoutError) 不在此阻止列表中，因此配置了重试策略时它是可重试的。

有些失败会绕过 `retryOn`。图控制流错误（例如 `GraphInterrupt` 和 `Command` 路由）会直接向上冒泡，不会重试。运行被中止的信号也会停止重试循环，即使 `retryOn` 会返回 `true`。

### 参数

| 参数 | 类型 | 默认值 | 说明 |
| - | - | - | - |
| `maxAttempts` | `number` | `3` | 最大尝试次数，包含第一次尝试。 |
| `initialInterval` | `number` | `500` | 第一次重试前的毫秒数。 |
| `backoffFactor` | `number` | `2.0` | 每次重试后应用于间隔的乘数。 |
| `maxInterval` | `number` | `128000` | 重试之间的最大毫秒数。 |
| `jitter` | `boolean` | `true` | 为间隔添加随机抖动。 |
| `retryOn` | `(error: unknown) => boolean` | 内置处理器（当设置了策略时） | 对可重试异常返回 `true` 的可调用对象。仅在配置了 `retryPolicy` 时使用。 |
| `logWarning` | `boolean` | `true` | 尝试重试时是否记录警告日志。 |

### 自定义重试逻辑

把一个可调用对象传给 `retryOn`。与 Python 不同，这里没有导出的 `defaultRetryOn` 辅助函数——请自行实现判断逻辑：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph } from "@langchain/langgraph";

class MyCustomError extends Error {}

const graph = new StateGraph(State)
  .addNode("callApi", callApi, {
    retryPolicy: {
      maxAttempts: 3,
      retryOn: (error: unknown) => {
        if (error instanceof MyCustomError) return false;
        // Retry on other errors
        return true;
      },
    },
  })
  .compile();
```

### 查看重试状态

在节点内部使用执行信息可以查看当前的尝试次数。当主调用持续失败时，这有助于切换到备用方案：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, START, END, type Runtime } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  result: z.string(),
});

const myNode = async (state: typeof State.State, runtime: Runtime<typeof State>) => {
  if ((runtime.executionInfo?.nodeAttempt ?? 1) > 1) {  // [!code highlight]
    return { result: await callFallbackApi() };
  }
  return { result: await callPrimaryApi() };
};

const graph = new StateGraph(State)
  .addNode("myNode", myNode, { retryPolicy: { maxAttempts: 3 } })
  .addEdge(START, "myNode")
  .addEdge("myNode", END)
  .compile();
```

`executionInfo` 暴露以下字段：

| 属性 | 类型 | 说明 |
| - | - | - |
| `nodeAttempt` | `number` | 当前尝试次数（从 1 开始计数）。第一次尝试为 `1`，第一次重试为 `2`，依此类推。 |
| `nodeFirstAttemptTime` | `number \| undefined` | 第一次尝试开始时的 Unix 时间戳（毫秒）。在各次重试之间保持不变。 |
| `threadId` | `string \| undefined` | 当前执行的线程 ID。没有检查点保存器时为 `undefined`。 |
| `runId` | `string \| undefined` | 当前运行的运行 ID。未在配置中提供时为 `undefined`。 |
| `checkpointId` | `string` | 当前执行的检查点 ID。 |
| `checkpointNs` | `string` | 当前执行的检查点命名空间。 |
| `taskId` | `string` | 当前执行的任务 ID。 |

即使没有重试策略，`executionInfo` 也是可用的——`nodeAttempt` 默认为 `1`。

## 超时

> [!NOTE]
>
> 需要 `@langchain/langgraph>=1.4.0`。

[`addNode`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addNode) 上的 `timeout` 参数限制单次节点尝试可以运行多久。传入一个数字（毫秒）或一个 [`TimeoutPolicy`](https://reference.langchain.com/javascript/langchain-langgraph/index/TimeoutPolicy) 来分别设置运行上限和空闲上限：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, type TimeoutPolicy } from "@langchain/langgraph";

// Simple wall-clock cap (60 seconds)
new StateGraph(State).addNode("callModel", callModel, { timeout: 60_000 });

// Separate run and idle limits
new StateGraph(State).addNode("callModel", callModel, {
  timeout: { runTimeout: 120_000, idleTimeout: 30_000 },
});
```

### 运行超时

`runTimeout` 是针对单次尝试的硬性时钟上限。无论节点是否有活动，它都不会被刷新：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = new StateGraph(State)
  .addNode("callModel", callModel, {
    timeout: { runTimeout: 120_000 },
  })
  .compile();
```

超出上限时，LangGraph 会抛出 [`NodeTimeoutError`](https://reference.langchain.com/javascript/langchain-langgraph/index/NodeTimeoutError)，清除失败尝试产生的所有写入，然后由重试策略决定是否重试。

### 空闲超时

`idleTimeout` 是一个会随进展重置的上限。只有当节点在指定时长内停止产生可观察的进展时，它才会触发——与 `runTimeout` 不同，只要节点产生进展信号，计时器就会重置：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = new StateGraph(State)
  .addNode("callModel", callModel, {
    timeout: { idleTimeout: 30_000 },
  })
  .compile();
```

你可以同时设置 `runTimeout` 和 `idleTimeout`。两者中先触发的那一个会取消该次尝试。

#### 进展信号

在默认的 `refreshOn: "auto"` 下，空闲计时器会在以下任一情况发生时重置：

* 通过图写入路径进行的状态写入
* 通过 `runtime.writer` 输出的自定义流
* 子任务的调度
* 来自该节点或其子孙节点的任何 LangChain 回调事件（LLM token、工具调用、链开始/结束等）

#### 心跳模式

设置 `refreshOn: "heartbeat"` 可以把刷新来源收窄为仅显式的 `runtime.heartbeat()` 调用。当你需要一个严格的空闲定义、不希望被频繁产生输出的下级组件重置时，这很有用：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = new StateGraph(State)
  .addNode("callModel", callModel, {
    timeout: { idleTimeout: 30_000, refreshOn: "heartbeat" },
  })
  .compile();
```

#### 手动心跳

对于不会自然产生进展信号的长时间运行工作，调用 `runtime.heartbeat()` 手动重置空闲计时器：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateGraph,
  StateSchema,
  START,
  END,
  type Runtime,
} from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  result: z.string(),
});

const longRunningNode = async (
  state: typeof State.State,
  runtime: Runtime<typeof State>
) => {
  for (const batch of fetchBatches()) {
    process(batch);
    runtime.heartbeat?.(); // [!code highlight]
  }
  return { result: "done" };
};

const graph = new StateGraph(State)
  .addNode("longRunningNode", longRunningNode, {
    timeout: { idleTimeout: 30_000, refreshOn: "heartbeat" },
  })
  .addEdge(START, "longRunningNode")
  .addEdge("longRunningNode", END)
  .compile();
```

`runtime.heartbeat()` 在非空闲超时的尝试中是空操作，因此你可以无条件地调用它。

### NodeTimeoutError

超时触发时，LangGraph 会抛出 [`NodeTimeoutError`](https://reference.langchain.com/javascript/langchain-langgraph/index/NodeTimeoutError)，其中带有关于命中了哪个上限的结构化上下文：

| 属性 | 类型 | 说明 |
| - | - | - |
| `node` | `string` | 执行超时的节点名称。 |
| `elapsed` | `number` | 超时触发前已经过的毫秒数。 |
| `kind` | `"idle" \| "run"` | 触发的是哪一种超时。 |
| `timeout` | `number` | 触发的那项超时的值（毫秒）。 |
| `idleTimeout` | `number \| undefined` | 配置的空闲超时（毫秒），如果存在。 |
| `runTimeout` | `number \| undefined` | 配置的运行超时（毫秒），如果存在。 |

在 TypeScript 中使用 `isNodeTimeoutError(error)` 来收窄捕获到的错误类型。

`NodeTimeoutError` 默认是可重试的。把 `timeout` 与重试策略结合使用开箱即用——超时计时器会在每次新尝试时重置，而超时尝试产生的写入会在下一次重试之前被清除：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = new StateGraph(State)
  .addNode("callModel", callModel, {
    timeout: { idleTimeout: 30_000 },
    retryPolicy: { maxAttempts: 3 },
  })
  .compile();
```

### 使用 Send 的动态超时

使用 [`Send`](https://reference.langchain.com/javascript/langchain-langgraph/index/Send) 动态分发节点时（例如在 map-reduce 模式中），你可以在 `Send` 上直接传入超时，针对该次特定推送覆盖目标节点的静态超时：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Send } from "@langchain/langgraph";

const fanOut = (state: typeof State.State) =>
  state.items.map(
    (item) =>
      new Send("processItem", { item }, { timeout: { idleTimeout: 15_000 } })
  );
```

如果在 `Send` 上省略了超时，则应用目标节点的超时（在 [`addNode`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addNode) 时设置）。这让你可以在节点上设置默认超时，并针对单次调用收紧它。

## 错误处理

> [!NOTE]
>
> 需要 `@langchain/langgraph>=1.4.0`。

错误处理器在节点失败且所有重试都耗尽之后运行。它接收当前状态，并且可以更新状态，或使用 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 路由到其他节点。这对于补偿流程（Saga 模式）很有用——你希望优雅地恢复，而不是中止整个图。

把 `errorHandler` 传给 [`StateGraph`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph) 上的 [`addNode`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph/addNode)（仅限 `StateGraph`，不包括基类 `Graph`）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateGraph,
  StateSchema,
  START,
  Command,
  NodeError,
} from "@langchain/langgraph";
import * as z from "zod";

class ConnectionError extends Error {}

const State = new StateSchema({
  status: z.string(),
});

const chargePayment = () => {
  throw new Error("payment gateway timeout");
};

const paymentErrorHandler = (
  state: typeof State.State,
  error: NodeError
) =>
  new Command({
    update: { status: `compensated: ${error.error.message}` },
    goto: "finalize",
  });

const finalize = (state: typeof State.State) => state;

const graph = new StateGraph(State)
  .addNode("chargePayment", chargePayment, {
    retryPolicy: {
      maxAttempts: 3,
      retryOn: (err) => err instanceof ConnectionError,
    },
    errorHandler: paymentErrorHandler,
  })
  .addNode("finalize", finalize)
  .addEdge(START, "chargePayment")
  .compile();
```

处理器只有在重试策略耗尽之后才会触发；如果没有配置重试策略，则立即触发。重试策略与错误处理器保持解耦：你可以独立地配置何时重试、何时补偿。

### NodeError

错误处理器通过带类型的 `error: NodeError` 参数接收失败上下文：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command, NodeError } from "@langchain/langgraph";

const myHandler = (state: typeof State.State, error: NodeError) => {
  console.log(`Node ${error.node} failed with: ${error.error.message}`);
  return new Command({
    update: { status: "recovered" },
    goto: "nextStep",
  });
};
```

[`NodeError`](https://reference.langchain.com/javascript/langchain-langgraph/index/NodeError) 是一个包含两个字段的类：

| 属性 | 类型 | 说明 |
| - | - | - |
| `node` | `string` | 执行失败的节点名称。 |
| `error` | `Error` | 失败节点抛出的异常。 |

`error: NodeError` 参数是选择性接收的。不需要失败上下文的处理器可以省略第二个参数，只接收 `state`。

### 使用 Command 进行路由

错误处理器可以返回一个 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 来更新状态并路由到特定节点，从而实现 Saga / 补偿模式：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  StateGraph,
  StateSchema,
  START,
  Command,
  NodeError,
} from "@langchain/langgraph";
import * as z from "zod";

class ConnectionError extends Error {}

const State = new StateSchema({
  status: z.string(),
});

const reserveInventory = () => ({ status: "reserved" });

const chargePayment = () => {
  throw new Error("payment timeout");
};

const paymentErrorHandler = (
  state: typeof State.State,
  error: NodeError
) =>
  new Command({
    update: {
      status: `compensated_after_${error.node}: ${error.error.message}`,
    },
    goto: "finalize",
  });

const finalize = (state: typeof State.State) => state;

const graph = new StateGraph(State)
  .addNode("reserveInventory", reserveInventory)
  .addNode("chargePayment", chargePayment, {
    retryPolicy: {
      maxAttempts: 3,
      retryOn: (err) => err instanceof ConnectionError,
    },
    errorHandler: paymentErrorHandler,
  })
  .addNode("finalize", finalize)
  .addEdge(START, "reserveInventory")
  .addEdge("reserveInventory", "chargePayment")
  .compile();
```

`chargePayment` 会在遇到 `ConnectionError` 时最多重试 3 次。如果重试耗尽（或错误不是 `ConnectionError`），处理器会通过更新状态并路由到 `finalize` 来补偿，而不是中止整个图。

### 可安全恢复的失败

> [!NOTE]
>
> 失败的来源信息会被检查点保存。如果图在节点失败之后、处理器完成之前被中断，或进程崩溃，那么当图从检查点恢复时，处理器看到的仍是相同的 `NodeError` 上下文。

### 与 `interrupt()` 一起使用时的行为

> [!WARNING]
>
> 在节点内部抛出的 `interrupt()` **不会**被路由到错误处理器。中断使用 `GraphBubbleUp` 机制为人在环路工作流暂停图执行，会同时绕过重试策略和错误处理器。图会照常暂停。

### 子图失败

如果某个节点包装了一个子图，而该子图抛出了未处理的异常，那么这个异常会向上呈现给父节点。如果父节点有错误处理器，处理器会以子图的异常作为 `error.error` 触发。

## 图默认值

> [!NOTE]
>
> 需要 `@langchain/langgraph>=1.4.0`。

与其在每次调用 `addNode` 时重复相同的 `retryPolicy`、`errorHandler`、`timeout` 或 `cachePolicy`，不如使用 [`setNodeDefaults`](https://reference.langchain.com/javascript/langchain-langgraph/index/StateGraph#member-setNodeDefaults) 在一处配置全图范围的默认值：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, START, NodeError } from "@langchain/langgraph";

const defaultErrorHandler = (
  state: typeof State.State,
  error: NodeError
) => ({ status: `handled: ${error.error.message}` });

const graph = new StateGraph(State)
  .setNodeDefaults({
    retryPolicy: { maxAttempts: 3 },
    errorHandler: defaultErrorHandler,
    timeout: { runTimeout: 30_000 },
    cachePolicy: { ttl: 60 },
  })
  .addNode("stepA", stepA)
  .addNode("stepB", stepB)
  .addEdge(START, "stepA")
  .compile();
```

现在 `stepA` 和 `stepB` 共享相同的重试策略、错误处理器、超时和缓存策略，无需任何重复配置。

### 优先级

直接传给 `addNode()` 的按节点取值始终覆盖 `setNodeDefaults()` 设置的默认值。默认值在 `compile()` 时解析，因此你可以以任意顺序在 `addNode()` 之前或之后调用 `setNodeDefaults()`：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, START } from "@langchain/langgraph";

const graph = new StateGraph(State)
  .setNodeDefaults({ errorHandler: defaultErrorHandler })
  .addNode("stepA", stepA) // uses defaultErrorHandler
  .addNode("stepB", stepB, { errorHandler: customErrorHandler }) // overrides default
  .addEdge(START, "stepA")
  .compile();
```

### 默认错误处理器

当每次图运行都对应一个外部流程（例如后台任务表中的一行记录），且任何未处理的节点失败都应将那个流程标记为失败时，`errorHandler` 默认值尤其有价值——这样就不必在每个 `addNode` 上重复 `errorHandler`。当某一步骤需要自己的补偿逻辑时，按节点的处理器仍然优先：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command, NodeError, StateGraph, START } from "@langchain/langgraph";

const markProcessFailed = (
  state: typeof State.State,
  error: NodeError
) => {
  // Persist failure on the external process row keyed by processId.
  return { status: `failed at ${error.node}: ${error.error.message}` };
};

const refundPayment = (state: typeof State.State, error: NodeError) =>
  new Command({
    update: { status: `compensated after ${error.node}` },
    goto: "finalize",
  });

const graph = new StateGraph(State)
  .setNodeDefaults({
    retryPolicy: { maxAttempts: 3 },
    errorHandler: markProcessFailed,
  })
  .addNode("fetchData", fetchData) // uses markProcessFailed
  .addNode("chargePayment", chargePayment, {
    errorHandler: refundPayment, // overrides the graph-wide default
  })
  .addNode("finalize", finalize)
  .addEdge(START, "fetchData")
  .addEdge("fetchData", "chargePayment")
  .compile();
```

如果 `fetchData` 在重试之后失败，`markProcessFailed` 会运行。如果 `chargePayment` 在重试之后失败，则改为运行 `refundPayment`，因为按节点的处理器覆盖了默认值。

### 适用性矩阵

并非所有默认值都适用于所有节点类型。错误处理器节点（通过 `addNode(..., { errorHandler })` 注册的节点）被排除在某些默认值之外，以防止不安全的行为：

| `setNodeDefaults` 参数 | 适用于常规节点 | 适用于错误处理器节点 | 原因 |
| - | - | - | - |
| `retryPolicy` | ✅ | ✅ | 处理器在临时性失败时也应重试 |
| `timeout` | ✅ | ✅ | 卡住的处理器应像卡住的常规节点一样被取消 |
| `errorHandler` | ✅ | ❌ | 处理器绝不能捕获自身 |
| `cachePolicy` | ✅ | ❌ | 缓存处理器结果是不安全的 |

### 作用范围

在父图上设置的默认值**不会**被子图继承。每个图维护自己的默认值。

## 函数式 API

`task` 和 `entrypoint` 上可以使用 `timeout` 选项；`task` 还接受 `retry` 选项（注意不是 `retryPolicy`）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, task } from "@langchain/langgraph";

const callApi = task(
  {
    name: "callApi",
    timeout: { idleTimeout: 30_000 },
    retry: { maxAttempts: 3 },
  },
  async (url: string) => {
    const response = await fetch(url);
    return response.text();
  }
);

const myWorkflow = entrypoint(
  { name: "myWorkflow", timeout: 60_000 },
  async (inputs: { url: string }) => {
    return await callApi(inputs.url);
  }
);
```

其行为与 `addNode` 一致：超时时抛出 `NodeTimeoutError`，缓冲区中的写入被清除，由重试策略决定是否重试。在 JavaScript/TypeScript SDK 中，`task` / `entrypoint` 上不提供错误处理器——请改用 `StateGraph.addNode(..., { errorHandler })`。

## 优雅关闭

协作式关闭让你可以在当前超步完成后停止正在进行的图运行，并保存一个可恢复的检查点。这对于处理 SIGTERM 信号，或任何需要在不丢失工作的情况下回收资源的外部监督程序都很有用。

> [!NOTE]
>
> 需要 `@langchain/langgraph>=1.4.0`。

创建一个 [`RunControl`](https://reference.langchain.com/javascript/langchain-langgraph/index/RunControl)，并把它作为 `control` 传给 `invoke` 或 `stream`。从任意上下文调用 `requestDrain()` 即可发出该运行应停止的信号：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { RunControl, GraphDrained } from "@langchain/langgraph";

const control = new RunControl();

// In a signal handler or supervisor:
// control.requestDrain("sigterm");

try {
  const result = await graph.invoke(inputs, { ...config, control });
} catch (e) {
  if (e instanceof GraphDrained) {
    // The graph stopped early and saved a checkpoint.
    // Resume later with the same config.
    console.log(`Drained: ${e.reason}`);
  } else {
    throw e;
  }
}
```

### 语义

排空（drain）是协作式的，在超步之间生效，绝不会抢占已经在运行的工作：

| 场景 | 行为 |
| - | - |
| 节点正在执行中途 | 运行至完成。排空在下一个超步生效。 |
| 带重试策略的节点正在重试 | 重试循环运行至耗尽或成功。之后排空生效。 |
| 图与排空在同一 tick 自然完成 | 正常返回。检查 `control.drainRequested` 以区分于正常运行。 |
| 还有更多超步 | 抛出 `GraphDrained(reason)`。检查点被保存且可恢复。 |
| 子图请求排空 | `GraphDrained` 向上冒泡穿过父图，并在父图自己的下一个超步边界处停止它。 |

### 排空后恢复

使用相同的 `thread_id`，通过 `invoke(null, config)` 恢复一个已排空的运行：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await graph.invoke(null, config);
```

### 在节点内读取排空状态

通过 `runtime` 参数访问排空状态，以便在到达超步边界之前调整节点行为：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { type Runtime } from "@langchain/langgraph";

const myNode = async (state: typeof State.State, runtime: Runtime<typeof State>) => {
  if (runtime.control?.drainRequested) {
    // Skip expensive work and return a minimal result
    return { status: "skipped", reason: runtime.control.drainReason };
  }
  return { status: await doWork() };
};
```

### SIGTERM 钩子模式

处理进程关闭的推荐模式：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import process from "node:process";
import { RunControl, GraphDrained } from "@langchain/langgraph";

const control = new RunControl();
process.on("SIGTERM", () => control.requestDrain("sigterm"));

try {
  const result = await graph.invoke(inputs, { ...config, control });
} catch (e) {
  if (e instanceof GraphDrained) {
    console.log(`graph drained: ${e.reason}`);
    // Resume on next startup with the same config
  } else {
    throw e;
  }
}
```

> [!NOTE]
>
> `requestDrain()` 不会取消正在进行的异步工作。如果需要硬性上限，请把排空与优雅超时和 `AbortSignal` 配合使用。

## 限制

* **`setNodeDefaults` 不会被子图继承**：每个图独立管理自己的默认值。
* **错误处理器仅限 `StateGraph`**：把 `errorHandler` 传给 `StateGraph.addNode`，而不是基类 `Graph`。`task` / `entrypoint` 上不提供错误处理器。
* **每个节点一个处理器**：每个节点最多只能有一个 `errorHandler`。
* **处理器失败会向上冒泡**：如果错误处理器本身抛出异常，该异常会像节点没有处理器一样向外传播。

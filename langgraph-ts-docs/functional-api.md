> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/functional-api.md

# Functional API 概览

**Functional API** 让你以对现有代码最小的改动，为应用添加 LangGraph 的关键特性（[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)、[记忆](https://docs.langchain.com/oss/javascript/langgraph/add-memory.md)、[人机回环](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)和[流式传输](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)）。

它旨在把这些特性集成到现有代码中，而这些代码可能使用标准的语言原语来实现分支和控制流，例如 `if` 语句、`for` 循环和函数调用。与许多要求把代码重构为显式流水线或 DAG 的数据编排框架不同，Functional API 允许你引入这些能力，而不强加一种僵化的执行模型。

Functional API 使用两个关键构建块：

* **`entrypoint`**：entrypoint 封装工作流逻辑并管理执行流，包括处理长时间运行的任务和中断。
* **`task`**：表示一个离散的工作单元，例如一次 API 调用或一个数据处理步骤，可以在 entrypoint 内异步执行。task 返回一个类似 future 的对象，可以 await 或同步解析。

这为构建具备状态管理和流式传输能力的工作流提供了最小化的抽象。

> [!TIP]
>
> 关于如何使用 Functional API 的信息，参见[使用 Functional API](https://docs.langchain.com/oss/javascript/langgraph/use-functional-api.md)。

## Functional API 与图 API 的对比

对于偏好更声明式方式的用户，LangGraph 的[图 API](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md) 允许你使用图范式定义工作流。两个 API 共享相同的底层运行时，因此你可以在同一个应用中一起使用它们。

以下是一些关键差异：

* **控制流**：Functional API 不要求考虑图结构。你可以使用标准的语言构造来定义工作流。这通常会减少你需要编写的代码量。
* **短期记忆**：**图 API** 要求声明[**状态**](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#state)，并且可能需要定义 [**reducer**](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#reducers) 来管理对图状态的更新。`@entrypoint` 和 `@tasks` 不需要显式的状态管理，因为它们的状态作用域限于函数内部，不跨函数共享。
* **检查点**：两个 API 都会生成并使用检查点。在**图 API** 中，每个[超步](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md)之后都会生成新的检查点。在 **Functional API** 中，task 执行时，其结果会被保存到与给定 entrypoint 关联的已有检查点，而不会创建新的检查点。
* **可视化**：图 API 让你可以轻松地把工作流可视化为图，这对于调试、理解工作流以及与其他人分享都很有用。Functional API 不支持可视化，因为图是在运行时动态生成的。

## 示例

下面我们演示一个简单的应用：它写一篇文章，并[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)以请求人工审核。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MemorySaver, entrypoint, task, interrupt } from "@langchain/langgraph";

const writeEssay = task("writeEssay", async (topic: string) => {
  // A placeholder for a long-running task.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return `An essay about topic: ${topic}`;
});

const workflow = entrypoint(
  { checkpointer: new MemorySaver(), name: "workflow" },
  async (topic: string) => {
    const essay = await writeEssay(topic);
    const isApproved = interrupt({
      // Any json-serializable payload provided to interrupt as argument.
      // It will be surfaced on the client side as an Interrupt when streaming data
      // from the workflow.
      essay, // The essay we want reviewed.
      // We can add any additional information that we need.
      // For example, introduce a key called "action" with some instructions.
      action: "Please approve/reject the essay",
    });

    return {
      essay, // The essay that was generated
      isApproved, // Response from HIL
    };
  }
);
```

> **详细说明**
>
> 该工作流会围绕主题 "cat" 写一篇文章，然后暂停以获取人工审核。工作流可以被中断任意长的时间，直到提供审核结果。
>
> 当工作流恢复时，它从最开始执行，但由于 `writeEssay` task 的结果已被保存，task 结果会从检查点加载，而不是重新计算。
>
> ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { MemorySaver, entrypoint, interrupt, task } from "@langchain/langgraph";
>
> const writeEssay = task("writeEssay", async (topic: string) => {
>   // This is a placeholder for a long-running task.
>   await new Promise((resolve) => setTimeout(resolve, 1000));
>   return `An essay about topic: ${topic}`;
> });
>
> const workflow = entrypoint(
>   { checkpointer: new MemorySaver(), name: "workflow" },
>   async (_topic: string) => {
>     const essay = await writeEssay("cat");
>     const isApproved = interrupt({
>       // Any json-serializable payload provided to interrupt as argument.
>       // It will be surfaced on the client side as an Interrupt when streaming data
>       // from the workflow.
>       essay, // The essay we want reviewed.
>       // We can add any additional information that we need.
>       // For example, introduce a key called "action" with some instructions.
>       action: "Please approve/reject the essay",
>     });
>
>     return {
>       essay, // The essay that was generated
>       isApproved, // Response from HIL
>     };
>   },
> );
>
> const threadId = "functional-api-thread";
> const config = {
>   configurable: {
>     thread_id: threadId,
>   },
> };
>
> const stream = await workflow.streamEvents("cat", { ...config, version: "v2" });
> const initialChunks: Record<string, unknown>[] = [];
> for await (const event of stream) {
>   const chunk = event.data?.chunk;
>   if (chunk && typeof chunk === "object") {
>     console.log(chunk);
>     initialChunks.push(chunk as Record<string, unknown>);
>   }
> }
> // { writeEssay: "An essay about topic: cat" }
> // { __interrupt__: [Interrupt(...)] }
> ```
>
> 文章已经写好，可以开始审核。提供审核结果后，我们就可以恢复工作流：
>
> ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { Command } from "@langchain/langgraph";
>
> // Get review from a user (e.g., via a UI)
> // In this case, we're using a bool, but this can be any json-serializable value.
> const humanReview = true;
>
> const resumedStream = await workflow.streamEvents(
>   new Command({ resume: humanReview }),
>   { ...config, version: "v2" },
> );
> const resumedChunks: Record<string, unknown>[] = [];
> for await (const event of resumedStream) {
>   const chunk = event.data?.chunk;
>   if (chunk && typeof chunk === "object") {
>     console.log(chunk);
>     resumedChunks.push(chunk as Record<string, unknown>);
>   }
> }
> // { essay: "An essay about topic: cat", isApproved: true }
> ```
>
> 工作流已完成，审核结果已被添加到文章中。

## entrypoint

[`entrypoint`](https://reference.langchain.com/javascript/langchain-langgraph/index/entrypoint) 函数可用于把一个函数变成工作流。它封装工作流逻辑并管理执行流，包括处理*长时间运行的任务*和[中断](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)。

### 定义

**entrypoint** 通过调用 `entrypoint` 函数并传入配置和一个函数来定义。

该函数**必须接受单一位置参数**，它作为工作流的输入。如果你需要传入多个数据项，请使用对象作为第一个参数的类型。

用函数创建 entrypoint 会生成一个工作流实例，它帮助管理该工作流的执行（例如处理流式传输、恢复和检查点）。

你通常希望向 `entrypoint` 函数传入一个**检查点保存器**，以启用持久化并使用**人机回环**等特性。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint } from "@langchain/langgraph";

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (someInput: Record<string, any>): Promise<number> => {
    // some logic that may involve long-running tasks like API calls,
    // and may be interrupted for human-in-the-loop
    return result;
  }
);
```

> [!WARNING]
>
> **序列化**
> entrypoint 的**输入**和**输出**必须可 JSON 序列化，以支持检查点。更多细节请参见[序列化](#serialization)章节。

### 执行

使用 [`entrypoint`](#entrypoint) 函数会返回一个对象，可以通过 `invoke` 和 `stream` 方法执行。

**调用**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "some_thread_id"
  }
};
await myWorkflow.invoke(someInput, config); // Wait for the result
```

**流式传输**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "some_thread_id"
  }
};

const stream = await myWorkflow.streamEvents(someInput, config, { version: "v3" });
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

### 恢复

在[中断](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt)之后恢复执行，可以通过向 [`Command`](https://reference.langchain.com/javascript/langchain-langgraph/index/Command) 原语传入 **resume** 值来完成。

**调用**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

const config = {
  configurable: {
    thread_id: "some_thread_id"
  }
};

await myWorkflow.invoke(new Command({ resume: someResumeValue }), config);
```

**流式传输**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

const config = {
  configurable: {
    thread_id: "some_thread_id"
  }
};

const stream = await myWorkflow.streamEvents(
  new Command({ resume: someResumableValue }),
  config,
  { version: "v3" },
);

for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

**在错误后恢复**

要在错误后恢复，请用 `null` 和相同的**线程 ID**（config）运行 `entrypoint`。

这假定底层的**错误**已经解决，执行可以继续成功进行。

**调用**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "some_thread_id"
  }
};

await myWorkflow.invoke(null, config);
```

**流式传输**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "some_thread_id"
  }
};

const stream = await myWorkflow.streamEvents(null, config, { version: "v3" });
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

### 短期记忆

当 `entrypoint` 定义了 `checkpointer` 时，它会在同一**线程 ID** 上连续多次调用之间，把信息存储在[检查点](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md#checkpoints)中。

这让你可以使用 `getPreviousState` 函数访问上一次调用中的状态。

默认情况下，`getPreviousState` 函数返回上一次调用的返回值。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, getPreviousState } from "@langchain/langgraph";

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (number: number) => {
    const previous = getPreviousState<number>() ?? 0;
    return number + previous;
  }
);

const config = {
  configurable: {
    thread_id: "some_thread_id",
  },
};

await myWorkflow.invoke(1, config); // 1 (previous was undefined)
await myWorkflow.invoke(2, config); // 3 (previous was 1 from the previous invocation)
```

#### `entrypoint.final`

[`entrypoint.final`](https://reference.langchain.com/javascript/langchain-langgraph/index/entrypoint/final) 是一个特殊原语，可以从 entrypoint 返回，它允许把**保存在检查点中的值**与 **entrypoint 的返回值**解耦。

第一个值是 entrypoint 的返回值，第二个值是将被保存在检查点中的值。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, getPreviousState } from "@langchain/langgraph";

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (number: number) => {
    const previous = getPreviousState<number>() ?? 0;
    // This will return the previous value to the caller, saving
    // 2 * number to the checkpoint, which will be used in the next invocation
    // for the `previous` parameter.
    return entrypoint.final({
      value: previous,
      save: 2 * number,
    });
  }
);

const config = {
  configurable: {
    thread_id: "1",
  },
};

await myWorkflow.invoke(3, config); // 0 (previous was undefined)
await myWorkflow.invoke(1, config); // 6 (previous was 3 * 2 from the previous invocation)
```

## task

**task** 表示一个离散的工作单元，例如一次 API 调用或一个数据处理步骤。它有两个关键特征：

* **异步执行**：task 设计为异步执行，允许多个操作并发运行而不阻塞。
* **检查点**：task 结果会被保存到检查点，从而能够从上次保存的状态恢复工作流。（更多细节参见[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)）。

### 定义

task 使用 `task` 函数定义，它会包装一个普通函数。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task } from "@langchain/langgraph";

const slowComputation = task("slowComputation", async (inputValue: any) => {
  // Simulate a long-running operation
  return result;
});
```

> [!WARNING]
>
> **序列化**
> task 的**输出**必须可 JSON 序列化，以支持检查点。

### 执行

**task** 只能在**entrypoint**、另一个 **task** 或[状态图节点](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#nodes)内部调用。

task *不能*直接从主应用代码中调用。

当你调用 **task** 时，它返回一个可以 await 的 Promise。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (someInput: number): Promise<number> => {
    return await slowComputation(someInput);
  }
);
```

## 何时使用 task

**task** 在以下场景中很有用：

* **检查点**：当你需要把长时间运行操作的结果保存到检查点，以免在恢复工作流时需要重新计算。
* **人机回环**：如果你正在构建需要人工介入的工作流，你**必须**使用 **task** 来封装任何随机性（例如 API 调用），以确保工作流能够正确恢复。更多细节参见[确定性](#determinism)章节。
* **并行执行**：对于 I/O 密集型任务，**task** 支持并行执行，允许多个操作并发运行而不阻塞（例如调用多个 API）。
* **可观测性**：把操作包装在 **task** 中，提供了一种使用 [LangSmith](https://docs.langchain.com/langsmith/observability.md) 跟踪工作流进度并监控单个操作执行情况的方式。
* **可重试的工作**：当工作需要重试以应对失败或不一致时，**task** 提供了一种封装和管理重试逻辑的方式。

## 序列化

LangGraph 中的序列化有两个关键方面：

1. `entrypoint` 的输入和输出必须可 JSON 序列化。
2. `task` 的输出必须可 JSON 序列化。

这些要求是启用检查点和工作流恢复的必要条件。请使用对象、数组、字符串、数字和布尔值等原语，以确保你的输入和输出可序列化。

序列化确保工作流状态（例如 task 结果和中间值）能够被可靠地保存和恢复。这对支持人机回环交互、容错和并行执行至关重要。

如果提供了不可序列化的输入或输出，当为工作流配置了检查点保存器时，会在运行时抛出错误。

## 确定性

当你恢复一次工作流运行时，代码**不会**从执行停止的**同一行代码**继续。执行会回到某个检查点边界，然后工作流**重放**向前推进，直到再次到达暂停点。

对于 Functional API，重放从 **entrypoint** 的开头开始，LangGraph 会从检查点恢复已完成的 [**task**](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#task) 和 [**子图**](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)结果，而不是重新计算它们。这就在多次暂停之间保持了已记录的步骤顺序，对于长时间运行或非确定性的 **task** 输出也是如此。

要使用**人机回环**等特性，你必须把非确定性工作（例如随机值）和副作用（例如写文件或调用 API）放在 [**task**](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#task) 中。

工作流的不同运行可以产生不同结果，但恢复**特定**线程时应重放相同的持久化 **task** 和**子图**结果。

为确保工作流具有确定性并且可以一致地重放，请遵循以下准则：

* **避免重复执行工作**：在 **entrypoint** 中，如果你串联了多个副作用（例如日志记录、写文件或网络调用），请为每个副作用分配独立的 **task**，这样恢复时会从检查点还原它们的输出，而不是重新运行它们。
* **封装非确定性操作**：把可能在多次尝试之间变化的值（例如随机数或读取墙上时钟）保留在 **task** 内部，使重放与检查点记录的内容保持一致。
* **使用幂等操作**：关于部分 task 失败和重试，参见[幂等性](#idempotency)。

## 幂等性

幂等性确保多次运行同一操作会产生相同结果。这有助于防止在某个步骤因失败而重新运行时产生重复的 API 调用和冗余处理。始终把 API 调用放在 **task** 函数内部以便写入检查点，并把它们设计为在重新执行时具有幂等性。
这对于会导致数据写入的操作尤其重要。
当工作流恢复时，LangGraph 会从检查点重放已完成的 **task** 结果。已经开始但未完成的 **task** 可能在该次恢复中再次运行，因此请把副作用设计为幂等的。使用幂等键或校验已有结果，以避免意外的重复。

## 常见陷阱

### 处理副作用

把副作用（例如写入文件、发送邮件）封装在 task 中，以确保在恢复工作流时它们不会被多次执行。

**错误做法**

在这个例子中，副作用（写入文件）被直接包含在工作流中，因此恢复工作流时它会被第二次执行。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, interrupt } from "@langchain/langgraph";
import fs from "fs";

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow },
  async (inputs: Record<string, any>) => {
    // This code will be executed a second time when resuming the workflow.
    // Which is likely not what you want.
    fs.writeFileSync("output.txt", "Side effect executed");
    const value = interrupt("question");
    return value;
  }
);
```

**正确做法**

在这个例子中，副作用被封装在 task 中，确保恢复时执行结果一致。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, task, interrupt } from "@langchain/langgraph";
import * as fs from "fs";

const writeToFile = task("writeToFile", async () => {
  fs.writeFileSync("output.txt", "Side effect executed");
});

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (inputs: Record<string, any>) => {
    // The side effect is now encapsulated in a task.
    await writeToFile();
    const value = interrupt("question");
    return value;
  }
);
```

### 非确定性控制流

可能每次返回不同结果的操作（例如获取当前时间或随机数）应封装在 task 中，以确保恢复时返回相同的结果。

* 在 task 中：获取随机数（5）→ 中断 → 恢复 →（再次返回 5）→ ...
* 不在 task 中：获取随机数（5）→ 中断 → 恢复 → 获取新的随机数（7）→ ...

当在**人机回环**工作流中使用多次 interrupt 调用时，这一点尤其重要。LangGraph 会为每个 task/entrypoint 维护一个 resume 值列表。遇到中断时，它会与对应的 resume 值匹配。这种匹配严格**基于索引**，因此 resume 值的顺序应与中断的顺序一致。

如果恢复时执行顺序未被保持，某次 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用可能会与错误的 `resume` 值匹配，导致结果错误。

更多细节请阅读[确定性](#determinism)章节。

**错误做法**

在这个例子中，工作流使用当前时间来决定执行哪个 task。这是非确定性的，因为工作流的结果取决于执行时刻。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, interrupt } from "@langchain/langgraph";

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (inputs: { t0: number }) => {
    const t1 = Date.now();

    const deltaT = t1 - inputs.t0;

    if (deltaT > 1000) {
      const result = await slowTask(1);
      const value = interrupt("question");
      return { result, value };
    } else {
      const result = await slowTask(2);
      const value = interrupt("question");
      return { result, value };
    }
  }
);
```

**正确做法**

在这个例子中，工作流使用输入 `t0` 来决定执行哪个 task。这是确定性的，因为工作流的结果只取决于输入。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, task, interrupt } from "@langchain/langgraph";

const getTime = task("getTime", () => Date.now());

const myWorkflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (inputs: { t0: number }): Promise<any> => {
    const t1 = await getTime();

    const deltaT = t1 - inputs.t0;

    if (deltaT > 1000) {
      const result = await slowTask(1);
      const value = interrupt("question");
      return { result, value };
    } else {
      const result = await slowTask(2);
      const value = interrupt("question");
      return { result, value };
    }
  }
);
```

## 了解更多

* [如何使用 Functional API](https://docs.langchain.com/oss/javascript/langgraph/use-functional-api.md)
* [图 API 概念概览](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md)
* [在图 API 与 Functional API 之间选择](https://docs.langchain.com/oss/javascript/langgraph/choosing-apis.md)

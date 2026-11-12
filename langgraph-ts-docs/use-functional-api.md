> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/use-functional-api.md

# 使用 Functional API

[**Functional API**](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md) 让你以对现有代码最小的改动，为应用添加 LangGraph 的关键特性（[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)、[记忆](https://docs.langchain.com/oss/javascript/langgraph/add-memory.md)、[人机回环](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)和[流式传输](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)）。

> [!TIP]
>
> 关于 Functional API 的概念信息，参见 [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md)。

## 创建简单工作流

定义 `entrypoint` 时，输入被限制为函数的第一个参数。要传入多个输入，你可以使用一个字典。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const checkpointer = new MemorySaver();

const myWorkflow = entrypoint(
  { checkpointer, name: "myWorkflow" },
  async (inputs: { value: number; anotherValue: number }) => {
    const value = inputs.value;
    const anotherValue = inputs.anotherValue;
    // ...
  }
);

await myWorkflow.invoke({ value: 1, anotherValue: 2 });
```

> **扩展示例：简单工作流**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { v7 as uuid7 } from "uuid";
> import { entrypoint, task, MemorySaver } from "@langchain/langgraph";
>
> // Task that checks if a number is even
> const isEven = task("isEven", async (number: number) => {
>   return number % 2 === 0;
> });
>
> // Task that formats a message
> const formatMessage = task("formatMessage", async (isEven: boolean) => {
>   return isEven ? "The number is even." : "The number is odd.";
> });
>
> // Create a checkpointer for persistence
> const checkpointer = new MemorySaver();
>
> const workflow = entrypoint(
>   { checkpointer, name: "workflow" },
>   async (inputs: { number: number }) => {
>     // Simple workflow to classify a number
>     const even = await isEven(inputs.number);
>     return await formatMessage(even);
>   }
> );
>
> // Run the workflow with a unique thread ID
> const config = { configurable: { thread_id: uuid7() } };
> const result = await workflow.invoke({ number: 7 }, config);
> console.log(result);
> ```

> **扩展示例：用 LLM 写一篇文章**
>
> 这个例子演示如何在语法上使用 `@task` 和 `@entrypoint` 装饰器。
> 由于提供了检查点保存器，工作流结果会被持久化到检查点中。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { v7 as uuid7 } from "uuid";
> import { ChatOpenAI } from "@langchain/openai";
> import { entrypoint, task, MemorySaver } from "@langchain/langgraph";
>
> const model = new ChatOpenAI({ model: "gpt-3.5-turbo" });
>
> // Task: generate essay using an LLM
> const composeEssay = task("composeEssay", async (topic: string) => {
>   // Generate an essay about the given topic
>   const response = await model.invoke([
>     { role: "system", content: "You are a helpful assistant that writes essays." },
>     { role: "user", content: `Write an essay about ${topic}.` }
>   ]);
>   return response.content as string;
> });
>
> // Create a checkpointer for persistence
> const checkpointer = new MemorySaver();
>
> const workflow = entrypoint(
>   { checkpointer, name: "workflow" },
>   async (topic: string) => {
>     // Simple workflow that generates an essay with an LLM
>     return await composeEssay(topic);
>   }
> );
>
> // Execute the workflow
> const config = { configurable: { thread_id: uuid7() } };
> const result = await workflow.invoke("the history of flight", config);
> console.log(result);
> ```

## 并行执行

task 可以通过并发调用它们并等待结果来实现并行执行。这对于提升 IO 密集型任务（例如为 LLM 调用 API）的性能很有用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const addOne = task("addOne", async (number: number) => {
  return number + 1;
});

const graph = entrypoint(
  { checkpointer, name: "graph" },
  async (numbers: number[]) => {
    return await Promise.all(numbers.map(addOne));
  }
);
```

> **扩展示例：并行 LLM 调用**
>
> 这个例子演示如何使用 `@task` 并行运行多个 LLM 调用。每次调用围绕不同主题生成一段文字，结果被拼接成单一文本输出。
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { v7 as uuid7 } from "uuid";
> import { ChatOpenAI } from "@langchain/openai";
> import { entrypoint, task, MemorySaver } from "@langchain/langgraph";
>
> // Initialize the LLM model
> const model = new ChatOpenAI({ model: "gpt-3.5-turbo" });
>
> // Task that generates a paragraph about a given topic
> const generateParagraph = task("generateParagraph", async (topic: string) => {
>   const response = await model.invoke([
>     { role: "system", content: "You are a helpful assistant that writes educational paragraphs." },
>     { role: "user", content: `Write a paragraph about ${topic}.` }
>   ]);
>   return response.content as string;
> });
>
> // Create a checkpointer for persistence
> const checkpointer = new MemorySaver();
>
> const workflow = entrypoint(
>   { checkpointer, name: "workflow" },
>   async (topics: string[]) => {
>     // Generates multiple paragraphs in parallel and combines them
>     const paragraphs = await Promise.all(topics.map(generateParagraph));
>     return paragraphs.join("\n\n");
>   }
> );
>
> // Run the workflow
> const config = { configurable: { thread_id: uuid7() } };
> const result = await workflow.invoke(["quantum computing", "climate change", "history of aviation"], config);
> console.log(result);
> ```
>
> 这个例子利用 LangGraph 的并发模型来缩短执行时间，尤其是在 task 涉及 LLM 补全之类的 I/O 操作时。

## 调用图

**Functional API** 和 [**图 API**](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md) 可以在同一个应用中一起使用，因为它们共享相同的底层运行时。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint } from "@langchain/langgraph";
import { StateGraph } from "@langchain/langgraph";

const builder = new StateGraph(/* ... */);
// ...
const someGraph = builder.compile();

const someWorkflow = entrypoint(
  { name: "someWorkflow" },
  async (someInput: Record<string, any>) => {
    // Call a graph defined using the graph API
    const result1 = await someGraph.invoke(/* ... */);
    // Call another graph defined using the graph API
    const result2 = await anotherGraph.invoke(/* ... */);
    return {
      result1,
      result2,
    };
  }
);
```

> **扩展示例：从 Functional API 调用一个简单图**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { v7 as uuid7 } from "uuid";
> import { entrypoint, MemorySaver, StateGraph, StateSchema } from "@langchain/langgraph";
> import * as z from "zod";
>
> // Define the shared state type
> const State = new StateSchema({
>   foo: z.number(),
> });
>
> // Build the graph using the Graph API
> const builder = new StateGraph(State)
>   .addNode("double", (state) => {
>     return { foo: state.foo * 2 };
>   })
>   .addEdge("__start__", "double");
> const graph = builder.compile();
>
> // Define the functional API workflow
> const checkpointer = new MemorySaver();
>
> const workflow = entrypoint(
>   { checkpointer, name: "workflow" },
>   async (x: number) => {
>     const result = await graph.invoke({ foo: x });
>     return { bar: result.foo };
>   }
> );
>
> // Execute the workflow
> const config = { configurable: { thread_id: uuid7() } };
> console.log(await workflow.invoke(5, config)); // Output: { bar: 10 }
> ```

## 调用其他 entrypoint

你可以从 **entrypoint** 或 **task** 内部调用其他 **entrypoint**。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Will automatically use the checkpointer from the parent entrypoint
const someOtherWorkflow = entrypoint(
  { name: "someOtherWorkflow" },
  async (inputs: { value: number }) => {
    return inputs.value;
  }
);

const myWorkflow = entrypoint(
  { checkpointer, name: "myWorkflow" },
  async (inputs: { value: number }) => {
    const value = await someOtherWorkflow.invoke({ value: 1 });
    return value;
  }
);
```

> **扩展示例：调用另一个 entrypoint**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { v7 as uuid7 } from "uuid";
> import { entrypoint, MemorySaver } from "@langchain/langgraph";
>
> // Initialize a checkpointer
> const checkpointer = new MemorySaver();
>
> // A reusable sub-workflow that multiplies a number
> const multiply = entrypoint(
>   { name: "multiply" },
>   async (inputs: { a: number; b: number }) => {
>     return inputs.a * inputs.b;
>   }
> );
>
> // Main workflow that invokes the sub-workflow
> const main = entrypoint(
>   { checkpointer, name: "main" },
>   async (inputs: { x: number; y: number }) => {
>     const result = await multiply.invoke({ a: inputs.x, b: inputs.y });
>     return { product: result };
>   }
> );
>
> // Execute the main workflow
> const config = { configurable: { thread_id: uuid7() } };
> console.log(await main.invoke({ x: 6, y: 7 }, config)); // Output: { product: 42 }
> ```

## 流式传输

**Functional API** 使用与**图 API** 相同的流式传输机制。更多细节请阅读[**流式传输指南**](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)。

以下示例使用流式传输 API 从工作流运行中流式输出值块。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: { thread_id: "functional-api-stream-custom-data" },
};

const stream = await main.streamEvents({ x: 5 }, { ...config, version: "v3" });
for await (const chunk of stream.values) {
  console.log(chunk);
}
// 10
```

> **[查看示例追踪](https://smith.langchain.com/public/a8e1b6e9-202c-4541-8faa-5cbc0d8abde3/r)**
>
> 打开该示例的公开 LangSmith 运行记录。

1. 在计算开始前发出自定义数据。
2. 在计算出结果后发出另一条自定义消息。
3. 使用 `streamEvents()` 处理流式输出。
4. 遍历 `stream.values` 以接收值快照。

## 重试策略

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  MemorySaver,
  entrypoint,
  task,
  RetryPolicy,
} from "@langchain/langgraph";

// This variable is just used for demonstration purposes to simulate a network failure.
// It's not something you will have in your actual code.
let attempts = 0;

// Let's configure the RetryPolicy to retry on ValueError.
// The default RetryPolicy is optimized for retrying specific network errors.
const retryPolicy: RetryPolicy = { retryOn: (error) => error instanceof Error };

const getInfo = task(
  {
    name: "getInfo",
    retry: retryPolicy,
  },
  () => {
    attempts += 1;

    if (attempts < 2) {
      throw new Error("Failure");
    }
    return "OK";
  }
);

const checkpointer = new MemorySaver();

const main = entrypoint(
  { checkpointer, name: "main" },
  async (inputs: Record<string, any>) => {
    return await getInfo();
  }
);

const config = {
  configurable: {
    thread_id: "1",
  },
};

await main.invoke({ any_input: "foobar" }, config);
```

```
'OK'
```

## 缓存 task

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  InMemoryCache,
  entrypoint,
  task,
  CachePolicy,
} from "@langchain/langgraph";

const slowAdd = task(
  {
    name: "slowAdd",
    cache: { ttl: 120 },   // [!code highlight]
  },
  async (x: number) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return x * 2;
  }
);

const main = entrypoint(
  { cache: new InMemoryCache(), name: "main" },
  async (inputs: { x: number }) => {
    const result1 = await slowAdd(inputs.x);
    const result2 = await slowAdd(inputs.x);
    return { result1, result2 };
  }
);

const stream = await main.streamEvents({ x: 5 }, { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

1. `ttl` 以秒为单位指定。缓存会在该时间之后失效。

## 在错误后恢复

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, task, MemorySaver } from "@langchain/langgraph";

// This variable is just used for demonstration purposes to simulate a network failure.
// It's not something you will have in your actual code.
let attempts = 0;

const getInfo = task("getInfo", async () => {
  /**
   * Simulates a task that fails once before succeeding.
   * Throws an exception on the first attempt, then returns "OK" on subsequent tries.
   */
  attempts += 1;

  if (attempts < 2) {
    throw new Error("Failure"); // Simulate a failure on the first attempt
  }
  return "OK";
});

// Initialize an in-memory checkpointer for persistence
const checkpointer = new MemorySaver();

const slowTask = task("slowTask", async () => {
  /**
   * Simulates a slow-running task by introducing a 1-second delay.
   */
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return "Ran slow task.";
});

const main = entrypoint(
  { checkpointer, name: "main" },
  async (inputs: Record<string, any>) => {
    /**
     * Main workflow function that runs the slowTask and getInfo tasks sequentially.
     *
     * Parameters:
     * - inputs: Record<string, any> containing workflow input values.
     *
     * The workflow first executes `slowTask` and then attempts to execute `getInfo`,
     * which will fail on the first invocation.
     */
    const slowTaskResult = await slowTask(); // Blocking call to slowTask
    await getInfo(); // Exception will be raised here on the first attempt
    return slowTaskResult;
  }
);

// Workflow execution configuration with a unique thread identifier
const config = {
  configurable: {
    thread_id: "1", // Unique identifier to track workflow execution
  },
};

// This invocation will take ~1 second due to the slowTask execution
try {
  // First invocation will raise an exception due to the `getInfo` task failing
  await main.invoke({ any_input: "foobar" }, config);
} catch (err) {
  // Handle the failure gracefully
}
```

当我们恢复执行时，不需要重新运行 `slowTask`，因为它的结果已保存在检查点中。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
await main.invoke(null, config);
```

```
'Ran slow task.'
```

## 人机回环

Functional API 使用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 函数和 `Command` 原语来支持[人机回环](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)工作流。

### 基础人机回环工作流

我们将创建三个 [task](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#task)：

1. 追加 `"bar"`。
2. 暂停以等待人工输入。恢复时追加人工输入。
3. 追加 `"qux"`。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, task, interrupt, Command } from "@langchain/langgraph";

const step1 = task("step1", async (inputQuery: string) => {
  // Append bar
  return `${inputQuery} bar`;
});

const humanFeedback = task("humanFeedback", async (inputQuery: string) => {
  // Append user input
  const feedback = interrupt(`Please provide feedback: ${inputQuery}`);
  return `${inputQuery} ${feedback}`;
});

const step3 = task("step3", async (inputQuery: string) => {
  // Append qux
  return `${inputQuery} qux`;
});
```

现在我们可以在 [entrypoint](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#entrypoint) 中组合这些 task：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

const graph = entrypoint(
  { checkpointer, name: "graph" },
  async (inputQuery: string) => {
    const result1 = await step1(inputQuery);
    const result2 = await humanFeedback(result1);
    const result3 = await step3(result2);

    return result3;
  }
);
```

[interrupt()](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md#pause-using-interrupt) 在 task 内部被调用，使人工能够审查并编辑上一个 task 的输出。先前 task（本例中为 `step_1`）的结果会被持久化，因此在 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之后不会再次运行。

让我们发送一个查询字符串：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = { configurable: { thread_id: "1" } };

const stream = await graph.streamEvents("foo", config, { version: "v3" });
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

注意，我们在 `step_1` 之后用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 暂停了。该中断提供了恢复运行的说明。要恢复，我们发出一个 [`Command`](https://docs.langchain.com/oss/javascript/langgraph/interrupts#resuming-interrupts)，其中包含 `human_feedback` task 所期望的数据。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Continue execution
const stream = await graph.streamEvents(
  new Command({ resume: "baz" }),
  config,
  { version: "v3" }
);
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

恢复后，运行会继续走完剩余的步骤并如预期终止。

### 审查工具调用

要在执行前审查工具调用，我们添加一个调用 [`interrupt`](https://docs.langchain.com/oss/javascript/langgraph/interrupts#pause-using-interrupt) 的 `review_tool_call` 函数。当该函数被调用时，执行会暂停，直到我们发出恢复命令。

给定一个工具调用，我们的函数会[中断](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt)以等待人工审查。此时我们可以选择：

* 接受该工具调用
* 修改该工具调用并继续
* 生成自定义的工具消息（例如，指示模型重新格式化其工具调用）

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ToolCall } from "@langchain/core/messages/tool";
import { ToolMessage } from "@langchain/core/messages";

function reviewToolCall(toolCall: ToolCall): ToolCall | ToolMessage {
  // Review a tool call, returning a validated version
  const humanReview = interrupt({
    question: "Is this correct?",
    tool_call: toolCall,
  });

  const reviewAction = humanReview.action;
  const reviewData = humanReview.data;

  if (reviewAction === "continue") {
    return toolCall;
  } else if (reviewAction === "update") {
    const updatedToolCall = { ...toolCall, args: reviewData };
    return updatedToolCall;
  } else if (reviewAction === "feedback") {
    return new ToolMessage({
      content: reviewData,
      name: toolCall.name,
      tool_call_id: toolCall.id,
    });
  }

  throw new Error(`Unknown review action: ${reviewAction}`);
}
```

现在我们可以更新 [entrypoint](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#entrypoint) 来审查生成的工具调用。如果工具调用被接受或修改，我们就像之前一样执行。否则，我们只追加人工提供的 [`ToolMessage`](https://reference.langchain.com/javascript/langchain-core/messages/ToolMessage)。先前 task（本例中为初始的模型调用）的结果会被持久化，因此在 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之后不会再次运行。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  MemorySaver,
  entrypoint,
  interrupt,
  Command,
  addMessages,
} from "@langchain/langgraph";
import { ToolMessage, AIMessage, BaseMessage } from "@langchain/core/messages";

const checkpointer = new MemorySaver();

const agent = entrypoint(
  { checkpointer, name: "agent" },
  async (
    messages: BaseMessage[],
    previous?: BaseMessage[]
  ): Promise<BaseMessage> => {
    if (previous !== undefined) {
      messages = addMessages(previous, messages);
    }

    let modelResponse = await callModel(messages);
    while (true) {
      if (!modelResponse.tool_calls?.length) {
        break;
      }

      // Review tool calls
      const toolResults: ToolMessage[] = [];
      const toolCalls: ToolCall[] = [];

      for (let i = 0; i < modelResponse.tool_calls.length; i++) {
        const review = reviewToolCall(modelResponse.tool_calls[i]);
        if (review instanceof ToolMessage) {
          toolResults.push(review);
        } else {
          // is a validated tool call
          toolCalls.push(review);
          if (review !== modelResponse.tool_calls[i]) {
            modelResponse.tool_calls[i] = review; // update message
          }
        }
      }

      // Execute remaining tool calls
      const remainingToolResults = await Promise.all(
        toolCalls.map((toolCall) => callTool(toolCall))
      );

      // Append to message list
      messages = addMessages(messages, [
        modelResponse,
        ...toolResults,
        ...remainingToolResults,
      ]);

      // Call model again
      modelResponse = await callModel(messages);
    }

    // Generate final response
    messages = addMessages(messages, modelResponse);
    return entrypoint.final({ value: modelResponse, save: messages });
  }
);
```

## 短期记忆

短期记忆允许在同一**线程 ID** 的不同**调用**之间存储信息。更多细节参见[短期记忆](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#short-term-memory)。

### 管理检查点

你可以查看和删除检查点保存器存储的信息。

#### 查看线程状态

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const config = {
  configurable: {
    thread_id: "1",  // [!code highlight]
    // optionally provide an ID for a specific checkpoint,
    // otherwise the latest checkpoint is shown
    // checkpoint_id: "1f029ca3-1f5b-6704-8004-820c16b69a5a" [!code highlight]
  },
};
await graph.getState(config);  // [!code highlight]
```

```
StateSnapshot {
  values: {
    messages: [
      HumanMessage { content: "hi! I'm bob" },
      AIMessage { content: "Hi Bob! How are you doing today?" },
      HumanMessage { content: "what's my name?" },
      AIMessage { content: "Your name is Bob." }
    ]
  },
  next: [],
  config: { configurable: { thread_id: '1', checkpoint_ns: '', checkpoint_id: '1f029ca3-1f5b-6704-8004-820c16b69a5a' } },
  metadata: {
    source: 'loop',
    writes: { call_model: { messages: AIMessage { content: "Your name is Bob." } } },
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
    thread_id: "1",  // [!code highlight]
  },
};
const history = [];  // [!code highlight]
for await (const state of graph.getStateHistory(config)) {
  history.push(state);
}
```

```
[
  StateSnapshot {
    values: {
      messages: [
        HumanMessage { content: "hi! I'm bob" },
        AIMessage { content: "Hi Bob! How are you doing today? Is there anything I can help you with?" },
        HumanMessage { content: "what's my name?" },
        AIMessage { content: "Your name is Bob." }
      ]
    },
    next: [],
    config: { configurable: { thread_id: '1', checkpoint_ns: '', checkpoint_id: '1f029ca3-1f5b-6704-8004-820c16b69a5a' } },
    metadata: { source: 'loop', writes: { call_model: { messages: AIMessage { content: "Your name is Bob." } } }, step: 4, parents: {}, thread_id: '1' },
    createdAt: '2025-05-05T16:01:24.680462+00:00',
    parentConfig: { configurable: { thread_id: '1', checkpoint_ns: '', checkpoint_id: '1f029ca3-1790-6b0a-8003-baf965b6a38f' } },
    tasks: [],
    interrupts: []
  },
  // ... more state snapshots
]
```

### 将返回值与保存值解耦

使用 `entrypoint.final` 把返回给调用方的值与持久化到检查点中的值解耦。这在以下情况中很有用：

* 你希望返回一个计算结果（例如摘要或状态），但保存一个不同的内部值以供下次调用使用。
* 你需要控制下一次运行时传给 previous 参数的内容。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();

const accumulate = entrypoint(
  { checkpointer, name: "accumulate" },
  async (n: number, previous?: number) => {
    const prev = previous || 0;
    const total = prev + n;
    // Return the *previous* value to the caller but save the *new* total to the checkpoint.
    return entrypoint.final({ value: prev, save: total });
  }
);

const config = { configurable: { thread_id: "my-thread" } };

console.log(await accumulate.invoke(1, config)); // 0
console.log(await accumulate.invoke(2, config)); // 1
console.log(await accumulate.invoke(3, config)); // 3
```

### 聊天机器人示例

一个使用 Functional API 和 [`InMemorySaver`](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint/index/MemorySaver) 检查点保存器的简单聊天机器人示例。

该机器人能够记住先前的对话，并从上次中断的地方继续。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { BaseMessage } from "@langchain/core/messages";
import {
  addMessages,
  entrypoint,
  task,
  MemorySaver,
} from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });

const callModel = task(
  "callModel",
  async (messages: BaseMessage[]): Promise<BaseMessage> => {
    const response = await model.invoke(messages);
    return response;
  }
);

const checkpointer = new MemorySaver();

const workflow = entrypoint(
  { checkpointer, name: "workflow" },
  async (
    inputs: BaseMessage[],
    previous?: BaseMessage[]
  ): Promise<BaseMessage> => {
    let messages = inputs;
    if (previous) {
      messages = addMessages(previous, inputs);
    }

    const response = await callModel(messages);
    return entrypoint.final({
      value: response,
      save: addMessages(messages, response),
    });
  }
);

const config = { configurable: { thread_id: "1" } };
const inputMessage = { role: "user", content: "hi! I'm bob" };

const stream1 = await workflow.streamEvents([inputMessage], { ...config, version: "v3" });
for await (const snapshot of stream1.values) {
  console.log(snapshot);
}

const inputMessage2 = { role: "user", content: "what's my name?" };
const stream2 = await workflow.streamEvents([inputMessage2], { ...config, version: "v3" });
for await (const snapshot of stream2.values) {
  console.log(snapshot);
}
```

## 长期记忆

[长期记忆](https://docs.langchain.com/oss/javascript/concepts/memory.md#long-term-memory)允许在不同**线程 ID** 之间存储信息。这对于在某次对话中了解某个用户的信息，并在另一次对话中使用它可能很有用。

## 工作流

* [工作流与智能体](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents.md)指南，提供更多使用 Functional API 构建工作流的示例。

## 与其他库集成

* [使用 Functional API 把 LangGraph 的特性添加到其他框架](https://docs.langchain.com/langsmith/deploy-other-frameworks.md)：把持久化、记忆和流式传输等 LangGraph 特性添加到本身不提供这些能力的其他智能体框架中。

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/interrupts.md

# 中断

中断允许你在特定位置暂停图执行，等待外部输入后再继续。这实现了人机协同（human-in-the-loop）模式：你需要外部输入才能继续推进。当中断被触发时，LangGraph 会使用其[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)层保存图状态，并无限期等待，直到你恢复执行。

中断的工作方式是在图节点中的任意位置调用 `interrupt()` 函数。该函数接受任意可 JSON 序列化的值，并将其呈现给调用方。当你准备好继续时，通过 `Command` 重新调用图来恢复执行，该值随后成为节点内部 `interrupt()` 调用的返回值。

与静态断点（在特定节点之前或之后暂停）不同，中断是**动态的**：它们可以放在代码中的任何位置，并且可以根据应用逻辑设置条件。

* **检查点会保留你的位置：** 检查点写入器会记录精确的图状态，因此你可以稍后恢复，即使在错误状态下也可以。
* **`thread_id` 是你的指针：** 将 `{ configurable: { thread_id: ... } }` 作为 `invoke` 方法的选项传入，以告知检查点该加载哪个状态。
* **中断载荷以 `__interrupt__` 呈现：** 你传给 `interrupt()` 的值会通过 `__interrupt__` 字段返回给调用方，以便你了解图在等待什么。

你选择的 `thread_id` 实际上就是你的持久游标。复用它就会恢复同一个检查点；使用新值则会以空状态开启一个全新线程。

## 使用 `interrupt` 暂停

[`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 函数会暂停图执行并向调用方返回一个值。当你在节点内调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 时，LangGraph 会保存当前的图状态，并等待你带着输入恢复执行。

要使用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt)，你需要：

1. 一个**检查点写入器（checkpointer）**来持久化图状态（生产环境请使用持久化检查点写入器）
2. 配置中的**线程 ID**，以便运行时知道要从哪个状态恢复
3. 在你想要暂停的位置调用 `interrupt()`（载荷必须可 JSON 序列化）

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { interrupt } from "@langchain/langgraph";

async function approvalNode(state: State) {
    // Pause and ask for approval
    const approved = interrupt("Do you approve this action?");

    // Command({ resume: ... }) provides the value returned into this variable
    return { approved };
}
```

当你调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 时，会发生以下情况：

1. **图执行被挂起**，停在调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的确切位置

2. **状态被保存**：使用检查点写入器保存状态，以便稍后恢复执行。生产环境中，这应当是持久化检查点写入器（例如由数据库支撑）

3. **值被返回**给调用方，位于 `__interrupt__` 下；它可以是任意可 JSON 序列化的值（字符串、对象、数组等）

4. **图无限期等待**，直到你带着响应恢复执行

5. **响应被回传**到节点中，成为 `interrupt()` 调用的返回值

## 恢复中断

中断暂停执行后，你通过带着恢复值重新调用图（使用包含该值的 `Command`）来恢复它。恢复值会被回传给 `interrupt` 调用，使节点能够带着外部输入继续执行。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

// Initial run - hits the interrupt and pauses
// thread_id is the durable pointer back to the saved checkpoint
const config = { configurable: { thread_id: "thread-1" } };
const result = await graph.invoke({ input: "data" }, config);

// Check what was interrupted
// __interrupt__ mirrors every payload you passed to interrupt()
console.log(result.__interrupt__);
// [{ value: 'Do you approve this action?', ... }]

// Resume with the human's response
// Command({ resume }) returns that value from interrupt() in the node
await graph.invoke(new Command({ resume: true }), config);
```

**关于恢复的要点：**

* 恢复时必须使用与中断发生时**相同的线程 ID**
* 传给 `new Command({ resume: ... })` 的值会成为 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用的返回值
* 恢复时节点会从调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的节点开头重新开始，因此 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之前的任何代码都会再次执行
* 你可以传入任意可 JSON 序列化的值作为恢复值；如果指定了 Zod 的 `responseSchema`，则会对其进行校验

> [!WARNING]
>
> `new Command({ resume: ... })` 是**唯一**一种适合作为 `invoke()`/`stream()`/`stream_events()` 输入的 `Command` 模式。其他 `Command` 参数（`update`、`goto`、`graph`）是设计用于[从节点函数返回](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#command)的。不要传入 `new Command({ update: ... })` 作为输入来继续多轮对话——请改为传入普通输入对象。

## 定义中断响应模式

[`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的 `responseSchema` 选项描述了你恢复图时所期望的输入。客户端可以使用该模式来渲染类型化输入表单。

> [!NOTE]
>
> 中断响应模式需要 `@langchain/langgraph` 1.4.16 或更高版本。

传入 Zod 模式以校验恢复值。LangGraph 会将其转换为 JSON Schema，并放入 `Interrupt.response_schema`，与中断的 `value` 载荷分开存放。该模式在返回给调用方的中断中以及在检查点任务的中断中都可用。

本示例使用 LangGraph 中断测试中的审批模式：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  Annotation,
  Command,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { z } from "zod/v4";

const Decision = z.object({
  approved: z.boolean(),
  note: z.string().default(""),
});

const State = Annotation.Root({
  answer: Annotation<unknown>(),
});

const graph = new StateGraph(State)
  .addNode("node", () => ({
    answer: interrupt({ question: "approve?" }, { responseSchema: Decision }),
  }))
  .addEdge(START, "node")
  .compile({ checkpointer: new MemorySaver() });

const config = { configurable: { thread_id: "1" } };

const result = await graph.invoke({ answer: null }, config);
console.log(result.__interrupt__?.[0].response_schema);

const resumed = await graph.invoke(
  new Command({ resume: { approved: true } }),
  config
);
console.log(resumed.answer);
```

使用 Zod 模式时，`interrupt()` 会返回解析后的值。在本示例中，结果为 `{ approved: true, note: "" }`，其中包含默认的 `note`。无效输入会抛出 `ZodError`；你可以使用同一线程 ID 传入修正后的 `new Command({ resume: ... })` 重试。

你也可以传入 JSON Schema 对象作为 `responseSchema`。LangGraph 会原样暴露该对象，但**不会**用它校验恢复值。当你省略 `responseSchema` 时，中断没有 `response_schema` 字段，恢复值会直接通过而不做模式校验。

Studio 会将中断响应模式渲染为类型化输入字段，而不是 JSON 编辑器。下面的 Studio 组件预览使用示例数据，包含审批、备注和数值金额字段。

![Studio 中断表单：包含审批开关、备注字段和设为 125.50 的数值金额](https://mintcdn.com/langchain-5e9cc07a/u62GP5wl5NeQqwjE/images/langgraph-interrupt-response-schema.png?fit=max\&auto=format\&n=u62GP5wl5NeQqwjE\&q=85\&s=b10304786d356849862616a60b74aa3d)

## 常见模式

中断带来的关键能力是暂停执行并等待外部输入。这在多种用例中都很有用，包括：

* &#x20;[审批工作流](#approve-or-reject)：在执行关键操作（API 调用、数据库变更、金融交易）之前暂停
* &#x20;[处理多个中断](#handling-multiple-interrupts)：在一次调用中恢复多个中断时，将中断 ID 与恢复值配对
* &#x20;[审查与编辑](#review-and-edit-state)：让人类在继续之前审查并修改 LLM 输出或工具调用
* &#x20;[中断工具调用](#interrupts-in-tools)：在执行工具调用之前暂停，以便先审查和编辑该工具调用
* &#x20;[校验人类输入](#validating-human-input)：在进入下一步之前暂停，以校验人类输入

### 配合人机协同（HITL）中断进行流式传输

在构建带人机协同工作流的交互式智能体时，你可以使用[事件流式传输](https://docs.langchain.com/oss/javascript/langgraph/event-streaming.md)，在处理中断的同时并发消费消息分块和状态快照。

在循环中使用 `graph.stream_events(..., version="v3")` 返回的类型化投影，直到运行结束：

* 通过 `stream.messages` 逐 token 流式传输 AI 响应
* 通过 `stream.values` 观察每一步的状态快照
* 通过 `stream.interrupted` 检测中断，并从 `stream.interrupts` 读取其载荷
* 通过再次调用 `stream_events` 并传入 `Command(resume=...)` 来恢复执行，重复此过程直到 `stream.interrupted` 为 false

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command } from "@langchain/langgraph";

let streamInput: Record<string, unknown> | Command = initialInput;

while (true) {
  const stream = await graph.streamEvents(streamInput, {
    ...config,
    version: "v3",
  });

  // Stream LLM message chunks (including any in subgraphs) as they arrive.
  for await (const message of stream.messages) {
    for await (const token of message.text) {
      displayStreamingContent(token);
    }
  }

  // After the run finishes (or pauses), check for interrupts and resume.
  if (!stream.interrupted) {
    const finalState = await stream.output;
    break;
  }

  const interruptInfo = stream.interrupts[0].payload;
  const userResponse = await getUserInput(interruptInfo);
  streamInput = new Command({ resume: userResponse });
}
```

> **[查看示例追踪](https://smith.langchain.com/public/7ebae998-6b68-4caa-a262-38d84efc922f/r)**
>
> 在 LangSmith 中打开此示例的公开运行记录。

* **`stream.messages`**：聊天模型输出，以内容块形式呈现；迭代 `message.text` 获取 token 增量。对于嵌套子图，请从 `stream.subgraphs[*].messages` 读取消息分块。
* **`stream.values`**：每一步之后的完整状态快照
* **`stream.interrupted` / `stream.interrupts`**：每次运行后检查图是否暂停；从 `stream.interrupts` 读取载荷
* **`Command(resume=...)`**：作为下一次 `streamEvents` 的输入传入以恢复执行；循环直到运行完成且不再中断

### 处理多个中断

当并行分支同时中断时（例如扇出到多个各自调用 `interrupt()` 的节点），你可能需要在单次调用中恢复多个中断。
在单次调用中恢复多个中断时，请将每个中断 ID 映射到其恢复值。
这能确保每个响应在运行时与正确的中断配对。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import {
  Annotation,
  Command,
  END,
  INTERRUPT,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  isInterrupted,
} from "@langchain/langgraph";

const State = Annotation.Root({
  vals: Annotation<string[]>({
    reducer: (left, right) =>
      left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
});

function nodeA(_state: typeof State.State) {
  const answer = interrupt("question_a") as string;
  return { vals: [`a:${answer}`] };
}

function nodeB(_state: typeof State.State) {
  const answer = interrupt("question_b") as string;
  return { vals: [`b:${answer}`] };
}

const graph = new StateGraph(State)
  .addNode("a", nodeA)
  .addNode("b", nodeB)
  .addEdge(START, "a")
  .addEdge(START, "b")
  .addEdge("a", END)
  .addEdge("b", END)
  .compile({ checkpointer: new MemorySaver() });

const config = { configurable: { thread_id: "1" } };

async function main() {
  // Step 1: invoke - both parallel nodes hit interrupt() and pause
  const interruptedResult = await graph.invoke({ vals: [] }, config);
  console.log(interruptedResult);
  /*
  {
    vals: [],
    __interrupt__: [
      { id: '...', value: 'question_a' },
      { id: '...', value: 'question_b' }
    ]
  }
  */

  // Step 2: resume all pending interrupts at once
  const resumeMap: Record<string, string> = {};
  if (isInterrupted(interruptedResult)) {
    for (const i of interruptedResult[INTERRUPT]) {
      if (i.id != null) {
        resumeMap[i.id] = `answer for ${i.value}`;
      }
    }
  }
  const result = await graph.invoke(new Command({ resume: resumeMap }), config);

  console.log("Final state:", result);
  //> Final state: { vals: ['a:answer for question_a', 'b:answer for question_b'] }
}

main().catch(console.error);
```

### 批准或拒绝

中断最常见的用途之一是在关键操作之前暂停并请求批准。例如，你可能希望让人类批准 API 调用、数据库变更或任何其他重要决策。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { interrupt, Command } from "@langchain/langgraph";

const approvalNode: typeof State.Node = (state) => {
  // Pause execution; payload surfaces in result.__interrupt__
  const isApproved = interrupt({
    question: "Do you want to proceed?",
    details: state.actionDetails
  });

  // Route based on the response
  if (isApproved) {
    return new Command({ goto: "proceed" }); // Runs after the resume payload is provided
  } else {
    return new Command({ goto: "cancel" });
  }
}
```

当你恢复图时，传入 `true` 表示批准，传入 `false` 表示拒绝：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// To approve
await graph.invoke(new Command({ resume: true }), config);

// To reject
await graph.invoke(new Command({ resume: false }), config);
```

> **完整示例**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import {
>   Command,
>   MemorySaver,
>   START,
>   END,
>   StateGraph,
>   StateSchema,
>   interrupt,
> } from "@langchain/langgraph";
> import * as z from "zod";
>
> const State = new StateSchema({
>   actionDetails: z.string(),
>   status: z.enum(["pending", "approved", "rejected"]).nullable(),
> });
>
> const graphBuilder = new StateGraph(State)
>   .addNode("approval", async (state) => {
>     // Expose details so the caller can render them in a UI
>     const decision = interrupt({
>       question: "Approve this action?",
>       details: state.actionDetails,
>     });
>     return new Command({ goto: decision ? "proceed" : "cancel" });
>   }, { ends: ['proceed', 'cancel'] })
>   .addNode("proceed", () => ({ status: "approved" }))
>   .addNode("cancel", () => ({ status: "rejected" }))
>   .addEdge(START, "approval")
>   .addEdge("proceed", END)
>   .addEdge("cancel", END);
>
> // Use a more durable checkpointer in production
> const checkpointer = new MemorySaver();
> const graph = graphBuilder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "approval-123" } };
> const initial = await graph.invoke(
>   { actionDetails: "Transfer $500", status: "pending" },
>   config,
> );
> console.log(initial.__interrupt__);
> // [{ value: { question: ..., details: ... } }]
>
> // Resume with the decision; true routes to proceed, false to cancel
> const resumed = await graph.invoke(new Command({ resume: true }), config);
> console.log(resumed.status); // -> "approved"
> ```

### 审查与编辑状态

有时你希望让人在继续之前审查并编辑图状态的一部分。这对于纠正 LLM、补充缺失信息或做调整都很有用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { interrupt } from "@langchain/langgraph";

const reviewNode: typeof State.Node = (state) => {
  // Pause and show the current content for review (surfaces in result.__interrupt__)
  const editedContent = interrupt({
    instruction: "Review and edit this content",
    content: state.generatedText
  });

  // Update the state with the edited version
  return { generatedText: editedContent };
}
```

恢复时，提供编辑后的内容：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
await graph.invoke(
  new Command({ resume: "The edited and improved text" }), // Value becomes the return from interrupt()
  config
);
```

> **完整示例**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import {
>   Command,
>   MemorySaver,
>   START,
>   END,
>   StateGraph,
>   StateSchema,
>   interrupt,
> } from "@langchain/langgraph";
> import * as z from "zod";
>
> const State = new StateSchema({
>   generatedText: z.string(),
> });
>
> const builder = new StateGraph(State)
>   .addNode("review", async (state) => {
>     // Ask a reviewer to edit the generated content
>     const updated = interrupt({
>       instruction: "Review and edit this content",
>       content: state.generatedText,
>     });
>     return { generatedText: updated };
>   })
>   .addEdge(START, "review")
>   .addEdge("review", END);
>
> const checkpointer = new MemorySaver();
> const graph = builder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "review-42" } };
> const initial = await graph.invoke({ generatedText: "Initial draft" }, config);
> console.log(initial.__interrupt__);
> // [{ value: { instruction: ..., content: ... } }]
>
> // Resume with the edited text from the reviewer
> const finalState = await graph.invoke(
>   new Command({ resume: "Improved draft after review" }),
>   config,
> );
> console.log(finalState.generatedText); // -> "Improved draft after review"
> ```

### 工具中的中断

你也可以在工具函数内部直接放置中断。这样，工具在被调用时就会暂停以等待批准，并允许在执行工具调用之前进行人工审查和编辑。

首先，定义一个使用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的工具：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import * as z from "zod";

const sendEmailTool = tool(
  async ({ to, subject, body }) => {
    // Pause before sending; payload surfaces in result.__interrupt__
    const response = interrupt({
      action: "send_email",
      to,
      subject,
      body,
      message: "Approve sending this email?",
    });

    if (response?.action === "approve") {
      // Resume value can override inputs before executing
      const finalTo = response.to ?? to;
      const finalSubject = response.subject ?? subject;
      const finalBody = response.body ?? body;
      return `Email sent to ${finalTo} with subject '${finalSubject}'`;
    }
    return "Email cancelled by user";
  },
  {
    name: "send_email",
    description: "Send an email to a recipient",
    schema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  },
);
```

当你希望审批逻辑与工具本身放在一起、使其可在图的不同部分复用时，这种方式很有用。LLM 可以自然地调用该工具，而中断会在工具被调用时暂停执行，让你批准、编辑或取消该操作。

> **完整示例**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { tool } from "@langchain/core/tools";
> import { ChatAnthropic } from "@langchain/anthropic";
> import {
>   Command,
>   MemorySaver,
>   START,
>   END,
>   StateGraph,
>   StateSchema,
>   MessagesValue,
>   interrupt,
> } from "@langchain/langgraph";
> import { ToolNode } from "@langchain/langgraph/prebuilt";
> import { AIMessage } from "@langchain/core/messages";
> import * as z from "zod";
>
> const sendEmailTool = tool(
>   async ({ to, subject, body }) => {
>     // Pause before sending; payload surfaces in result.__interrupt__
>     const response = interrupt({
>       action: "send_email",
>       to,
>       subject,
>       body,
>       message: "Approve sending this email?",
>     });
>
>     if (response?.action === "approve") {
>       const finalTo = response.to ?? to;
>       const finalSubject = response.subject ?? subject;
>       const finalBody = response.body ?? body;
>       console.log("[sendEmailTool]", finalTo, finalSubject, finalBody);
>       return `Email sent to ${finalTo}`;
>     }
>     return "Email cancelled by user";
>   },
>   {
>     name: "send_email",
>     description: "Send an email to a recipient",
>     schema: z.object({
>       to: z.string(),
>       subject: z.string(),
>       body: z.string(),
>     }),
>   },
> );
>
> const model = new ChatAnthropic({ model: "claude-sonnet-4-6" }).bindTools([sendEmailTool]);
> const toolNode = new ToolNode([sendEmailTool]);
>
> const State = new StateSchema({
>   messages: MessagesValue,
> });
>
> const agent: typeof State.Node = async (state) => {
>   // LLM may decide to call the tool; interrupt pauses before sending
>   const response = await model.invoke(state.messages);
>   return { messages: [response] };
> };
>
> const shouldContinue = (state: typeof State.State) => {
>   // Route to the tools node if the LLM made a tool call
>   const lastMessage = state.messages.at(-1);
>   if (AIMessage.isInstance(lastMessage) && lastMessage.tool_calls?.length) {
>     return "tools";
>   }
>   return END;
> };
>
> const graphBuilder = new StateGraph(State)
>   .addNode("agent", agent)
>   .addNode("tools", toolNode)
>   .addEdge(START, "agent")
>   .addConditionalEdges("agent", shouldContinue, ["tools", END])
>   .addEdge("tools", "agent"); // Loop back after tools
>
> const checkpointer = new MemorySaver();
> const graph = graphBuilder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "email-workflow" } };
> const initial = await graph.invoke(
>   {
>     messages: [
>       { role: "user", content: "Send an email to alice@example.com about the meeting" },
>     ],
>   },
>   config,
> );
> console.log(initial.__interrupt__); // -> [{ value: { action: 'send_email', ... } }]
>
> // Resume with approval and optionally edited arguments
> const resumed = await graph.invoke(
>   new Command({
>     resume: { action: "approve", subject: "Updated subject" },
>   }),
>   config,
> );
> console.log(resumed.messages.at(-1)); // -> Tool result returned by send_email
> ```

### 校验人类输入

有时你需要校验来自人类的输入，并在值无效时重新提示。推荐做法是**每次节点调用只调用一次 `interrupt()`**，在返回节点时把错误消息存入状态，并使用**条件边**循环回到该节点，直到提供有效值。

> [!WARNING]
>
> **避免在单个节点内使用 `while True` + `interrupt()` 循环。** 因为节点在每次恢复时都会从头重新运行（参见[中断规则](#rules-of-interrupts)），一个会多次调用 `interrupt()` 的循环会导致每次恢复都重放之前的所有迭代：第一次恢复重放 1 次迭代，第二次重放 2 次，以此类推。结果是循环体内任何代码都会指数级重复执行。

正确的模式是：

1. 将重新提示的问题存入状态（例如 `pendingQuestion`）。
2. 在节点中**只调用一次** `interrupt()`，传入状态中当前的问题。
3. 如果答案无效，返回更新后的 `pendingQuestion`，以便下次调用重新提示。
4. 使用 `addConditionalEdges` 路由回该节点，直到收集到有效值。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { interrupt } from "@langchain/langgraph";

const getAgeNode: typeof State.Node = (state) => {
  const question = state.pendingQuestion ?? "What is your age?";
  const answer = interrupt(question); // called exactly once per invocation

  if (typeof answer === "number" && answer > 0) {
    return { age: answer, pendingQuestion: null };
  }
  return {
    pendingQuestion: `'${answer}' is not a valid age. Please enter a positive number.`,
  };
};

// builder.addConditionalEdges("collectAge", (state) =>
//   state.age !== null ? END : "collectAge"
// );
```

> **[查看示例追踪](https://smith.langchain.com/public/9e6a7db8-1fa3-4f6f-91cc-3b48fcf5e6ec/r)**
>
> 在 LangSmith 中打开此示例的公开运行记录。

每次恢复都会恰好调用一次 `getAgeNode`，执行一次 `interrupt()` 调用，然后退出。当答案无效时，条件边会循环回来，下一次中断会用更新后的问题重新提示。

> **完整示例**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import {
>   Command,
>   MemorySaver,
>   START,
>   END,
>   StateGraph,
>   StateSchema,
>   interrupt,
> } from "@langchain/langgraph";
> import * as z from "zod";
>
> const State = new StateSchema({
>   age: z.number().nullable(),
>   pendingQuestion: z.string().nullable(),
> });
>
> const builder = new StateGraph(State)
>   .addNode("collectAge", (state) => {
>     const question = state.pendingQuestion ?? "What is your age?";
>     const answer = interrupt(question); // called exactly once per invocation
>
>     if (typeof answer === "number" && answer > 0) {
>       return { age: answer, pendingQuestion: null };
>     }
>     return { pendingQuestion: `'${answer}' is not a valid age. Please enter a positive number.` };
>   })
>   .addEdge(START, "collectAge")
>   .addConditionalEdges("collectAge", (state) =>
>     state.age !== null ? END : "collectAge"
>   );
>
> const checkpointer = new MemorySaver();
> const graph = builder.compile({ checkpointer });
>
> const config = { configurable: { thread_id: "form-1" } };
> const first = await graph.invoke({ age: null, pendingQuestion: null }, config);
> console.log(first.__interrupt__); // -> [{ value: "What is your age?", ... }]
>
> // Provide invalid data; the node re-prompts via the conditional edge
> const retry = await graph.invoke(new Command({ resume: "thirty" }), config);
> console.log(retry.__interrupt__); // -> [{ value: "'thirty' is not a valid age...", ... }]
>
> // Provide valid data; route returns END and the graph finishes
> const final = await graph.invoke(new Command({ resume: 30 }), config);
> console.log(final.age); // -> 30
> ```

## 中断规则

当你在节点内调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 时，LangGraph 会通过抛出异常来挂起执行，以通知运行时暂停。该异常沿调用栈向上传播并被运行时捕获，运行时会通知图保存当前状态并等待外部输入。

当执行恢复时（在你提供所请求的输入之后），运行时会把整个节点从头重新启动——它**不会**从调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的那一行继续。这意味着 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之前执行过的任何代码都会再次执行。因此，使用中断时需要遵循几条重要规则，以确保其行为符合预期。

### 不要将 `interrupt` 调用包裹在 try/catch 中

[`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 在调用点暂停执行的方式是抛出一个特殊异常。如果你把 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用包裹在 try/catch 块中，就会捕获该异常，中断便无法回传给图。

* ✅ 将 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用与容易出错的代码分开
* ✅ 如有需要，条件性地捕获错误

```typescript Separating logic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ✅ Good: interrupting first, then handling error conditions separately
  const name = interrupt("What's your name?");
  try {
    await fetchData(); // This can fail
  } catch (err) {
    console.error(error);
  }
  return state;
}
```

```typescript Conditionally handling errors theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ✅ Good: re-throwing the exception will
  // allow the interrupt to be passed back to
  // the graph
  try {
    const name = interrupt("What's your name?");
    await fetchData(); // This can fail
  } catch (err) {
    if (error instanceof NetworkError) {
      console.error(error);
    }
    throw error;
  }
  return state;
}
```

* 🔴 不要将 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用包裹在裸 try/catch 块中

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async function nodeA(state: State) {
    // ❌ Bad: wrapping interrupt in bare try/catch will catch the interrupt exception
    try {
        const name = interrupt("What's your name?");
    } catch (err) {
        console.error(error);
    }
    return state;
}
```

### 不要在节点内重排 `interrupt` 调用的顺序

在单个节点中使用多个中断很常见，但如果不小心处理，可能会导致意外行为。

当一个节点包含多个中断调用时，LangGraph 会为执行该节点的任务维护一个恢复值列表。每当执行恢复时，它都从节点开头开始。对于遇到的每个中断，LangGraph 会检查任务的恢复列表中是否存在匹配值。匹配**严格基于索引**，因此节点内中断调用的顺序非常重要。

* ✅ 保持 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用在节点各次执行之间保持一致

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async function nodeA(state: State) {
    // ✅ Good: interrupt calls happen in the same order every time
    const name = interrupt("What's your name?");
    const age = interrupt("What's your age?");
    const city = interrupt("What's your city?");

    return {
        name,
        age,
        city
    };
}
```

* 🔴 不要在节点内条件性地跳过 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用
* 🔴 不要用跨执行不确定的逻辑来循环 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用，包括 `while True` 校验循环。请改用条件边（参见[校验人类输入](#validating-human-input)）

```typescript Skipping interrupts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ❌ Bad: conditionally skipping interrupts changes the order
  const name = interrupt("What's your name?");

  // On first run, this might skip the interrupt
  // On resume, it might not skip it - causing index mismatch
  if (state.needsAge) {
    const age = interrupt("What's your age?");
  }

  const city = interrupt("What's your city?");

  return { name, city };
}
```

```typescript Looping interrupts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ❌ Bad: looping based on non-deterministic data
  // The number of interrupts changes between executions
  const results = [];
  for (const item of state.dynamicList || []) {  // List might change between runs
    const result = interrupt(`Approve ${item}?`);
    results.push(result);
  }

  return { results };
}
```

### 不要在 `interrupt` 调用中返回复杂值

取决于所使用的检查点写入器，复杂值可能无法序列化（例如，你无法序列化一个函数）。为了让你的图能适配任何部署环境，最佳实践是只使用可以合理序列化的值。

* ✅ 向 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 传入简单的、可 JSON 序列化的类型
* ✅ 传入值为简单类型的字典/对象

```typescript Simple values theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ✅ Good: passing simple types that are serializable
  const name = interrupt("What's your name?");
  const count = interrupt(42);
  const approved = interrupt(true);

  return { name, count, approved };
}
```

```typescript Structured data theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ✅ Good: passing objects with simple values
  const response = interrupt({
    question: "Enter user details",
    fields: ["name", "email", "age"],
    currentValues: state.user || {}
  });

  return { user: response };
}
```

* 🔴 不要向 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 传入函数、类实例或其他复杂对象

```typescript Functions theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
function validateInput(value: string): boolean {
    return value.length > 0;
}

const nodeA: GraphNode<typeof State> = async (state) => {
  // ❌ Bad: passing a function to interrupt
  // The function cannot be serialized
  const response = interrupt({
    question: "What's your name?",
    validator: validateInput  // This will fail
  });
  return { name: response };
}
```

```typescript Class instances theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class DataProcessor {
    constructor(private config: any) {}
}

const nodeA: GraphNode<typeof State> = async (state) => {
  const processor = new DataProcessor({ mode: "strict" });

  // ❌ Bad: passing a class instance to interrupt
  // The instance cannot be serialized
  const response = interrupt({
    question: "Enter data to process",
    processor: processor  // This will fail
  });
  return { result: response };
}
```

### `interrupt` 之前调用的副作用必须幂等

由于中断的工作方式是重新运行调用它们的节点，因此 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之前调用的副作用（理想情况下）应当是幂等的。所谓幂等，是指同一操作可以多次应用而不会改变初次执行之后的结果。

举例来说，节点内可能有一个更新记录的 API 调用。如果 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 在该调用之后被调用，那么节点恢复时它会被多次重新执行，可能覆盖初始更新或创建重复记录。

* ✅ 在 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之前使用幂等操作
* ✅ 将副作用放在 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用之后
* ✅ 尽可能将副作用拆分到单独的节点

```typescript Idempotent operations theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ✅ Good: using upsert operation which is idempotent
  // Running this multiple times will have the same result
  await db.upsertUser({
    userId: state.userId,
    status: "pending_approval"
  });

  const approved = interrupt("Approve this change?");

  return { approved };
}
```

```typescript Side effects after interrupt theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ✅ Good: placing side effect after the interrupt
  // This ensures it only runs once after approval is received
  const approved = interrupt("Approve this change?");

  if (approved) {
    await db.createAuditLog({
      userId: state.userId,
      action: "approved"
    });
  }

  return { approved };
}
```

```typescript Separating into different nodes theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const approvalNode: GraphNode<typeof State> = async (state) => {
  // ✅ Good: only handling the interrupt in this node
  const approved = interrupt("Approve this change?");

  return { approved };
}

const notificationNode: GraphNode<typeof State> = async (state) => {
  // ✅ Good: side effect happens in a separate node
  // This runs after approval, so it only executes once
  if (state.approved) {
    await sendNotification({
      userId: state.userId,
      status: "approved",
    });
  }

  return state;
}
```

* 🔴 不要在 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 之前执行非幂等操作
* 🔴 不要在未检查记录是否存在的情况下创建新记录

```typescript Creating records theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ❌ Bad: creating a new record before interrupt
  // This will create duplicate records on each resume
  const auditId = await db.createAuditLog({
    userId: state.userId,
    action: "pending_approval",
    timestamp: new Date()
  });

  const approved = interrupt("Approve this change?");

  return { approved, auditId };
}
```

```typescript Appending to arrays theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const nodeA: GraphNode<typeof State> = async (state) => {
  // ❌ Bad: appending to an array before interrupt
  // This will add duplicate entries on each resume
  await db.appendToHistory(state.userId, "approval_requested");

  const approved = interrupt("Approve this change?");

  return { approved };
}
```

## 与以函数方式调用的子图配合使用

当在节点内调用子图时，父图会从调用子图并触发 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的**节点开头**恢复执行。同样，**子图**也会从调用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 的节点开头恢复。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async function nodeInParentGraph(state: State) {
    someCode(); // <-- This will re-execute when resumed
    // Invoke a subgraph as a function.
    // The subgraph contains an `interrupt` call.
    const subgraphResult = await subgraph.invoke(someInput);
    // ...
}

async function nodeInSubgraph(state: State) {
    someOtherCode(); // <-- This will also re-execute when resumed
    const result = interrupt("What's your name?");
    // ...
}
```

## 使用中断进行调试

要调试和测试图，你可以使用静态中断作为断点，逐个节点地步进执行图。静态中断在节点执行之前或之后的指定位置触发。你可以在编译图时指定 `interruptBefore` 和 `interruptAfter` 来设置它们。

> [!NOTE]
>
> 静态中断**不**推荐用于人机协同工作流。请改用 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 函数。

**编译时**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const graph = builder.compile({
    interruptBefore: ["node_a"],  // [!code highlight]
    interruptAfter: ["node_b", "node_c"],  // [!code highlight]
    checkpointer,
});

// Pass a thread ID to the graph
const config = {
    configurable: {
        thread_id: "some_thread"
    }
};

// Run the graph until the breakpoint
await graph.invoke(inputs, config);# [!code highlight]

await graph.invoke(null, config);  # [!code highlight]
```

1. 断点在 `compile` 时设置。
2. `interruptBefore` 指定应在节点执行**之前**暂停的节点。
3. `interruptAfter` 指定应在节点执行**之后**暂停的节点。
4. 要启用断点，需要提供检查点写入器。
5. 图会一直运行，直到命中第一个断点。
6. 通过为输入传入 `null` 来恢复图。这会运行图直到命中下一个断点。

**运行时**

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Run the graph until the breakpoint
graph.invoke(inputs, {
    interruptBefore: ["node_a"],  // [!code highlight]
    interruptAfter: ["node_b", "node_c"],  // [!code highlight]
    configurable: {
        thread_id: "some_thread"
    }
});

// Resume the graph
await graph.invoke(null, config);  // [!code highlight]
```

1. 调用 `graph.invoke` 时传入 `interruptBefore` 和 `interruptAfter` 参数。这是运行时配置，每次调用都可以更改。
2. `interruptBefore` 指定应在节点执行**之前**暂停的节点。
3. `interruptAfter` 指定应在节点执行**之后**暂停的节点。
4. 图会一直运行，直到命中第一个断点。
5. 通过为输入传入 `null` 来恢复图。这会运行图直到命中下一个断点。

> [!TIP]
>
> 要调试中断，请使用 [LangSmith](https://docs.langchain.com/langsmith/observability.md)。

### 使用 LangSmith Studio

你可以在运行图之前，使用 [LangSmith Studio](https://docs.langchain.com/langsmith/studio.md) 在 UI 中为图设置静态中断。你也可以使用该 UI 在执行过程中的任何时点检查图状态。

![image](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=5aa4e7cea2ab147cef5b4e210dd6c4a1)

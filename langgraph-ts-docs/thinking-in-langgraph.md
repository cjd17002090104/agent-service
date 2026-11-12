> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph.md

# 用 LangGraph 思考

> 学习如何以 LangGraph 的方式思考构建智能体

当你用 LangGraph 构建智能体时，首先要把任务拆解为一个个离散的步骤，称为**节点**。然后，描述每个节点所做出的不同决策与状态转换。最后，通过一份共享的**状态**把节点连接起来，每个节点都可以读取和写入这份状态。

在这次逐步演练中，我们将带你走一遍用 LangGraph 构建客户支持邮件智能体的思考过程。

## 从你想要自动化的流程出发

设想你需要构建一个处理客户支持邮件的 AI 智能体。你的产品团队给了你这些需求：

```txt theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
智能体应当：

- 读取收到的客户邮件
- 按紧急程度和主题对它们进行分类
- 检索相关文档以回答问题
- 起草合适的回复
- 把复杂问题升级给人工客服
- 在需要时安排后续跟进

需要处理的示例场景：

1. 简单的产品问题：“我该怎么重置密码？”
2. 缺陷报告：“导出功能选择 PDF 格式时会崩溃”
3. 紧急账单问题：“我的订阅被重复扣费了！”
4. 功能请求：“你们能给移动应用加上深色模式吗？”
5. 复杂技术问题：“我们的 API 集成间歇性出现 504 错误”
```

要在 LangGraph 中实现一个智能体，你通常会遵循同样的五个步骤。

## 步骤 1：把工作流拆解为离散步骤

首先识别你流程中彼此不同的步骤。每个步骤都会成为一个**节点**（一个只做一件特定事情的函数）。然后，勾画出这些步骤之间如何相连。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
flowchart TD
    A[START] --> B[Read Email]
    B --> C[Classify Intent]

    C -.-> D[Doc Search]
    C -.-> E[Bug Track]
    C -.-> F[Human Review]

    D --> G[Draft Reply]
    E --> G
    F --> G

    G -.-> H[Human Review]
    G -.-> I[Send Reply]

    H --> J[END]
    I --> J[END]

    classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:2px,color:#030710
    class A,B,C,D,E,F,G,H,I,J process
```

这张图中的箭头表示可能的路径，但究竟走哪条路径，实际是在每个节点内部决定的。

现在我们已经识别出工作流中的各个组件，接下来理解每个节点需要做什么：

* `Read Email`：提取并解析邮件内容
* `Classify Intent`：使用 LLM 对紧急程度和主题进行分类，然后路由到合适的操作
* `Doc Search`：在你的知识库中查询相关信息
* `Bug Track`：在跟踪系统中创建或更新工单
* `Draft Reply`：生成合适的回复
* `Human Review`：升级给人工客服进行审批或处理
* `Send Reply`：发送邮件回复

> [!TIP]
>
> 注意有些节点会决定下一步去哪里（`Classify Intent`、`Draft Reply`、`Human Review`），而另一些节点总是进入同一个下一步（`Read Email` 总是进入 `Classify Intent`，`Doc Search` 总是进入 `Draft Reply`）。

## 步骤 2：确定每个步骤需要做什么

对于图中的每个节点，确定它代表哪种类型的操作，以及它需要哪些上下文才能正常工作。

> **[LLM 步骤](#llm-steps)**
>
> 当你需要理解、分析、生成文本或做出推理决策时使用

> **[数据步骤](#data-steps)**
>
> 当你需要从外部来源检索信息时使用

> **[操作步骤](#action-steps)**
>
> 当你需要执行外部操作时使用

> **[用户输入步骤](#user-input-steps)**
>
> 当你需要人工介入时使用

### LLM 步骤

当一个步骤需要理解、分析、生成文本或做出推理决策时：

> **分类意图**
>
> * 静态上下文（提示词）：分类类别、紧急程度定义、回复格式
> * 动态上下文（来自状态）：邮件内容、发件人信息
> * 期望结果：可决定路由的结构化分类结果

> **起草回复**
>
> * 静态上下文（提示词）：语气指南、公司政策、回复模板
> * 动态上下文（来自状态）：分类结果、检索结果、客户历史
> * 期望结果：可直接送审的专业邮件回复

### 数据步骤

当一个步骤需要从外部来源检索信息时：

> **文档检索**
>
> * 参数：根据意图和主题构建的查询
> * 重试策略：需要，针对瞬时故障使用指数退避
> * 缓存：可以缓存常见查询以减少 API 调用

> **客户历史查询**
>
> * 参数：来自状态的客户邮箱或 ID
> * 重试策略：需要，但在不可用时回退到基本信息
> * 缓存：需要，并设置存活时间以在新鲜度与性能之间取得平衡

### 操作步骤

当一个步骤需要执行外部操作时：

> **发送回复**
>
> * 何时执行该节点：审批之后（人工或自动）
> * 重试策略：需要，针对网络问题使用指数退避
> * 不应缓存：每次发送都是唯一的操作

> **缺陷跟踪**
>
> * 何时执行该节点：当意图为 “bug” 时总是执行
> * 重试策略：需要，不丢失缺陷报告至关重要
> * 返回：要包含在回复中的工单 ID

### 用户输入步骤

当一个步骤需要人工介入时：

> **人工审核节点**
>
> * 用于决策的上下文：原始邮件、回复草稿、紧急程度、分类结果
> * 期望的输入格式：审批布尔值，加上可选的编辑后回复
> * 触发时机：高紧急程度、复杂问题或质量存疑

## 步骤 3：设计你的状态

状态是所有节点都能访问的共享[记忆](https://docs.langchain.com/oss/javascript/concepts/memory.md)。可以把它看作智能体在推进流程时用来记录它所学到、所决定的一切的笔记本。

### 状态里该放什么？

针对每一份数据，问自己这些问题：

> **放入状态**
>
> 它是否需要跨步骤持久存在？如果需要，就放入状态。

> **不要存储**
>
> 你能从其他数据推导出它吗？如果能，就在需要时计算，而不是把它存进状态。

对于我们的邮件智能体，需要跟踪：

* 原始邮件和发件人信息（之后无法重建）
* 分类结果（多个后续节点都需要）
* 检索结果和客户数据（重新获取代价高）
* 回复草稿（需要在审核过程中持久存在）
* 执行元数据（用于调试和恢复）

### 保持状态原始，按需格式化提示词

> [!TIP]
>
> 一个关键原则：状态应当存储原始数据，而不是格式化后的文本。在需要时于节点内部格式化提示词。

这种分离意味着：

* 不同节点可以根据各自需要以不同方式格式化同一份数据
* 你可以修改提示词模板而无需改动状态 schema
* 调试更清晰——你能确切看到每个节点收到了什么数据
* 智能体可以演进，而不会破坏已有的状态

下面定义我们的状态：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema } from "@langchain/langgraph";
import * as z from "zod";

// Define the structure for email classification
const EmailClassificationSchema = z.object({
  intent: z.enum(["question", "bug", "billing", "feature", "complex"]),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  topic: z.string(),
  summary: z.string(),
});

const EmailAgentState = new StateSchema({
  // Raw email data
  emailContent: z.string(),
  senderEmail: z.string(),
  emailId: z.string(),

  // Classification result
  classification: EmailClassificationSchema.optional(),

  // Raw search/API results
  searchResults: z.array(z.string()).optional(),  // List of raw document chunks
  customerHistory: z.record(z.string(), z.any()).optional(),  // Raw customer data from CRM

  // Generated content
  responseText: z.string().optional(),
});

type EmailClassificationType = z.infer<typeof EmailClassificationSchema>;
```

注意，状态中只包含原始数据——没有提示词模板，没有格式化字符串，也没有指令。分类输出直接作为一个字典存储，就来自 LLM 的原始结果。

## 步骤 4：构建你的节点

现在我们把每个步骤实现为一个函数。LangGraph 中的节点就是一个 JavaScript 函数，它接收当前状态并返回对状态的更新。

### 恰当地处理错误

不同类型的错误需要不同的处理策略：

| 错误类型 | 由谁修复 | 策略 | 何时使用 |
| - | - | - | - |
| 瞬时错误（网络问题、速率限制） | 系统（自动） | 重试策略 | 通常重试即可解决的临时失败 |
| LLM 可恢复的错误（工具失败、解析问题） | LLM | 把错误存入状态并回环 | LLM 能看到错误并调整其做法 |
| 用户可修复的错误（信息缺失、指令不清） | 人工 | 用 `interrupt()` 暂停 | 需要用户输入才能继续 |
| 重试后仍可恢复的失败 | 开发者（声明式） | `error_handler` | 重试耗尽后运行补偿/恢复分支 |
| 意外错误 | 开发者 | 让它们向上冒泡 | 需要调试的未知问题 |

**瞬时错误**

添加重试策略，自动重试网络问题和速率限制。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import type { RetryPolicy } from "@langchain/langgraph";

workflow.addNode(
  "searchDocumentation",
  searchDocumentation,
  {
    retryPolicy: { maxAttempts: 3, initialInterval: 1.0 },
  },
);
```

**LLM 可恢复的错误**

把错误存入状态并回环，让 LLM 看到出了什么问题并重试：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command, GraphNode } from "@langchain/langgraph";

const executeTool: GraphNode<typeof State> = async (state, config) => {
  try {
    const result = await runTool(state.toolCall);
    return new Command({
      update: { toolResult: result },
      goto: "agent",
    });
  } catch (error) {
    // Let the LLM see what went wrong and try again
    return new Command({
      update: { toolResult: `Tool error: ${error}` },
      goto: "agent"
    });
  }
}
```

**用户可修复的错误**

在需要时暂停并向用户收集信息（例如账号 ID、订单号或澄清说明）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command, GraphNode, interrupt } from "@langchain/langgraph";

const lookupCustomerHistory: GraphNode<typeof State> = async (state, config) => {
  if (!state.customerId) {
    const userInput = interrupt({
      message: "Customer ID needed",
      request: "Please provide the customer's account ID to look up their subscription history",
    });
    return new Command({
      update: { customerId: userInput.customerId },
      goto: "lookupCustomerHistory",
    });
  }
  // Now proceed with the lookup
  const customerData = await fetchCustomerHistory(state.customerId);
  return new Command({
    update: { customerHistory: customerData },
    goto: "draftResponse",
  });
}
```

**意外错误**

让它们向上冒泡以便调试。不要捕获你无法处理的错误：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Command, GraphNode } from "@langchain/langgraph";

const sendReply: GraphNode<typeof EmailAgentState> = async (state, config) => {
  try {
    await emailService.send(state.responseText);
  } catch (error) {
    throw error;  // Surface unexpected errors
  }
}
```

**Saga / 补偿**

重试耗尽后，运行一个恢复函数，它更新状态并路由到补偿分支。

### 实现我们的邮件智能体节点

我们会把每个节点实现为一个简单的函数。记住：节点接收状态、做事情、返回更新。

> **读取与分类节点**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { StateGraph, START, END, GraphNode, Command } from "@langchain/langgraph";
> import { HumanMessage } from "@langchain/core/messages";
> import { ChatAnthropic } from "@langchain/anthropic";
>
> const llm = new ChatAnthropic({ model: "claude-sonnet-4-6" });
>
> const readEmail: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Extract and parse email content
>   // In production, this would connect to your email service
>   console.log(`Processing email: ${state.emailContent}`);
>   return {};
> }
>
> const classifyIntent: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Use LLM to classify email intent and urgency, then route accordingly
>
>   // Create structured LLM that returns EmailClassification object
>   const structuredLlm = llm.withStructuredOutput(EmailClassificationSchema);
>
>   // Format the prompt on-demand, not stored in state
>   const classificationPrompt = `
>   Analyze this customer email and classify it:
>
>   Email: ${state.emailContent}
>   From: ${state.senderEmail}
>
>   Provide classification including intent, urgency, topic, and summary.
>   `;
>
>   // Get structured response directly as object
>   const classification = await structuredLlm.invoke(classificationPrompt);
>
>   // Determine next node based on classification
>   let nextNode: "searchDocumentation" | "humanReview" | "draftResponse" | "bugTracking";
>
>   if (classification.intent === "billing" || classification.urgency === "critical") {
>     nextNode = "humanReview";
>   } else if (classification.intent === "question" || classification.intent === "feature") {
>     nextNode = "searchDocumentation";
>   } else if (classification.intent === "bug") {
>     nextNode = "bugTracking";
>   } else {
>     nextNode = "draftResponse";
>   }
>
>   // Store classification as a single object in state
>   return new Command({
>     update: { classification },
>     goto: nextNode,
>   });
> }
> ```

> **检索与跟踪节点**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { Command, GraphNode } from "@langchain/langgraph";
>
> const searchDocumentation: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Search knowledge base for relevant information
>
>   // Build search query from classification
>   const classification = state.classification!;
>   const query = `${classification.intent} ${classification.topic}`;
>
>   let searchResults: string[];
>
>   try {
>     // Implement your search logic here
>     // Store raw search results, not formatted text
>     searchResults = [
>       "Reset password via Settings > Security > Change Password",
>       "Password must be at least 12 characters",
>       "Include uppercase, lowercase, numbers, and symbols",
>     ];
>   } catch (error) {
>     // For recoverable search errors, store error and continue
>     searchResults = [`Search temporarily unavailable: ${error}`];
>   }
>
>   return new Command({
>     update: { searchResults },  // Store raw results or error
>     goto: "draftResponse",
>   });
> }
>
> const bugTracking: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Create or update bug tracking ticket
>
>   // Create ticket in your bug tracking system
>   const ticketId = "BUG-12345";  // Would be created via API
>
>   return new Command({
>     update: { searchResults: [`Bug ticket ${ticketId} created`] },
>     goto: "draftResponse",
>   });
> }
> ```

> **回复节点**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { Command, interrupt } from "@langchain/langgraph";
>
> const draftResponse: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Generate response using context and route based on quality
>
>   const classification = state.classification!;
>
>   // Format context from raw state data on-demand
>   const contextSections: string[] = [];
>
>   if (state.searchResults) {
>     // Format search results for the prompt
>     const formattedDocs = state.searchResults.map(doc => `- ${doc}`).join("\n");
>     contextSections.push(`Relevant documentation:\n${formattedDocs}`);
>   }
>
>   if (state.customerHistory) {
>     // Format customer data for the prompt
>     contextSections.push(`Customer tier: ${state.customerHistory.tier ?? "standard"}`);
>   }
>
>   // Build the prompt with formatted context
>   const draftPrompt = `
>   Draft a response to this customer email:
>   ${state.emailContent}
>
>   Email intent: ${classification.intent}
>   Urgency level: ${classification.urgency}
>
>   ${contextSections.join("\n\n")}
>
>   Guidelines:
>   - Be professional and helpful
>   - Address their specific concern
>   - Use the provided documentation when relevant
>   `;
>
>   const response = await llm.invoke([new HumanMessage(draftPrompt)]);
>
>   // Determine if human review needed based on urgency and intent
>   const needsReview = (
>     classification.urgency === "high" ||
>     classification.urgency === "critical" ||
>     classification.intent === "complex"
>   );
>
>   // Route to appropriate next node
>   const nextNode = needsReview ? "humanReview" : "sendReply";
>
>   return new Command({
>     update: { responseText: response.content.toString() },  // Store only the raw response
>     goto: nextNode,
>   });
> }
>
> const humanReview: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Pause for human review using interrupt and route based on decision
>   const classification = state.classification!;
>
>   // interrupt() must come first - any code before it will re-run on resume
>   const humanDecision = interrupt({
>     emailId: state.emailId,
>     originalEmail: state.emailContent,
>     draftResponse: state.responseText,
>     urgency: classification.urgency,
>     intent: classification.intent,
>     action: "Please review and approve/edit this response",
>   });
>
>   // Now process the human's decision
>   if (humanDecision.approved) {
>     return new Command({
>       update: { responseText: humanDecision.editedResponse || state.responseText },
>       goto: "sendReply",
>     });
>   } else {
>     // Rejection means human will handle directly
>     return new Command({ update: {}, goto: END });
>   }
> }
>
> const sendReply: GraphNode<typeof EmailAgentState> = async (state, config) => {
>   // Send the email response
>   // Integrate with email service
>   console.log(`Sending reply: ${state.responseText!.substring(0, 100)}...`);
>   return {};
> }
> ```

## 步骤 5：把它们连接起来

现在我们把节点连接成一个可运行的图。由于我们的节点自己处理路由决策，我们只需要少量必不可少的边。

为了通过 `interrupt()` 启用[人在环路](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)，我们需要在编译时传入[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)，以便在多次运行之间保存状态：

> **图编译代码**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { MemorySaver, RetryPolicy } from "@langchain/langgraph";
>
> // Create the graph
> const workflow = new StateGraph(EmailAgentState)
>   // Add nodes with appropriate error handling
>   .addNode("readEmail", readEmail)
>   .addNode("classifyIntent", classifyIntent)
>   // Add retry policy for nodes that might have transient failures
>   .addNode(
>     "searchDocumentation",
>     searchDocumentation,
>     { retryPolicy: { maxAttempts: 3 } },
>   )
>   .addNode("bugTracking", bugTracking)
>   .addNode("draftResponse", draftResponse)
>   .addNode("humanReview", humanReview)
>   .addNode("sendReply", sendReply)
>   // Add only the essential edges
>   .addEdge(START, "readEmail")
>   .addEdge("readEmail", "classifyIntent")
>   .addEdge("sendReply", END);
>
> // Compile with checkpointer for persistence
> const memory = new MemorySaver();
> const app = workflow.compile({ checkpointer: memory });
> ```

图结构之所以极简，是因为路由发生在节点内部，通过 `Command` 对象完成。每个节点都声明了它可以去哪里，使流程显式且可追踪。

### 试一试你的智能体

让我们用一个需要人工审核的紧急账单问题来运行我们的智能体：

> **测试智能体**
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> // Test with an urgent billing issue
> const initialState: EmailAgentStateType = {
>   emailContent: "I was charged twice for my subscription! This is urgent!",
>   senderEmail: "customer@example.com",
>   emailId: "email_123"
> };
>
> // Run with a thread_id for persistence
> const config = { configurable: { thread_id: "customer_123" } };
> const result = await app.invoke(initialState, config);
> // The graph will pause at human_review
> console.log(`Draft ready for review: ${result.responseText?.substring(0, 100)}...`);
> ```
>
> ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
> import { Command } from "@langchain/langgraph";
>
> // When ready, provide human input to resume
> const humanResponse = new Command({
>   resume: {
>     approved: true,
>     editedResponse: "We sincerely apologize for the double charge. I've initiated an immediate refund...",
>   }
> });
>
> // Resume execution
> const finalResult = await app.invoke(humanResponse, config);
> console.log("Email sent successfully!");
> ```

当图遇到 `interrupt()` 时会暂停，把所有内容保存到检查点保存器并等待。它可以在几天后恢复，从上次停止的地方精确继续。`thread_id` 确保这段对话的所有状态都被保存在一起。

## 小结与后续步骤

### 关键洞见

构建这个邮件智能体向我们展示了 LangGraph 的思考方式：

> **[拆分为离散步骤](#step-1-map-out-your-workflow-as-discrete-steps)**
>
> 每个节点都只把一件事做好。这种拆解带来了流式进度更新、可暂停可恢复的持久化执行，以及更清晰的调试——你可以在步骤之间检查状态。

> **[状态是共享记忆](#step-3-design-your-state)**
>
> 存储原始数据，而不是格式化文本。这让不同节点能以不同方式使用同一份信息。

> **[节点是函数](#step-4-build-your-nodes)**
>
> 它们接收状态、做事情、返回更新。当需要做路由决策时，它们同时指明状态更新和下一个目的地。

> **[错误是流程的一部分](#handle-errors-appropriately)**
>
> 瞬时失败会重试，LLM 可恢复的错误会带着上下文回环，用户可修复的问题会暂停等待输入，意外错误则向上冒泡以便调试。

> **[人工输入是一等公民](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)**
>
> `interrupt()` 函数会无限期暂停执行、保存所有状态，并在你提供输入时从上次停止的地方精确恢复。当它与节点中的其他操作一起使用时，它必须放在最前面。

> **[图结构自然浮现](#step-5-wire-it-together)**
>
> 你定义必不可少的连接，而节点自己处理路由逻辑。这让控制流保持显式且可追踪——你总是可以通过查看当前节点来理解智能体下一步会做什么。

### 进阶考量

> **节点粒度的取舍**
>
> > [!NOTE]
> >
> > 本节探讨节点粒度设计中的取舍。大多数应用可以跳过这一节，直接使用上面展示的模式。
>
> 你可能会问：为什么不把 `Read Email` 和 `Classify Intent` 合并成一个节点？
>
> 或者为什么把 Doc Search 与 Draft Reply 分开？
>
> 答案涉及韧性（resilience）与可观测性之间的取舍。
>
> **韧性方面的考量：** LangGraph 的[持久化层](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)会在节点边界处创建检查点。当工作流在中断或失败后恢复时，它会从执行停止的那个节点的开头重新开始。节点越小，检查点越频繁，出错时需要重复的工作就越少。如果你把多个操作合并成一个大节点，接近末尾处的失败意味着要从该节点开头重新执行所有内容。
>
> 我们为邮件智能体选择这种拆分方式的原因：
>
> * **外部服务的隔离：** Doc Search 和 Bug Track 是独立节点，因为它们调用外部 API。如果检索服务很慢或失败，我们希望把它与 LLM 调用隔离开。我们可以只给这些特定节点添加重试策略，而不影响其他节点。
>
> * **中间可见性：** 把 `Classify Intent` 作为独立节点，让我们能在采取行动之前检查 LLM 的决定。这对调试和监控很有价值——你可以确切看到智能体何时、以及为什么路由到人工审核。
>
> * **不同的失败模式：** LLM 调用、数据库查询和邮件发送有不同的重试策略。分开的节点让你能独立配置它们。
>
> * **可复用性与测试：** 更小的节点更容易单独测试，也更容易在其他工作流中复用。
>
> 另一种同样有效的做法：你可以把 `Read Email` 和 `Classify Intent` 合并成单个节点。但你会失去在分类之前检查原始邮件的能力，而且该节点中任何失败都会导致两个操作都被重复执行。对大多数应用来说，分开节点带来的可观测性和调试收益值得这一取舍。
>
> 应用层面的考量：步骤 2 中关于缓存的讨论（是否缓存检索结果）属于应用层面的决策，而不是 LangGraph 框架的功能。你在节点函数内部根据自身具体需求实现缓存——LangGraph 并不对此作规定。
>
> 性能方面的考量：节点更多并不意味着执行更慢。LangGraph 默认在后台写入检查点（[异步持久化模式](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md#durability-modes)），因此你的图会继续运行，而不必等待检查点写完。这意味着你既能获得频繁的检查点，又只有极小的性能影响。如有需要，你可以调整这一行为——使用 `"exit"` 模式仅在完成时写入检查点，或使用 `"sync"` 模式阻塞执行直到每个检查点写入完成。

### 从这里往哪里走

本文是对“如何用 LangGraph 思考构建智能体”的介绍。你可以在此基础上继续扩展：

> **[人在环路模式](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)**
>
> 学习如何在执行前添加工具审批、批量审批以及其他模式

> **[子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)**
>
> 为复杂的多步骤操作创建子图

> **[流式传输](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)**
>
> 添加流式传输，向用户展示实时进度

> **[可观测性](https://docs.langchain.com/oss/javascript/langgraph/observability.md)**
>
> 使用 LangSmith 添加可观测性，以便调试和监控

> **[工具集成](https://docs.langchain.com/oss/javascript/langchain/tools.md)**
>
> 集成更多工具，用于网页检索、数据库查询和 API 调用

> **[重试逻辑](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api.md#add-retry-policies)**
>
> 为失败的操作实现带指数退避的重试逻辑

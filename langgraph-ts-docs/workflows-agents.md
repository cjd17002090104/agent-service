> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/workflows-agents.md

# 工作流与智能体

本指南介绍常见的工作流与智能体模式。

* 工作流具有预先确定的代码路径，并按特定顺序运行。
* 智能体是动态的，自行定义其流程和工具使用方式。

![智能体工作流](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/agent_workflow.png?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=c217c9ef517ee556cae3fc928a21dc55)

在构建智能体和工作流时，LangGraph 提供多项优势，包括[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)、[流式传输](https://docs.langchain.com/oss/javascript/langgraph/streaming.md)，以及对调试和[部署](https://docs.langchain.com/oss/javascript/langgraph/deploy.md)的支持。

> [!TIP]
>
> 使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-workflows-agents) 追踪并对比这些工作流模式。按照[追踪快速入门](https://docs.langchain.com/langsmith/trace-with-langgraph.md)查看数据如何流经每个步骤。我们还建议你配置 [LangSmith Engine](https://docs.langchain.com/langsmith/engine.md)，它会监控你的追踪、检测问题并提出修复方案。

## 环境准备

要构建工作流或智能体，你可以使用[任何支持结构化输出和工具调用的聊天模型](https://docs.langchain.com/oss/javascript/integrations/chat.md)。下面的示例使用 Anthropic：

1. 安装依赖

```bash npm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install @langchain/langgraph @langchain/core
```

```bash pnpm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
pnpm add @langchain/langgraph @langchain/core
```

```bash yarn theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
yarn add @langchain/langgraph @langchain/core
```

```bash bun theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
bun add @langchain/langgraph @langchain/core
```

2. 初始化 LLM：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ChatAnthropic } from "@langchain/anthropic";

const llm = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  apiKey: "<your_anthropic_key>"
});
```

## LLM 与增强

工作流和智能体系统建立在 LLM 以及你为它们添加的各种增强之上。[工具调用](https://docs.langchain.com/oss/javascript/langchain/tools.md)、[结构化输出](https://docs.langchain.com/oss/javascript/langchain/structured-output.md)和[短期记忆](https://docs.langchain.com/oss/javascript/langchain/short-term-memory.md)只是让 LLM 贴合你需求的几种选项。

![LLM 增强](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/augmented_llm.png?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=7ea9656f46649b3ebac19e8309ae9006)

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}

import * as z from "zod";
import { tool } from "langchain";

// Schema for structured output
const SearchQuery = z.object({
  search_query: z.string().describe("Query that is optimized web search."),
  justification: z
    .string()
    .describe("Why this query is relevant to the user's request."),
});

// Augment the LLM with schema for structured output
const structuredLlm = llm.withStructuredOutput(SearchQuery);

// Invoke the augmented LLM
const output = await structuredLlm.invoke(
  "How does Calcium CT score relate to high cholesterol?"
);

// Define a tool
const multiply = tool(
  ({ a, b }) => {
    return a * b;
  },
  {
    name: "multiply",
    description: "Multiply two numbers",
    schema: z.object({
      a: z.number(),
      b: z.number(),
    }),
  }
);

// Augment the LLM with tools
const llmWithTools = llm.bindTools([multiply]);

// Invoke the LLM with input that triggers the tool call
const msg = await llmWithTools.invoke("What is 2 times 3?");

// Get the tool call
console.log(msg.tool_calls);
```

## 提示词链

提示词链是指每次 LLM 调用都处理上一次调用的输出。它常用于执行可拆解为更小、可验证步骤的明确定义的任务。例如：

* 把文档翻译成不同语言
* 校验生成内容的一致性

![提示词链](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/prompt_chain.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=762dec147c31b8dc6ebb0857e236fc1f)

```typescript Graph API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, ConditionalEdgeRouter } from "@langchain/langgraph";
import { z } from "zod/v4";

// Graph state
const State = new StateSchema({
  topic: z.string(),
  joke: z.string(),
  improvedJoke: z.string(),
  finalJoke: z.string(),
});

// Define node functions

// First LLM call to generate initial joke
const generateJoke: GraphNode<typeof State> = async (state) => {
  const msg = await llm.invoke(`Write a short joke about ${state.topic}`);
  return { joke: msg.content };
};

// Gate function to check if the joke has a punchline
const checkPunchline: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "improveJoke" }> = (state) => {
  // Simple check - does the joke contain "?" or "!"
  if (state.joke?.includes("?") || state.joke?.includes("!")) {
    return "Pass";
  }
  return "Fail";
};

// Second LLM call to improve the joke
const improveJoke: GraphNode<typeof State> = async (state) => {
  const msg = await llm.invoke(
    `Make this joke funnier by adding wordplay: ${state.joke}`
  );
  return { improvedJoke: msg.content };
};

// Third LLM call for final polish
const polishJoke: GraphNode<typeof State> = async (state) => {
  const msg = await llm.invoke(
    `Add a surprising twist to this joke: ${state.improvedJoke}`
  );
  return { finalJoke: msg.content };
};

// Build workflow
const chain = new StateGraph(State)
  .addNode("generateJoke", generateJoke)
  .addNode("improveJoke", improveJoke)
  .addNode("polishJoke", polishJoke)
  .addEdge("__start__", "generateJoke")
  .addConditionalEdges("generateJoke", checkPunchline, {
    Pass: "improveJoke",
    Fail: "__end__"
  })
  .addEdge("improveJoke", "polishJoke")
  .addEdge("polishJoke", "__end__")
  .compile();

// Invoke
const state = await chain.invoke({ topic: "cats" });
console.log("Initial joke:");
console.log(state.joke);
console.log("\n--- --- ---\n");
if (state.improvedJoke !== undefined) {
  console.log("Improved joke:");
  console.log(state.improvedJoke);
  console.log("\n--- --- ---\n");

  console.log("Final joke:");
  console.log(state.finalJoke);
} else {
  console.log("Joke failed quality gate - no punchline detected!");
}
```

```typescript Functional API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task, entrypoint } from "@langchain/langgraph";

// Tasks

// First LLM call to generate initial joke
const generateJoke = task("generateJoke", async (topic: string) => {
  const msg = await llm.invoke(`Write a short joke about ${topic}`);
  return msg.content;
});

// Gate function to check if the joke has a punchline
function checkPunchline(joke: string) {
  // Simple check - does the joke contain "?" or "!"
  if (joke.includes("?") || joke.includes("!")) {
    return "Pass";
  }
  return "Fail";
}

  // Second LLM call to improve the joke
const improveJoke = task("improveJoke", async (joke: string) => {
  const msg = await llm.invoke(
    `Make this joke funnier by adding wordplay: ${joke}`
  );
  return msg.content;
});

// Third LLM call for final polish
const polishJoke = task("polishJoke", async (joke: string) => {
  const msg = await llm.invoke(
    `Add a surprising twist to this joke: ${joke}`
  );
  return msg.content;
});

const workflow = entrypoint(
  "jokeMaker",
  async (topic: string) => {
    const originalJoke = await generateJoke(topic);
    if (checkPunchline(originalJoke) === "Pass") {
      return originalJoke;
    }
    const improvedJoke = await improveJoke(originalJoke);
    const polishedJoke = await polishJoke(improvedJoke);
    return polishedJoke;
  }
);

const stream = await workflow.streamEvents("cats", { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

## 并行化

通过并行化，多个 LLM 同时处理一个任务。这可以是同时运行多个独立的子任务，也可以是多次运行同一任务以检查不同输出。并行化常用于：

* 拆分并并行运行子任务，从而提升速度
* 多次运行任务以检查不同输出，从而提升信心

一些示例包括：

* 运行一个子任务来提取文档中的关键词，再运行第二个子任务来检查格式错误
* 多次运行同一个任务，依据不同标准为文档的准确性打分，例如引用数量、使用的来源数量以及来源质量

![并行化](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/parallelization.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=8afe3c427d8cede6fed1e4b2a5107b71)

```typescript Graph API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode } from "@langchain/langgraph";
import * as z from "zod";

// Graph state
const State = new StateSchema({
  topic: z.string(),
  joke: z.string(),
  story: z.string(),
  poem: z.string(),
  combinedOutput: z.string(),
});

// Nodes
// First LLM call to generate initial joke
const callLlm1: GraphNode<typeof State> = async (state) => {
  const msg = await llm.invoke(`Write a joke about ${state.topic}`);
  return { joke: msg.content };
};

// Second LLM call to generate story
const callLlm2: GraphNode<typeof State> = async (state) => {
  const msg = await llm.invoke(`Write a story about ${state.topic}`);
  return { story: msg.content };
};

// Third LLM call to generate poem
const callLlm3: GraphNode<typeof State> = async (state) => {
  const msg = await llm.invoke(`Write a poem about ${state.topic}`);
  return { poem: msg.content };
};

// Combine the joke, story and poem into a single output
const aggregator: GraphNode<typeof State> = async (state) => {
  const combined = `Here's a story, joke, and poem about ${state.topic}!\n\n` +
    `STORY:\n${state.story}\n\n` +
    `JOKE:\n${state.joke}\n\n` +
    `POEM:\n${state.poem}`;
  return { combinedOutput: combined };
};

// Build workflow
const parallelWorkflow = new StateGraph(State)
  .addNode("callLlm1", callLlm1)
  .addNode("callLlm2", callLlm2)
  .addNode("callLlm3", callLlm3)
  .addNode("aggregator", aggregator)
  .addEdge("__start__", "callLlm1")
  .addEdge("__start__", "callLlm2")
  .addEdge("__start__", "callLlm3")
  .addEdge("callLlm1", "aggregator")
  .addEdge("callLlm2", "aggregator")
  .addEdge("callLlm3", "aggregator")
  .addEdge("aggregator", "__end__")
  .compile();

// Invoke
const result = await parallelWorkflow.invoke({ topic: "cats" });
console.log(result.combinedOutput);
```

```typescript Functional API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task, entrypoint } from "@langchain/langgraph";

// Tasks

// First LLM call to generate initial joke
const callLlm1 = task("generateJoke", async (topic: string) => {
  const msg = await llm.invoke(`Write a joke about ${topic}`);
  return msg.content;
});

// Second LLM call to generate story
const callLlm2 = task("generateStory", async (topic: string) => {
  const msg = await llm.invoke(`Write a story about ${topic}`);
  return msg.content;
});

// Third LLM call to generate poem
const callLlm3 = task("generatePoem", async (topic: string) => {
  const msg = await llm.invoke(`Write a poem about ${topic}`);
  return msg.content;
});

// Combine outputs
const aggregator = task("aggregator", async (params: {
  topic: string;
  joke: string;
  story: string;
  poem: string;
}) => {
  const { topic, joke, story, poem } = params;
  return `Here's a story, joke, and poem about ${topic}!\n\n` +
    `STORY:\n${story}\n\n` +
    `JOKE:\n${joke}\n\n` +
    `POEM:\n${poem}`;
});

// Build workflow
const workflow = entrypoint(
  "parallelWorkflow",
  async (topic: string) => {
    const [joke, story, poem] = await Promise.all([
      callLlm1(topic),
      callLlm2(topic),
      callLlm3(topic),
    ]);

    return aggregator({ topic, joke, story, poem });
  }
);

// Invoke
const stream = await workflow.streamEvents("cats", { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

## 路由

路由式工作流会先处理输入，然后把它们导向与上下文相关的任务。这让你能为复杂任务定义专门的流程。例如，一个用于回答产品相关问题的流程可能先处理问题类型，然后把请求路由到针对定价、退款、退货等的特定流程。

![路由](https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/routing.png?fit=max\&auto=format\&n=dL5Sn6Cmy9pwtY0V\&q=85\&s=272e0e9b681b89cd7d35d5c812c50ee6)

```typescript Graph API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, ConditionalEdgeRouter } from "@langchain/langgraph";
import * as z from "zod";

// Schema for structured output to use as routing logic
const routeSchema = z.object({
  step: z.enum(["poem", "story", "joke"]).describe(
    "The next step in the routing process"
  ),
});

// Augment the LLM with schema for structured output
const router = llm.withStructuredOutput(routeSchema);

// Graph state
const State = new StateSchema({
  input: z.string(),
  decision: z.string(),
  output: z.string(),
});

// Nodes
// Write a story
const llmCall1: GraphNode<typeof State> = async (state) => {
  const result = await llm.invoke([{
    role: "system",
    content: "You are an expert storyteller.",
  }, {
    role: "user",
    content: state.input
  }]);
  return { output: result.content };
};

// Write a joke
const llmCall2: GraphNode<typeof State> = async (state) => {
  const result = await llm.invoke([{
    role: "system",
    content: "You are an expert comedian.",
  }, {
    role: "user",
    content: state.input
  }]);
  return { output: result.content };
};

// Write a poem
const llmCall3: GraphNode<typeof State> = async (state) => {
  const result = await llm.invoke([{
    role: "system",
    content: "You are an expert poet.",
  }, {
    role: "user",
    content: state.input
  }]);
  return { output: result.content };
};

const llmCallRouter: GraphNode<typeof State> = async (state) => {
  // Route the input to the appropriate node
  const decision = await router.invoke([
    {
      role: "system",
      content: "Route the input to story, joke, or poem based on the user's request."
    },
    {
      role: "user",
      content: state.input
    },
  ]);

  return { decision: decision.step };
};

// Conditional edge function to route to the appropriate node
const routeDecision: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "llmCall1" | "llmCall2" | "llmCall3" }> = (state) => {
  // Return the node name you want to visit next
  if (state.decision === "story") {
    return "llmCall1";
  } else if (state.decision === "joke") {
    return "llmCall2";
  } else {
    return "llmCall3";
  }
};

// Build workflow
const routerWorkflow = new StateGraph(State)
  .addNode("llmCall1", llmCall1)
  .addNode("llmCall2", llmCall2)
  .addNode("llmCall3", llmCall3)
  .addNode("llmCallRouter", llmCallRouter)
  .addEdge("__start__", "llmCallRouter")
  .addConditionalEdges(
    "llmCallRouter",
    routeDecision,
    ["llmCall1", "llmCall2", "llmCall3"],
  )
  .addEdge("llmCall1", "__end__")
  .addEdge("llmCall2", "__end__")
  .addEdge("llmCall3", "__end__")
  .compile();

// Invoke
const state = await routerWorkflow.invoke({
  input: "Write me a joke about cats"
});
console.log(state.output);
```

```typescript Functional API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { task, entrypoint } from "@langchain/langgraph";

// Schema for structured output to use as routing logic
const routeSchema = z.object({
  step: z.enum(["poem", "story", "joke"]).describe(
    "The next step in the routing process"
  ),
});

// Augment the LLM with schema for structured output
const router = llm.withStructuredOutput(routeSchema);

// Tasks
// Write a story
const llmCall1 = task("generateStory", async (input: string) => {
  const result = await llm.invoke([{
    role: "system",
    content: "You are an expert storyteller.",
  }, {
    role: "user",
    content: input
  }]);
  return result.content;
});

// Write a joke
const llmCall2 = task("generateJoke", async (input: string) => {
  const result = await llm.invoke([{
    role: "system",
    content: "You are an expert comedian.",
  }, {
    role: "user",
    content: input
  }]);
  return result.content;
});

// Write a poem
const llmCall3 = task("generatePoem", async (input: string) => {
  const result = await llm.invoke([{
    role: "system",
    content: "You are an expert poet.",
  }, {
    role: "user",
    content: input
  }]);
  return result.content;
});

// Route the input to the appropriate node
const llmCallRouter = task("router", async (input: string) => {
  const decision = await router.invoke([
    {
      role: "system",
      content: "Route the input to story, joke, or poem based on the user's request."
    },
    {
      role: "user",
      content: input
    },
  ]);
  return decision.step;
});

// Build workflow
const workflow = entrypoint(
  "routerWorkflow",
  async (input: string) => {
    const nextStep = await llmCallRouter(input);

    let llmCall;
    if (nextStep === "story") {
      llmCall = llmCall1;
    } else if (nextStep === "joke") {
      llmCall = llmCall2;
    } else if (nextStep === "poem") {
      llmCall = llmCall3;
    }

    const finalResult = await llmCall(input);
    return finalResult;
  }
);

// Invoke
const stream = await workflow.streamEvents("Write me a joke about cats", { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

## 编排器-工作者

在编排器-工作者配置中，编排器会：

* 把任务拆解为子任务
* 把子任务委派给工作者
* 把工作者的输出综合为最终结果

![工作者](https://mintcdn.com/langchain-5e9cc07a/ybiAaBfoBvFquMDz/oss/images/worker.png?fit=max\&auto=format\&n=ybiAaBfoBvFquMDz\&q=85\&s=2e423c67cd4f12e049cea9c169ff0676)

编排器-工作者工作流提供更高的灵活性，通常用于子任务无法像[并行化](#parallelization)那样预先定义的场景。这在编写代码或需要跨多个文件更新内容的工作流中很常见。例如，一个需要为多个 Python 库更新安装说明、而涉及的文档数量未知的工作流，就可能使用这种模式。

```typescript Graph API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}

type SectionSchema = {
    name: string;
    description: string;
}
type SectionsSchema = {
    sections: SectionSchema[];
}

// Augment the LLM with schema for structured output
const planner = llm.withStructuredOutput(sectionsSchema);
```

```typescript Functional API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { task, entrypoint } from "@langchain/langgraph";

// Schema for structured output to use in planning
const sectionSchema = z.object({
  name: z.string().describe("Name for this section of the report."),
  description: z.string().describe(
    "Brief overview of the main topics and concepts to be covered in this section."
  ),
});

const sectionsSchema = z.object({
  sections: z.array(sectionSchema).describe("Sections of the report."),
});

// Augment the LLM with schema for structured output
const planner = llm.withStructuredOutput(sectionsSchema);

// Tasks
const orchestrator = task("orchestrator", async (topic: string) => {
  // Generate queries
  const reportSections = await planner.invoke([
    { role: "system", content: "Generate a plan for the report." },
    { role: "user", content: `Here is the report topic: ${topic}` },
  ]);

  return reportSections.sections;
});

const llmCall = task("sectionWriter", async (section: z.infer<typeof sectionSchema>) => {
  // Generate section
  const result = await llm.invoke([
    {
      role: "system",
      content: "Write a report section.",
    },
    {
      role: "user",
      content: `Here is the section name: ${section.name} and description: ${section.description}`,
    },
  ]);

  return result.content;
});

const synthesizer = task("synthesizer", async (completedSections: string[]) => {
  // Synthesize full report from sections
  return completedSections.join("\n\n---\n\n");
});

// Build workflow
const workflow = entrypoint(
  "orchestratorWorker",
  async (topic: string) => {
    const sections = await orchestrator(topic);
    const completedSections = await Promise.all(
      sections.map((section) => llmCall(section))
    );
    return synthesizer(completedSections);
  }
);

// Invoke
const stream = await workflow.streamEvents("Create a report on LLM scaling laws", { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

### 在 LangGraph 中创建工作节点

编排器-工作者工作流非常常见，LangGraph 对此提供了内置支持。`Send` API 让你可以动态创建工作者节点并向它们发送特定输入。每个工作者都有自己的状态，而所有工作者的输出都会写入一个共享状态键，编排器图可以访问该键。这使得编排器能够访问所有工作者的输出，并把它们综合为最终输出。下面的示例遍历一个章节列表，并使用 `Send` API 把每个章节发送给一个工作者。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, ReducedValue, GraphNode, Send } from "@langchain/langgraph";
import * as z from "zod";

// Graph state
const State = new StateSchema({
  topic: z.string(),
  sections: z.array(z.custom<SectionsSchema>()),
  completedSections: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (a, b) => a.concat(b) }
  ),
  finalReport: z.string(),
});

// Worker state
const WorkerState = new StateSchema({
  section: z.custom<SectionsSchema>(),
  completedSections: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (a, b) => a.concat(b) }
  ),
});

// Nodes
const orchestrator: GraphNode<typeof State> = async (state) => {
  // Generate queries
  const reportSections = await planner.invoke([
    { role: "system", content: "Generate a plan for the report." },
    { role: "user", content: `Here is the report topic: ${state.topic}` },
  ]);

  return { sections: reportSections.sections };
};

const llmCall: GraphNode<typeof WorkerState> = async (state) => {
  // Generate section
  const section = await llm.invoke([
    {
      role: "system",
      content: "Write a report section following the provided name and description. Include no preamble for each section. Use markdown formatting.",
    },
    {
      role: "user",
      content: `Here is the section name: ${state.section.name} and description: ${state.section.description}`,
    },
  ]);

  // Write the updated section to completed sections
  return { completedSections: [section.content] };
};

const synthesizer: GraphNode<typeof State> = async (state) => {
  // List of completed sections
  const completedSections = state.completedSections;

  // Format completed section to str to use as context for final sections
  const completedReportSections = completedSections.join("\n\n---\n\n");

  return { finalReport: completedReportSections };
};

// Conditional edge function to create llm_call workers that each write a section of the report
const assignWorkers: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "llmCall" }> = (state) => {
  // Kick off section writing in parallel via Send() API
  return state.sections.map((section) =>
    new Send("llmCall", { section })
  );
};

// Build workflow
const orchestratorWorker = new StateGraph(State)
  .addNode("orchestrator", orchestrator)
  .addNode("llmCall", llmCall)
  .addNode("synthesizer", synthesizer)
  .addEdge("__start__", "orchestrator")
  .addConditionalEdges(
    "orchestrator",
    assignWorkers,
    ["llmCall"]
  )
  .addEdge("llmCall", "synthesizer")
  .addEdge("synthesizer", "__end__")
  .compile();

// Invoke
const state = await orchestratorWorker.invoke({
  topic: "Create a report on LLM scaling laws"
});
console.log(state.finalReport);
```

## 评估器-优化器

在评估器-优化器工作流中，一次 LLM 调用创建回复，另一次 LLM 调用评估该回复。如果评估器或[人在环路](https://docs.langchain.com/oss/javascript/langgraph/interrupts.md)判断回复需要改进，就会提供反馈并重新创建回复。这个循环会持续到生成可接受的回复为止。

当任务有特定的成功标准、但需要迭代才能满足该标准时，评估器-优化器工作流常被使用。例如，在两种语言之间翻译文本时并不总能一步到位。可能需要几轮迭代，才能生成在两种语言间含义一致的译文。

![评估器-优化器](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/evaluator_optimizer.png?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=9bd0474f42b6040b14ed6968a9ab4e3c)

```typescript Graph API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, GraphNode, ConditionalEdgeRouter } from "@langchain/langgraph";
import * as z from "zod";

// Graph state
const State = new StateSchema({
  joke: z.string(),
  topic: z.string(),
  feedback: z.string(),
  funnyOrNot: z.string(),
});

// Schema for structured output to use in evaluation
const feedbackSchema = z.object({
  grade: z.enum(["funny", "not funny"]).describe(
    "Decide if the joke is funny or not."
  ),
  feedback: z.string().describe(
    "If the joke is not funny, provide feedback on how to improve it."
  ),
});

// Augment the LLM with schema for structured output
const evaluator = llm.withStructuredOutput(feedbackSchema);

// Nodes
const llmCallGenerator: GraphNode<typeof State> = async (state) => {
  // LLM generates a joke
  let msg;
  if (state.feedback) {
    msg = await llm.invoke(
      `Write a joke about ${state.topic} but take into account the feedback: ${state.feedback}`
    );
  } else {
    msg = await llm.invoke(`Write a joke about ${state.topic}`);
  }
  return { joke: msg.content };
};

const llmCallEvaluator: GraphNode<typeof State> = async (state) => {
  // LLM evaluates the joke
  const grade = await evaluator.invoke(`Grade the joke ${state.joke}`);
  return { funnyOrNot: grade.grade, feedback: grade.feedback };
};

// Conditional edge function to route back to joke generator or end based upon feedback from the evaluator
const routeJoke: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "llmCallGenerator" }> = (state) => {
  // Route back to joke generator or end based upon feedback from the evaluator
  if (state.funnyOrNot === "funny") {
    return "Accepted";
  } else {
    return "Rejected + Feedback";
  }
};

// Build workflow
const optimizerWorkflow = new StateGraph(State)
  .addNode("llmCallGenerator", llmCallGenerator)
  .addNode("llmCallEvaluator", llmCallEvaluator)
  .addEdge("__start__", "llmCallGenerator")
  .addEdge("llmCallGenerator", "llmCallEvaluator")
  .addConditionalEdges(
    "llmCallEvaluator",
    routeJoke,
    {
      // Name returned by routeJoke : Name of next node to visit
      "Accepted": "__end__",
      "Rejected + Feedback": "llmCallGenerator",
    }
  )
  .compile();

// Invoke
const state = await optimizerWorkflow.invoke({ topic: "Cats" });
console.log(state.joke);
```

```typescript Functional API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { task, entrypoint } from "@langchain/langgraph";

// Schema for structured output to use in evaluation
const feedbackSchema = z.object({
  grade: z.enum(["funny", "not funny"]).describe(
    "Decide if the joke is funny or not."
  ),
  feedback: z.string().describe(
    "If the joke is not funny, provide feedback on how to improve it."
  ),
});

// Augment the LLM with schema for structured output
const evaluator = llm.withStructuredOutput(feedbackSchema);

// Tasks
const llmCallGenerator = task("jokeGenerator", async (params: {
  topic: string;
  feedback?: z.infer<typeof feedbackSchema>;
}) => {
  // LLM generates a joke
  const msg = params.feedback
    ? await llm.invoke(
        `Write a joke about ${params.topic} but take into account the feedback: ${params.feedback.feedback}`
      )
    : await llm.invoke(`Write a joke about ${params.topic}`);
  return msg.content;
});

const llmCallEvaluator = task("jokeEvaluator", async (joke: string) => {
  // LLM evaluates the joke
  return evaluator.invoke(`Grade the joke ${joke}`);
});

// Build workflow
const workflow = entrypoint(
  "optimizerWorkflow",
  async (topic: string) => {
    let feedback: z.infer<typeof feedbackSchema> | undefined;
    let joke: string;

    while (true) {
      joke = await llmCallGenerator({ topic, feedback });
      feedback = await llmCallEvaluator(joke);

      if (feedback.grade === "funny") {
        break;
      }
    }

    return joke;
  }
);

// Invoke
const stream = await workflow.streamEvents("Cats", { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
  console.log("\n");
}
```

## 智能体

智能体通常实现为使用[工具](https://docs.langchain.com/oss/javascript/langchain/tools.md)执行动作的 LLM。它们持续运行在反馈循环中，适用于问题和解决方案都不可预测的场景。智能体比工作流拥有更多自主性，可以就使用哪些工具以及如何解决问题做出决策。你仍然可以定义可用的工具集合，以及关于智能体行为方式的指导原则。

![智能体](https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/agent.png?fit=max\&auto=format\&n=-_xGPoyjhyiDWTPJ\&q=85\&s=bd8da41dbf8b5e6fc9ea6bb10cb63e38)

> [!NOTE]
>
> 想开始使用智能体，请参阅[快速入门](https://docs.langchain.com/oss/javascript/langchain/quickstart.md)，或在 LangChain 中进一步了解[它们如何工作](https://docs.langchain.com/oss/javascript/langchain/agents.md)。

```typescript Using tools theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "@langchain/core/tools";
import * as z from "zod";

// Define tools
const multiply = tool(
  ({ a, b }) => {
    return a * b;
  },
  {
    name: "multiply",
    description: "Multiply two numbers together",
    schema: z.object({
      a: z.number().describe("first number"),
      b: z.number().describe("second number"),
    }),
  }
);

const add = tool(
  ({ a, b }) => {
    return a + b;
  },
  {
    name: "add",
    description: "Add two numbers together",
    schema: z.object({
      a: z.number().describe("first number"),
      b: z.number().describe("second number"),
    }),
  }
);

const divide = tool(
  ({ a, b }) => {
    return a / b;
  },
  {
    name: "divide",
    description: "Divide two numbers",
    schema: z.object({
      a: z.number().describe("first number"),
      b: z.number().describe("second number"),
    }),
  }
);

// Augment the LLM with tools
const tools = [add, multiply, divide];
const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);
```

```typescript Graph API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateGraph, StateSchema, MessagesValue, GraphNode, ConditionalEdgeRouter } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";

// Graph state
const State = new StateSchema({
  messages: MessagesValue,
});

// Nodes
const llmCall: GraphNode<typeof State> = async (state) => {
  // LLM decides whether to call a tool or not
  const result = await llmWithTools.invoke([
    {
      role: "system",
      content: "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
    },
    ...state.messages
  ]);

  return {
    messages: [result]
  };
};

const toolNode = new ToolNode(tools);

// Conditional edge function to route to the tool node or end
const shouldContinue: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "toolNode" }> = (state) => {
  const messages = state.messages;
  const lastMessage = messages.at(-1);

  // If the LLM makes a tool call, then perform an action
  if (lastMessage?.tool_calls?.length) {
    return "toolNode";
  }
  // Otherwise, we stop (reply to the user)
  return "__end__";
};

// Build workflow
const agentBuilder = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  // Add edges to connect nodes
  .addEdge("__start__", "llmCall")
  .addConditionalEdges(
    "llmCall",
    shouldContinue,
    ["toolNode", "__end__"]
  )
  .addEdge("toolNode", "llmCall")
  .compile();

// Invoke
const messages = [{
  role: "user",
  content: "Add 3 and 4."
}];
const result = await agentBuilder.invoke({ messages });
console.log(result.messages);
```

```typescript Functional API theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task, entrypoint, addMessages } from "@langchain/langgraph";
import { BaseMessageLike, ToolCall } from "@langchain/core/messages";

const callLlm = task("llmCall", async (messages: BaseMessageLike[]) => {
  // LLM decides whether to call a tool or not
  return llmWithTools.invoke([
    {
      role: "system",
      content: "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
    },
    ...messages
  ]);
});

const callTool = task("toolCall", async (toolCall: ToolCall) => {
  // Performs the tool call
  const tool = toolsByName[toolCall.name];
  return tool.invoke(toolCall.args);
});

const agent = entrypoint(
  "agent",
  async (messages) => {
    let llmResponse = await callLlm(messages);

    while (true) {
      if (!llmResponse.tool_calls?.length) {
        break;
      }

      // Execute tools
      const toolResults = await Promise.all(
        llmResponse.tool_calls.map((toolCall) => callTool(toolCall))
      );

      messages = addMessages(messages, [llmResponse, ...toolResults]);
      llmResponse = await callLlm(messages);
    }

    messages = addMessages(messages, [llmResponse]);
    return messages;
  }
);

// Invoke
const messages = [{
  role: "user",
  content: "Add 3 and 4."
}];

const stream = await agent.streamEvents([messages], { version: "v3" });
for await (const snapshot of stream.values) {
  console.log(snapshot);
}
```

### ToolNode

[`ToolNode`](https://reference.langchain.com/javascript/langchain-langgraph/prebuilt/ToolNode) 是一个预构建节点，用于在 LangGraph 工作流中执行工具。它会自动处理并行工具执行、错误处理和状态注入。

当你需要对图如何执行工具进行细粒度控制时，请使用 [`ToolNode`](https://reference.langchain.com/javascript/langchain-langgraph/prebuilt/ToolNode)。它是为许多 LangGraph 智能体模式提供工具执行能力的基础构件。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import * as z from "zod";

const search = tool(
  ({ query }) => `Results for: ${query}`,
  {
    name: "search",
    description: "Search for information.",
    schema: z.object({ query: z.string() }),
  }
);

const calculator = tool(
  ({ expression }) => String(eval(expression)),
  {
    name: "calculator",
    description: "Evaluate a math expression.",
    schema: z.object({ expression: z.string() }),
  }
);

const toolNode = new ToolNode([search, calculator]);
```

#### 从工具中访问图状态与上下文

由 `ToolNode` 执行的工具，其第一个参数是模型生成的参数。若要读取并非由模型生成的、属于图一侧的数据，请使用以下选项之一：

* 在 Python 中，从注入的 [`ToolRuntime`](https://reference.langchain.com/javascript/langchain/index/Runtime) 参数读取状态和运行作用域内的上下文。
* 在 JavaScript 中，从工具的第二个参数读取状态和运行作用域内的上下文，其类型为 [`ToolRuntime`](https://reference.langchain.com/javascript/langchain/index/Runtime)。

> [!NOTE]
>
> 工具只能访问传给 `ToolNode` 的状态值。当 `ToolNode` 被直接作为 `StateGraph` 的节点添加时，该输入就是当前的图状态。如果你从另一个节点手动调用 `ToolNode`，那么当工具需要自定义状态字段时，请传入完整状态。例如，`tool_node.invoke(state)` 或 `toolNode.invoke(state, config)` 会暴露完整状态，而只传入 `{"messages": state["messages"]}` 或 `{ messages: state.messages }` 则只暴露 `messages`。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { AIMessage } from "@langchain/core/messages";
import { tool, type ToolRuntime } from "@langchain/core/tools";
import {
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import * as z from "zod";

const State = new StateSchema({
  messages: MessagesValue,
  userId: z.string(),
});

const ContextSchema = z.object({
  organizationId: z.string(),
});

const getUserInfo = tool(
  async (
    _input,
    runtime: ToolRuntime<typeof State.Type, typeof ContextSchema>,
  ) => {
    // Read the current graph state passed to the ToolNode.
    const userIdFromState = runtime.state?.userId;
    const userIdFromTaskInput = (
      runtime.configurable as {
        __pregel_scratchpad?: { currentTaskInput?: { userId?: string } };
      }
    ).__pregel_scratchpad?.currentTaskInput?.userId;
    const userId = userIdFromState ?? userIdFromTaskInput;
    if (!userId) {
      throw new Error("Missing userId in ToolRuntime state.");
    }

    // Use runtime context for explicit per-run values that are not part
    // of graph state.
    const organizationId = runtime.context.organizationId;

    return `User ${userId} in organization ${organizationId}`;
  },
  {
    name: "get_user_info",
    description: "Look up user information.",
    schema: z.object({}),
  },
);

const graph = new StateGraph(State, ContextSchema)
  .addNode("tools", new ToolNode([getUserInfo]))
  .addEdge(START, "tools")
  .compile();

const result = await graph.invoke(
  {
    messages: [
      new AIMessage({
        content: "",
        tool_calls: [{ name: "get_user_info", args: {}, id: "call_user_info" }],
      }),
    ],
    userId: "user_123",
  },
  { context: { organizationId: "org_456" } },
);
```

> **[查看示例追踪](https://smith.langchain.com/public/f9a855a9-4897-4c50-ab4f-8c7db93b1894/r)**
>
> 打开本示例对应的公开 LangSmith 运行记录。

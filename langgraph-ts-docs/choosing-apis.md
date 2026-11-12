> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/choosing-apis.md

# 如何选择 Graph API 与 Functional API

LangGraph 提供两种构建智能体工作流的 API：**Graph API** 与 **Functional API**。两者共享同一套底层运行时，可以在同一个应用中混用，但它们面向不同的使用场景与开发偏好。

本指南帮助你根据具体需求判断何时使用哪一种 API。

## 快速决策指南

当你需要以下能力时，使用 **Graph API**：

* **复杂工作流的可视化**，便于调试与编写文档
* **显式状态管理**，在多个节点之间共享数据
* **带多个决策点的条件分支**
* **需要后续汇合的并行执行路径**
* **团队协作**，可视化表示有助于理解

当你希望获得以下效果时，使用 **Functional API**：

* 对既有过程式代码做**最小改动**
* **标准控制流**（if/else、循环、函数调用）
* **函数作用域状态**，无需显式状态管理
* **快速原型验证**，更少的样板代码
* **线性工作流**，只有简单的分支逻辑

## 详细对比

### 何时使用 Graph API

[Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md) 采用声明式方法：你定义节点、边和共享状态，从而形成可视化的图结构。

**1. 复杂的决策树与分支逻辑**

当工作流有多个依赖不同条件的决策点时，Graph API 让这些分支显式化、易于可视化。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import {
  StateGraph,
  StateSchema,
  MessagesValue,
  START,
  END,
  type GraphNode,
  type ConditionalEdgeRouter,
} from "@langchain/langgraph";

// Graph API: Clear visualization of decision paths
const AgentState = new StateSchema({
  messages: MessagesValue,
  currentTool: z.string(),
  retryCount: z.number().default(0),
});

const shouldContinue: ConditionalEdgeRouter<typeof AgentState> = (state) => {
  if (state.retryCount > 3) {
    return END;
  } else if (state.currentTool === "search") {
    return "processSearch";
  } else {
    return "callLlm";
  }
};

const workflow = new StateGraph(AgentState)
  .addNode("callLlm", callLlmNode)
  .addNode("processSearch", searchNode)
  .addConditionalEdges("callLlm", shouldContinue);
```

**2. 跨多个组件的状态管理**

当你需要在工作流的不同部分之间共享并协调状态时，Graph API 的显式状态管理很有优势。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { StateSchema, type GraphNode } from "@langchain/langgraph";

// Multiple nodes can access and modify shared state
const WorkflowState = new StateSchema({
  userInput: z.string(),
  searchResults: z.array(z.string()).default([]),
  generatedResponse: z.string().optional(),
  validationStatus: z.string().optional(),
});

const searchNode: GraphNode<typeof WorkflowState> = async (state) => {
  // Access shared state
  const results = await search(state.userInput);
  return { searchResults: results };
};

const validationNode: GraphNode<typeof WorkflowState> = async (state) => {
  // Access results from previous node
  const isValid = await validate(state.generatedResponse);
  return { validationStatus: isValid ? "valid" : "invalid" };
};
```

**3. 带同步的并行处理**

当你需要并行执行多个操作再合并结果时，Graph API 可以自然地处理。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { START } from "@langchain/langgraph";

// Parallel processing of multiple data sources
workflow
  .addNode("fetchNews", fetchNews)
  .addNode("fetchWeather", fetchWeather)
  .addNode("fetchStocks", fetchStocks)
  .addNode("combineData", combineAllData)
  // All fetch operations run in parallel
  .addEdge(START, "fetchNews")
  .addEdge(START, "fetchWeather")
  .addEdge(START, "fetchStocks")
  // Combine waits for all parallel operations to complete
  .addEdge("fetchNews", "combineData")
  .addEdge("fetchWeather", "combineData")
  .addEdge("fetchStocks", "combineData");
```

**4. 团队开发与文档化**

Graph API 的可视化特性让团队更容易理解、记录和维护复杂工作流。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Clear separation of concerns - each team member can work on different nodes
workflow
  .addNode("dataIngestion", dataTeamFunction)
  .addNode("mlProcessing", mlTeamFunction)
  .addNode("businessLogic", productTeamFunction)
  .addNode("outputFormatting", frontendTeamFunction);
```

### 何时使用 Functional API

[Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md) 采用命令式方法，把 LangGraph 的特性融入标准的过程式代码。

**1. 既有过程式代码**

当你已有使用标准控制流的代码，希望以最小的重构量加入 LangGraph 特性。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task, entrypoint } from "@langchain/langgraph";

// Functional API: Minimal changes to existing code
const processUserInput = task(
  "processUserInput",
  async (userInput: string) => {
    // Existing function with minimal changes
    return { processed: userInput.toLowerCase().trim() };
  }
);

const workflow = entrypoint(
  { checkpointer },
  async (userInput: string) => {
    // Standard control flow
    const processed = await processUserInput(userInput);

    let response: string;
    if (processed.processed.includes("urgent")) {
      response = await handleUrgentRequest(processed);
    } else {
      response = await handleNormalRequest(processed);
    }

    return response;
  }
);
```

**2. 逻辑简单的线性工作流**

当工作流主要是顺序执行、条件逻辑也很直接时。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint, interrupt } from "@langchain/langgraph";

const essayWorkflow = entrypoint(
  { checkpointer },
  async (topic: string) => {
    // Linear flow with simple branching
    let outline = await createOutline(topic);

    if (outline.points.length < 3) {
      outline = await expandOutline(outline);
    }

    const draft = await writeDraft(outline);

    // Human review checkpoint
    const feedback = interrupt({ draft, action: "Please review" });

    let finalEssay: string;
    if (feedback === "approve") {
      finalEssay = draft;
    } else {
      finalEssay = await reviseEssay(draft, feedback);
    }

    return { essay: finalEssay };
  }
);
```

**3. 快速原型验证**

当你希望快速验证想法，而不想承担定义状态 schema 和图结构的开销。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { entrypoint } from "@langchain/langgraph";

const quickPrototype = entrypoint(
  { checkpointer },
  async (data: Record<string, unknown>) => {
    // Fast iteration - no state schema needed
    const step1Result = await processStep1(data);
    const step2Result = await processStep2(step1Result);

    return { finalResult: step2Result };
  }
);
```

**4. 函数作用域的状态管理**

当状态天然局限于单个函数，不需要广泛共享时。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { task, entrypoint } from "@langchain/langgraph";

const analyzeDocument = task("analyzeDocument", async (document: string) => {
  // Local state management within function
  const sections = extractSections(document);
  const summaries = await Promise.all(sections.map(summarize));
  const keyPoints = extractKeyPoints(summaries);

  return {
    sections: sections.length,
    summaries,
    keyPoints,
  };
});

const documentProcessor = entrypoint(
  { checkpointer },
  async (document: string) => {
    const analysis = await analyzeDocument(document);
    // State is passed between functions as needed
    return await generateReport(analysis);
  }
);
```

## 组合使用两种 API

你可以在同一个应用中同时使用两种 API。当系统不同部分有不同需求时，这很有用。

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import {
  StateGraph,
  StateSchema,
  entrypoint,
  type GraphNode,
} from "@langchain/langgraph";

// Define state for complex multi-agent coordination
const CoordinationState = new StateSchema({
  rawData: z.record(z.string(), z.unknown()),
  processedData: z.record(z.string(), z.unknown()).optional(),
});

// Simple data processing using Functional API
const dataProcessor = entrypoint({}, async (rawData: Record<string, unknown>) => {
  const cleaned = await cleanData(rawData);
  const transformed = await transformData(cleaned);
  return transformed;
});

// Use the functional API result in the graph
const orchestratorNode: GraphNode<typeof CoordinationState> = async (state) => {
  const processedData = await dataProcessor.invoke(state.rawData);
  return { processedData };
};

// Complex multi-agent coordination using Graph API
const coordinationGraph = new StateGraph(CoordinationState)
  .addNode("orchestrator", orchestratorNode)
  .addNode("agentA", agentANode)
  .addNode("agentB", agentBNode);
```

## 在两种 API 之间迁移

### 从 Functional API 迁移到 Graph API

当函数式工作流变得复杂时，可以迁移到 Graph API：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import * as z from "zod";
import { entrypoint } from "@langchain/langgraph";

// Before: Functional API
const complexWorkflow = entrypoint(
  { checkpointer },
  async (inputData: Record<string, unknown>) => {
    const step1 = await processStep1(inputData);

    let result: unknown;
    if (step1.needsAnalysis) {
      const analysis = await analyzeData(step1);
      if (analysis.confidence > 0.8) {
        result = await highConfidencePath(analysis);
      } else {
        result = await lowConfidencePath(analysis);
      }
    } else {
      result = await simplePath(step1);
    }

    return result;
  }
);

// After: Graph API
import {
  StateGraph,
  StateSchema,
  type GraphNode,
  type ConditionalEdgeRouter,
} from "@langchain/langgraph";

const WorkflowState = new StateSchema({
  inputData: z.record(z.string(), z.unknown()),
  step1Result: z.record(z.string(), z.unknown()).optional(),
  analysis: z.record(z.string(), z.unknown()).optional(),
  finalResult: z.unknown().optional(),
});

const shouldAnalyze: ConditionalEdgeRouter<typeof WorkflowState> = (state) => {
  return state.step1Result?.needsAnalysis ? "analyze" : "simplePath";
};

const confidenceCheck: ConditionalEdgeRouter<typeof WorkflowState> = (state) => {
  return (state.analysis?.confidence as number) > 0.8
    ? "highConfidence"
    : "lowConfidence";
};

const workflow = new StateGraph(WorkflowState)
  .addNode("step1", processStep1Node)
  .addConditionalEdges("step1", shouldAnalyze)
  .addNode("analyze", analyzeDataNode)
  .addConditionalEdges("analyze", confidenceCheck);
// ... add remaining nodes and edges
```

### 从 Graph API 迁移到 Functional API

当你的图对于简单的线性流程来说过于复杂时：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { z } from "zod/v4";
import { StateGraph, StateSchema, entrypoint } from "@langchain/langgraph";

// Before: Over-engineered Graph API
const SimpleState = new StateSchema({
  input: z.string(),
  step1: z.string().optional(),
  step2: z.string().optional(),
  result: z.string().optional(),
});

// After: Simplified Functional API
const simpleWorkflow = entrypoint(
  { checkpointer },
  async (inputData: string) => {
    const step1 = await processStep1(inputData);
    const step2 = await processStep2(step1);
    return await finalizeResult(step2);
  }
);
```

## 总结

当你需要对工作流结构进行显式控制、复杂分支、并行处理，或看重团队协作收益时，选择 **Graph API**。

当你希望以最小改动为既有代码加入 LangGraph 特性、工作流是简单线性的，或需要快速原型验证能力时，选择 **Functional API**。

两种 API 提供相同的核心 LangGraph 能力（持久化、流式传输、human-in-the-loop、记忆），只是以不同范式封装，以适配不同的开发风格与使用场景。

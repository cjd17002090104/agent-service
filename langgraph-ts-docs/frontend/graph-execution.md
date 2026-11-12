> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/frontend/graph-execution.md

# 图执行

> 用逐节点状态与流式内容可视化多步图流水线

LangGraph 智能体不是黑盒。每个图都由**具名节点**组成，这些节点按顺序或并行执行：分类、检索、分析、综合。图执行卡片让这条流水线可见：为每个节点渲染一张卡片、显示其状态、实时流式输出内容，并跟踪整个工作流的完成情况。用户能清楚看到智能体在做什么、当前处于哪一步，以及每一步产出了什么。

这个模式对生产环境的智能体尤其有用，因为它把图结构转化为产品体验。你不必再把整次运行当作一条助手回复，而可以暴露出 LangGraph 内部使用的同一批检查点、节点名、状态键和流式元数据。

## 图节点如何映射到 UI 卡片

LangGraph 图定义了一系列节点，每个节点负责特定任务。例如，一个研究流水线可能有：

1. **分类（Classify）**：对用户提问进行归类
2. **检索（Research）**：收集相关信息
3. **分析（Analyze）**：从检索结果中得出结论
4. **综合（Synthesize）**：产出最终润色后的回答

每个节点把输出写入图状态中的特定键。在前端，你无需硬编码这种映射——[`useStream`](https://reference.langchain.com/javascript/langchain-react/index/useStream) 会在运行时通过 `stream.subgraphs` 发现每个节点，并为每个被观察到的步骤暴露一个 [`SubgraphDiscoverySnapshot`](https://reference.langchain.com/javascript/langchain-react/SubgraphDiscoverySnapshot)：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// Nodes are discovered automatically — no hardcoded list needed
const graphNodes = [...stream.subgraphs.values()];

// Each snapshot carries the node name and current status
graphNodes.forEach((node) => {
  console.log(node.nodeName, node.status); // "classify", "running"
});
```

用 `node.nodeName` 作为进度条和卡片标题的标签。把每个快照传给 `useMessages(stream, node)`，即可渲染节点范围内的流式内容，而无需让 UI 与图状态键名耦合。

这种映射成为图与 UI 之间的约定。后端作者可以有意识地增加、重命名或重排节点，而前端作者决定每个状态键如何可视化：状态徽标、Markdown 面板、表格、图表、轨迹视图或审批卡片。

## 配置 `useStream`

像往常一样接好 [`useStream`](https://reference.langchain.com/javascript/langchain-react/index/useStream)。你会用到的关键属性是 `messages`（对话内容）和 `subgraphs`（本次运行中发现的图节点）。把每个发现的子图快照传给选择器，即可读取该节点范围内的消息。

> [!NOTE]
>
> 代码示例使用 `useStream<typeof myAgent>` 获得类型安全的流状态。类型推断参见 [Python](https://docs.langchain.com/oss/python/langchain/frontend/overview.md#type-inference) 或 [JavaScript](https://docs.langchain.com/oss/javascript/langchain/frontend/overview.md#type-inference) 后端。

```tsx React theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useStream } from "@langchain/react";

const AGENT_URL = "http://localhost:2024";

export function PipelineChat() {
  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "graph_execution_cards",
  });
  const graphNodes = [...stream.subgraphs.values()];

  return (
    <div>
      <PipelineProgress nodes={graphNodes} isLoading={stream.isLoading} />
      <NodeCardList nodes={graphNodes} stream={stream} isLoading={stream.isLoading} />
    </div>
  );
}
```

```vue Vue theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
<script setup lang="ts">
import { useStream } from "@langchain/vue";

const AGENT_URL = "http://localhost:2024";

const stream = useStream<typeof myAgent>({
  apiUrl: AGENT_URL,
  assistantId: "graph_execution_cards",
});
</script>

<template>
  <div>
    <PipelineProgress
      :nodes="[...stream.subgraphs.value.values()]"
      :is-loading="stream.isLoading.value"
    />
    <NodeCardList
      :nodes="[...stream.subgraphs.value.values()]"
      :stream="stream"
      :is-loading="stream.isLoading.value"
    />
  </div>
</template>
```

```svelte Svelte theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
<script lang="ts">
  import { useStream } from "@langchain/svelte";

  const AGENT_URL = "http://localhost:2024";

  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "graph_execution_cards",
  });
</script>

<div>
  <PipelineProgress nodes={[...stream.subgraphs.values()]} isLoading={stream.isLoading} />
  <NodeCardList
    nodes={[...stream.subgraphs.values()]}
    {stream}
    isLoading={stream.isLoading}
  />
</div>
```

```ts Angular theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Component, computed } from "@angular/core";
import { injectStream } from "@langchain/angular";

const AGENT_URL = "http://localhost:2024";

@Component({
  selector: "app-pipeline-chat",
  template: `
    <div>
      <app-pipeline-progress
        [nodes]="graphNodes()"
        [isLoading]="stream.isLoading()"
      />
      <app-node-card-list
        [nodes]="graphNodes()"
        [stream]="stream"
        [isLoading]="stream.isLoading()"
      />
    </div>
  `,
})
export class PipelineChatComponent {
  stream = injectStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "graph_execution_cards",
  });

  graphNodes = computed(() => [...this.stream.subgraphs().values()]);
}
```

## 把流式 token 路由到节点

随着图的流式输出，每个被发现的子图快照都会标明它所属的节点。把该快照传给选择器 hook 或 composable，即可读取该节点范围内的消息：

```tsx theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { AIMessage } from "langchain";
import { useMessages, type AnyStream, type SubgraphDiscoverySnapshot } from "@langchain/react";

function NodeCard({
  node,
  stream,
}: {
  node: SubgraphDiscoverySnapshot;
  stream: AnyStream;
}) {
  const messages = useMessages(stream, node);
  const lastAIMessage = messages.find(AIMessage.isInstance);
  const streamingContent = lastAIMessage?.text ?? "";

  return <NodeCardBody node={node} content={streamingContent} />;
}
```

第一个挂载的选择器会为该节点命名空间打开一个作用域订阅。当节点卡片卸载时，订阅会自动释放。

## 判断节点状态

每个被发现的节点都带有当前状态。直接使用 `node.status` 即可；发现快照会报告 `"pending"`、`"running"`、`"complete"` 或 `"error"`：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
type NodeStatus = SubgraphDiscoverySnapshot["status"];

const status: NodeStatus = node.status;
```

## 构建流水线进度条

顶部的横向进度条让用户对整个流水线一览无余。每个步骤是一个带标签的段，节点完成时相应区段被填充：

```tsx theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
function PipelineProgress({
  nodes,
  isLoading,
}: {
  nodes: SubgraphDiscoverySnapshot[];
  isLoading: boolean;
}) {
  const firstIncompleteIdx = nodes.findIndex((node) => node.status !== "complete");

  return (
    <div className="flex items-center gap-1">
      {nodes.map((node, i) => {
        const isRunning =
          isLoading && node.status !== "complete" && firstIncompleteIdx === i;
        const colors = {
          pending: "bg-gray-200 text-gray-500",
          running: "bg-blue-400 text-white animate-pulse",
          complete: "bg-green-500 text-white",
          error: "bg-red-500 text-white",
        };
        const status = isRunning ? "running" : node.status;

        return (
          <div key={node.id} className="flex items-center">
            <div
              className={`rounded-full px-3 py-1 text-xs font-medium ${colors[status]}`}
            >
              {node.nodeName}
            </div>
            {i < nodes.length - 1 && (
              <div
                className={`mx-1 h-0.5 w-6 ${
                  status === "complete" ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

## 构建可折叠的 NodeCard 组件

每个节点都有自己的一张卡片，显示状态徽标、内容（流式或最终），以及用于长输出的可折叠主体：

```tsx theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
function NodeCard({
  node,
  stream,
}: {
  node: SubgraphDiscoverySnapshot;
  stream: AnyStream;
}) {
  const [open, setOpen] = useState(node.status === "running");
  const messages = useMessages(stream, node);
  const lastAIMessage = messages.find(AIMessage.isInstance);

  useEffect(() => {
    if (node.status === "running") setOpen(true);
    if (node.status === "complete") setOpen(false);
  }, [node.status]);

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{node.nodeName}</h3>
          <StatusBadge status={node.status} />
        </div>
        <span className={open ? "rotate-90" : ""}>▶</span>
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          <div className="prose prose-sm max-w-none">
            {lastAIMessage?.text?.trim()
              ? <Markdown>{lastAIMessage.text}</Markdown>
              : <p className="italic text-gray-500">Processing...</p>}
          </div>
        </div>
      )}
    </div>
  );
}
```

## 流式内容与已完成内容

节点卡片会读取作用域消息，既用于流式内容也用于最终内容。这样可以避免假设图节点名与其写入的状态键一致（例如 playground 图中 `do_research` 写入的是 `research`）：

| 来源 | 使用场景 |
| - | - |
| `useMessages(stream, node)` | 渲染节点范围内的流式消息与最终消息 |
| `stream.values` | 使用真实状态键读取整图状态，例如最终的 `synthesis` 字段 |

模式是：在节点卡片中展示最近的、该节点作用域内的 AI 消息；只有在你确实需要图状态字段时才用 `stream.values`。

由于作用域消息绑定到产生它的节点，UI 可以支持并行的图路径，而无需根据消息顺序猜测。每张卡片都根据属于其节点的流事件更新，已完成的值仍可通过 `stream.values` 获取。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
function NodeContent({ stream, node }: { stream: AnyStream; node: SubgraphDiscoverySnapshot }) {
  const messages = useMessages(stream, node);
  const content = messages.find(AIMessage.isInstance)?.text ?? "";

  return <Markdown>{content}</Markdown>;
}
```

> [!TIP]
>
> 流式内容可能包含不完整的 token 或尚未成形的 Markdown。如果你要渲染 Markdown，请确保渲染器能优雅处理不完整语法（例如未闭合的粗体标记 `**`）。

## 组合起来

下面是结合了路由、状态检测与卡片渲染的完整卡片列表：

```tsx theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
function NodeCardList({
  nodes,
  stream,
  isLoading,
}: {
  nodes: SubgraphDiscoverySnapshot[];
  stream: AnyStream;
  isLoading: boolean;
}) {
  const firstIncompleteIdx = nodes.findIndex((node) => node.status !== "complete");

  return (
    <div className="space-y-3">
      {nodes.map((node, i) => {
        const isComplete = node.status === "complete";
        const isRunning = isLoading && !isComplete && firstIncompleteIdx === i;
        if (!isComplete && !isRunning) return null;

        return <NodeCard key={node.id} node={node} stream={stream} />;
      })}
    </div>
  );
}
```

## 使用场景

只要多步流水线需要可见性，图执行卡片都适用：

* **研究流水线**：分类 → 收集来源 → 分析 → 综合成报告
* **内容生成**：大纲 → 起草 → 事实核查 → 编辑 → 发布
* **数据处理**：摄取 → 校验 → 转换 → 聚合 → 导出
* **代码生成**：理解需求 → 规划架构 → 编写代码 → 审查 → 测试
* **决策流程**：收集上下文 → 评估选项 → 给备选方案打分 → 给出建议

## 处理动态流水线

并非所有图都有固定的节点集合。有些流水线会根据输入增加或跳过节点。发现映射只包含当前线程中被观察到的节点：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const activeNodes = [...stream.subgraphs.values()];
```

这能确保 UI 只展示与本次执行相关的节点卡片，避免出现空的占位卡片。

> [!NOTE]
>
> 如果你的图有条件分支（例如对简单事实性问题跳过“检索”），被跳过的节点不会出现在 `stream.subgraphs` 中。你的进度条可以只渲染已发现的节点，或者把预期但无快照的节点置灰显示。

## 最佳实践

* **从流中发现节点**。用 `stream.subgraphs` 渲染卡片，而不是硬编码预期节点；条件分支或被跳过的步骤在运行前不会出现。
* **把状态键当作 UI 约定**。决定哪些图输出稳定到足以让前端渲染，并把这些键记录在图定义旁边。
* **节点卡片使用作用域消息**。它们在节点流式过程中和完成后都可用，且不让 UI 卡片与状态键名耦合。
* **自动折叠已完成节点**。在长流水线中，自动折叠已完成的卡片，让用户专注当前活跃步骤。
* **显示预计耗时**。如果你有各节点耗时的历史数据，展示时间估计以管理用户预期。
* **增加全局进度指示**。在流水线视图顶部用整体进度条（如“第 2 步，共 4 步”）配合逐节点卡片。
* **按节点处理错误**。某个节点失败时，只在其卡片中显示错误，而不是折叠整条流水线；其他节点仍可能成功完成。

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/frontend/custom-stream-channels.md

# 自定义流通道

> 把自定义的服务端数据流式发送到前端，并用 useExtension 与 useChannel 读取

LangGraph 智能体流式传输的不只是消息和工具调用。服务端的**流转换器（stream transformer）**可以在协议流向客户端的过程中检查或改写它，并把自己的结构化数据发布到具名的**自定义通道**上。前端用两个选择器读取该通道：[`useExtension`](https://reference.langchain.com/javascript/langchain-react/useExtension) 获取最新载荷，[`useChannel`](https://reference.langchain.com/javascript/langchain-react/useChannel) 则作为原始事件的应急出口。

下面的示例是一个客服智能体：它的转换器在每个事件到达浏览器之前脱敏 PII（邮箱、电话号码、SSN、卡号、IP），并把累计脱敏次数发布到 `redaction-stats` 通道。侧面板实时渲染这些计数。

## 自定义通道的工作原理

自定义通道有两端。在服务端，[`StreamTransformer`](https://reference.langchain.com/javascript/langchain-langgraph/index/StreamTransformer) 打开一个具名的 [`StreamChannel`](https://reference.langchain.com/javascript/langchain-langgraph/index/StreamChannel) 并往其中推送载荷。在客户端，选择器订阅对应的 `custom:<name>` 通道，并把载荷作为响应式状态暴露出来。

转换器的 `process` 方法会对每个协议事件执行。它可以就地修改事件（这里的做法是从 `messages`、`tools` 和 `values` 数据中擦除 PII），并在有内容需要报告时推送旁路更新。

客户端选择器（`useExtension`、`useChannel`）随 v1 前端 SDK 包提供（`@langchain/react`、`@langchain/vue`、`@langchain/svelte`、`@langchain/angular`）。

> [!NOTE]
>
> 流转换器与 `StreamChannel` 需要 `@langchain/langgraph>=1.3.1`。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StreamChannel } from "@langchain/langgraph";
import type { ProtocolEvent, StreamTransformer } from "@langchain/langgraph";

export const createRedactionStatsTransformer = (): StreamTransformer<{
  redactionStats: StreamChannel<RedactionStatsEvent>;
}> => {
  // Open a remote channel named "redaction-stats".
  const redactionStats = StreamChannel.remote<RedactionStatsEvent>("redaction-stats");
  const counts = emptyCounts();

  return {
    init: () => ({ redactionStats }),

    process(event: ProtocolEvent): boolean {
      // Redact event.params.data in place and tally what was found.
      const delta = redactInPlace(event, counts);
      if (Object.keys(delta).length > 0) {
        // Publish a payload on the channel.
        redactionStats.push({
          kind: "update",
          at: Date.now(),
          delta,
          counts: { ...counts },
          total: totalRedactions(counts),
        });
      }
      return true; // Keep the (now-redacted) event in the stream.
    },
  };
};
```

在构建智能体时挂上该转换器：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { createAgent } from "langchain";

const agent = createAgent({
  model: "anthropic:claude-haiku-4-5",
  tools: [...],
  streamTransformers: [createRedactionStatsTransformer],
});
```

载荷类型就是转换器推送的内容。下面的客户端示例读取这种形状：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
type PiiType = "email" | "phone" | "ssn" | "credit_card" | "ip_address";

type RedactionStatsEvent = {
  kind: "update";
  at: number;
  delta: Partial<Record<PiiType, number>>;
  counts: Record<PiiType, number>;
  total: number;
};
```

## 配置 `useStream`

像往常一样接好 [`useStream`](https://reference.langchain.com/javascript/langchain-react/index/useStream)。自定义通道选择器接收这里返回的同一个 `stream` 句柄。

> [!NOTE]
>
> 代码示例使用 `useStream<typeof myAgent>` 获得类型安全的流状态。类型推断参见 [Python](https://docs.langchain.com/oss/python/langchain/frontend/overview.md#type-inference) 或 [JavaScript](https://docs.langchain.com/oss/javascript/langchain/frontend/overview.md#type-inference) 后端。

```tsx React theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useStream } from "@langchain/react";

const AGENT_URL = "http://localhost:2024";

export function RedactionChat() {
  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "custom_stream_channel",
  });

  return <RedactionStatsPanel stream={stream} />;
}
```

```vue Vue theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
<script setup lang="ts">
import { useStream } from "@langchain/vue";

const AGENT_URL = "http://localhost:2024";

const stream = useStream<typeof myAgent>({
  apiUrl: AGENT_URL,
  assistantId: "custom_stream_channel",
});
</script>

<template>
  <RedactionStatsPanel :stream="stream" />
</template>
```

```svelte Svelte theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
<script lang="ts">
  import { useStream } from "@langchain/svelte";

  const AGENT_URL = "http://localhost:2024";

  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "custom_stream_channel",
  });
</script>

<RedactionStatsPanel {stream} />
```

```ts Angular theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { Component } from "@angular/core";
import { injectStream } from "@langchain/angular";

const AGENT_URL = "http://localhost:2024";

@Component({
  selector: "app-redaction-chat",
  template: `<app-redaction-stats-panel [stream]="stream" />`,
})
export class RedactionChatComponent {
  stream = injectStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "custom_stream_channel",
  });
}
```

## 用 `useExtension` 读取最新载荷

`useExtension` 订阅 `custom:<name>` 通道，返回转换器最近推送的载荷——已经解包并带类型。当 UI 只需要当前值时，这是最顺手的选择，例如实时计数器、进度百分比或状态徽标。

传入不带前缀的通道名（`"redaction-stats"`），而不是 `custom:` 前缀：

```tsx React theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useExtension } from "@langchain/react";

const latest = useExtension<RedactionStatsEvent>(stream, "redaction-stats");
// latest?.total, latest?.counts.email, latest?.delta
```

```vue Vue theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useExtension } from "@langchain/vue";

const latest = useExtension<RedactionStatsEvent>(stream, "redaction-stats");
// latest.value?.total
```

```svelte Svelte theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useExtension } from "@langchain/svelte";

const latest = useExtension<RedactionStatsEvent>(stream, "redaction-stats");
// latest?.total
```

```ts Angular theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { injectExtension } from "@langchain/angular";

const latest = injectExtension<RedactionStatsEvent>(stream, "redaction-stats");
// latest()?.total
```

返回值遵循各框架的响应式模型：React 和 Svelte 中是普通值，Vue 中是 `Ref`（`latest.value`），Angular 中是 signal（`latest()`）。在首个载荷到达之前，值为 `undefined`。

可选的第三个 `target` 参数把订阅限定到某个命名空间，就像 `useMessages(stream, node)` 把消息限定到某个已发现的图节点一样。命名空间目标的用法参见[图执行](https://docs.langchain.com/oss/javascript/langgraph/frontend/graph-execution.md)。

## 用 `useChannel` 缓冲原始事件

`useChannel` 是原始事件的应急出口。它订阅一个或多个通道，返回底层协议事件的有界缓冲区，而不是单个解包后的值。当你需要历史而非最新值（例如事件日志或审计轨迹），或需要没有更高层选择器覆盖的通道时，就用它。

传入完整通道 id（`"custom:redaction-stats"`）：

```tsx React theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useChannel } from "@langchain/react";

const rawEvents = useChannel(stream, ["custom:redaction-stats"]);
```

```vue Vue theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useChannel } from "@langchain/vue";

const rawEvents = useChannel(stream, ["custom:redaction-stats"]);
// rawEvents.value
```

```svelte Svelte theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useChannel } from "@langchain/svelte";

const rawEvents = useChannel(stream, ["custom:redaction-stats"]);
```

```ts Angular theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { injectChannel } from "@langchain/angular";

const rawEvents = injectChannel(stream, ["custom:redaction-stats"]);
// rawEvents()
```

每个条目都是原始协议事件，因此载荷位于 `event.params.data` 之下。你需要自行解包：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
function parseRedactionStatsEvents(rawEvents: Event[]): RedactionStatsEvent[] {
  const out: RedactionStatsEvent[] = [];
  for (const event of rawEvents) {
    const data = event.params?.data;
    const payload = data?.payload ?? data;
    if (payload?.kind === "update") out.push(payload);
  }
  return out;
}
```

通过选项参数控制缓冲区：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const rawEvents = useChannel(
  stream,
  ["custom:redaction-stats"],
  undefined, // target namespace
  { bufferSize: 200, replay: true },
);
```

| 选项 | 默认值 | 作用 |
| - | - | - |
| `bufferSize` | `"default"` | 缓冲事件的最大数量。达到上限后较早的事件会被丢弃。 |
| `replay` | `true` | 选择器挂载时回放通道上已经出现过的事件，而不仅是实时事件。 |

> [!NOTE]
>
> 常见场景优先使用更高层选择器（`useExtension`、`useMessages`、`useToolCalls`、`useValues`）。它们返回带类型、已解包的值，并只跟踪你实际渲染的内容。当你确实需要原始事件流时，再使用 `useChannel`。

## 在 `useExtension` 与 `useChannel` 之间选择

两者读取同一个自定义通道，但返回值不同：

| | `useExtension` | `useChannel` |
| - | - | - |
| **返回** | 最新载荷（`T \| undefined`） | 原始事件的有界缓冲区（`Event[]`） |
| **形状** | 已解包的带类型载荷 | 原始协议事件；需自行解包 `event.params.data` |
| **订阅方式** | 通道名（`"redaction-stats"`） | 完整通道 id（`["custom:redaction-stats"]`） |
| **适用场景** | 需要当前值 | 需要历史、日志或多个通道 |
| **选项** | — | `bufferSize`、`replay` |

常见模式是在同一通道上同时使用两者：`useExtension` 驱动实时汇总（当前总计），而 `useChannel` 支撑整个线程中每次更新的滚动事件日志。

## 使用场景

自定义通道适用于任何无法干净映射到消息、工具调用或图状态的服务端信号：

* **合规与脱敏统计**：擦除的 PII 数量、被拦截内容或策略命中次数，如上面的示例。
* **进度报告**：长耗时工具发出的完成百分比或步骤标签。
* **实时指标**：运行中累积的 token 用量、延迟或成本。
* **来源与引用**：智能体为回答提供依据时，把检索到的文档推送到侧面板。
* **领域事件**：后端希望在不改动消息记录的情况下暴露的任何结构化更新。

## 相关内容

* [概览](https://docs.langchain.com/oss/javascript/langgraph/frontend/overview.md) —— LangGraph 前端流 API 与架构。
* [图执行](https://docs.langchain.com/oss/javascript/langgraph/frontend/graph-execution.md) —— 多节点流水线的命名空间作用域选择器。

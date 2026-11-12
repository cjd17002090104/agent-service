> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/persistence.md

# 持久化

> LangGraph 的持久化层通过检查点保存器为智能体提供短期记忆，并通过存储提供长期记忆。

持久化让 LangGraph 应用能够在单次图运行之外保留有用信息。当智能体需要继续一段对话、在中断后恢复、从故障中恢复，或跨多次交互记住信息时，持久化就非常重要。

LangGraph 提供两套互补的持久化系统：

* **[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md)**（checkpointer）把线程的图状态持久化为检查点。它们用于短期的、线程作用域内的记忆，包括对话连续性、人在环路工作流、时间旅行和容错。
* **[存储](https://docs.langchain.com/oss/javascript/langgraph/stores.md)**（store）在图状态之外持久化应用自定义的数据。它们用于长期的、跨线程的记忆，包括用户偏好、事实和共享知识。

大多数应用可以同时使用两者：由[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md)跟踪当前线程，由[存储](https://docs.langchain.com/oss/javascript/langgraph/stores.md)跟踪跨线程的持久信息。

## 快速开始

编译图时传入检查点保存器、存储，或两者都传：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { MemorySaver, InMemoryStore } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
const store = new InMemoryStore();

const graph = builder.compile({ checkpointer, store });

const result = await graph.invoke(
  { messages: [{ role: "user", content: "Hi, my name is Bob." }] },
  { configurable: { thread_id: "thread-1" } }
);
```

> [!NOTE]
>
> **Agent Server 会自动处理持久化**
> 使用 [Agent Server](https://docs.langchain.com/langsmith/agent-server.md) 时，你无需手动实现或配置检查点保存器与存储。服务器会在后台处理持久化基础设施。

## 检查点保存器与存储的对比

| | 检查点保存器 | 存储 |
| - | - | - |
| 持久化的内容 | 图状态快照 | 应用定义的键值数据 |
| 作用域 | 单个线程 | 跨线程 |
| 记忆类型 | 短期的、线程作用域内的记忆 | 长期的、跨线程的记忆 |
| 适用场景 | 对话连续性、人在环路、时间旅行和容错 | 用户偏好、事实和共享知识 |
| 访问方式 | 在图配置中传入 `thread_id` | 从节点或应用代码中读写条目 |
| 完整指南 | [检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md) | [存储](https://docs.langchain.com/oss/javascript/langgraph/stores.md) |

## 常见问题排查

### PostgresSaver：`thread_id` 过长

使用 `PostgresSaver`（或 `AsyncPostgresSaver`）时，`thread_id` 存储在长度有限的列中。如果你的 `thread_id` 超出该列的长度，就会遇到数据库错误。

**修复方法：** 让 `thread_id` 的值保持在 255 个字符以内。如果需要确定性的 ID，请使用 UUID 或哈希值：

### `MemorySaver` 在重启后不保留数据

`MemorySaver` 和 `InMemorySaver` 把检查点保存在内存（RAM）中。进程重启后，所有检查点都会丢失。

**修复方法：** 在生产环境中使用持久化的检查点保存器：

* `PostgresSaver`：支持异步的 PostgreSQL
* `SqliteSaver`：面向开发环境的本地文件存储

### 检查点无限制增长

在长时间的对话中，检查点会不断累积。这会增加延迟和存储成本。

**修复方法：** 定期清理旧的检查点，或设置保留策略：

### 从父图访问子图的状态

子图更新状态时，父图可能不会立即看到这些变更。这是因为每个子图管理自己的检查点命名空间。

**修复方法：** 对于需要跨图边界的数据，使用[通过存储共享状态](https://docs.langchain.com/oss/javascript/langgraph/stores.md)，或者配置子图写入父检查点。

## 后续步骤

* [使用检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md)来持久化和查看线程状态。
* [使用存储](https://docs.langchain.com/oss/javascript/langgraph/stores.md)来跨线程持久化数据。

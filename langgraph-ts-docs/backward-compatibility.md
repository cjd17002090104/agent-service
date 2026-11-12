> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/backward-compatibility.md

# 向后兼容

> 在生产环境中更新 LangGraph 图代码，而不破坏正在进行的运行。

软件在生产中总需要变化：新需求、缺陷修复和重构最终都会落到图代码里。由于 LangGraph 会用最新部署的图去运行已有线程中[持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence.md)的状态，你发布的每一次变更，实际上都相当于针对既有检查点做了一次向后兼容的 API 变更。

与那些把一次运行固定在其启动时所用代码版本上的工作流引擎不同，LangGraph 会立即把最新的图应用到*每一个*线程——无论是新线程，还是从检查点恢复的线程。这很方便：缺陷修复无需额外操作即可传导到进行中的对话和智能体。这也意味着你必须考虑每次变更会如何与在旧代码版本下启动的运行交互。

需要留意的兼容性问题大致有三类，按你会遇到的顺序排列：

1. [技术兼容性](#技术兼容性)：最常见；新代码必须仍能针对既有状态加载并执行。
2. [业务兼容性](#业务兼容性)：较少见；既有运行应继续遵循旧的业务逻辑，尽管代码已经改变。
3. [非确定性](#非确定性)：仅适用于 [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md)。

> [!TIP]
>
> 关于运行时默认支持哪些图拓扑与状态变更的简要说明，请参阅[图迁移](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graph-migrations)。本页其余部分介绍当变更超出该支持范围时可以采用的模式。

## 技术兼容性

技术兼容性相当于微服务中的 API 破坏性变更。这里的“API”指图代码与[检查点保存器](https://docs.langchain.com/oss/javascript/langgraph/checkpointers.md#checkpointer-libraries)已为既有线程持久化的数据之间的约定。当线程恢复时，LangGraph 反序列化已保存的状态，按名称将其分派给某个节点，并期望该节点返回符合状态 schema 的值。

常见的技术性破坏包括：

* **重命名或删除节点**，而线程正暂停在该节点处或即将进入该节点，例如停在 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 处，或经由仍路由到旧名称的、已检查点的条件边。恢复时，LangGraph 无法按保存的名称找到该节点，运行随之失败。运行恢复的起点是执行停止处那个节点的开头，因此节点缺失就无处可恢复。
* **重命名或删除状态键**，而旧检查点仍包含该键，或下游节点仍会读取该键。
* **收紧状态字段**，例如把 `Optional` 字段改为必填、收窄类型，或新增没有默认值的必填字段。既有检查点无法满足新 schema。

边拓扑本身*不会*持久化到检查点中。在仍然存在的节点之间增加、删除或改接边，对进行中的线程是安全的。按照[图迁移](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#graph-migrations)的总结，唯一可能破坏已中断线程的拓扑变更就是重命名或删除节点。

### 推荐模式

* 将新增状态字段标记为可选（`z.string().optional()` 或 `.nullish()`），以便旧检查点仍能通过校验。
* 把删除当作弃用：至少在 schema 上保留该字段一个排空周期，使既有检查点能继续加载。
* 通过“先加后删”重命名：在旧字段或旧节点旁边新增新的，在弃用窗口内双写或同时路由到两者，等没有进行中的线程依赖旧项后再移除。
* 在预发布部署中，使用[时间旅行](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md)和 [`graph.getState`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/getState) 抽检既有线程在新代码下的表现，然后再全量发布。

### 检测进行中的线程

在删除节点、重命名状态键，或做其他旧线程无法容忍的变更之前，你需要了解是否还有线程停留在你即将移除的那版代码上。LangGraph 本身并不维护线程状态的搜索索引，因此答案取决于你的图运行在哪里。

**如果部署到 [LangSmith](https://docs.langchain.com/langsmith/deployment.md)。** 使用 Agent Server 的线程搜索按状态过滤。`status` 字段接受 `idle`、`busy`、`interrupted` 和 `error`，因此你可以批量查询 `interrupted` 或 `busy` 的线程，并可用元数据过滤器进一步缩小范围。参见[按线程状态过滤](https://docs.langchain.com/langsmith/use-threads.md#filter-by-thread-status)与[列出线程](https://docs.langchain.com/langsmith/use-threads.md#list-threads)。

**在任何运行 LangGraph 的地方。** 使用 [LangSmith 追踪](https://docs.langchain.com/oss/javascript/langgraph/observability.md)监控生产环境中哪些节点被进入和退出。这是判断某个节点或状态字段在任何活跃代码路径中是否已不可达的最可靠信号。

**当已知 `thread_id` 时。** 直接检查单个线程：

* [`graph.getState(config)`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/getState) 返回最新的检查点，包括线程暂停在哪个节点以及是否有待处理的中断。
* [`graph.getStateHistory(config)`](https://reference.langchain.com/javascript/langchain-langgraph/pregel/Pregel/getStateHistory) 返回该线程完整的检查点时间序列。

拿不准时，就保留已弃用的节点或字段，直到 Agent Server 的线程列表与追踪都显示它不再有活动。

## 业务兼容性

有时变更在技术上是合法的（每个既有检查点仍能加载、每个节点仍能解析），但新图的*含义*与旧图不同。新行为对新线程是正确的，而你不希望把它追溯应用到在旧逻辑下启动的线程上。

例如，假设你的图执行 `intake → triage → respond`，你决定在 `triage` 与 `respond` 之间插入新的 `policy_check` 步骤：

* 已经通过 `triage` 的线程应直接继续到 `respond`（旧流程）。
* 新线程应运行完整的新流程。

推荐模式是在线程开始时就把相关的*行为版本*记录到状态上，然后用[条件边](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#conditional-edges)据此分支：

在 `triage` 之后恢复的旧线程会从已保存状态读取 `flow_version`（或落回 v1 默认值）并跳过 `policy_check`。新线程从 `intake` 开始，被打上 `flow_version=2` 标记，走新路径。等所有 v1 线程完成后，就可以移除版本标记和条件边。

这个模式只有在*线程开始时*设置版本（且在任何需要分版本的岔路之前）才有效。更晚设置意味着既有线程在需要时没有这个值。

## 非确定性

这一类只适用于 [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md)，以及 [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md) **节点**内的[**任务**](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#task)或 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt)。普通 Graph API **节点**在恢复时会[从节点函数开头重新执行](https://docs.langchain.com/oss/javascript/langgraph/graph-api.md#re-execution-and-idempotency)；请把副作用设计成幂等的，但除非在该**节点**中使用**任务**或 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt)，否则不需要保持任务调用顺序。

Functional API 的**入口点**会编译成单个**节点**，运行恢复时从头重放入口点主体，并用已缓存的 [`@task`](https://reference.langchain.com/javascript/langchain-langgraph/index/task) 结果跳过已经完成的工作。两类变更会破坏这个模型：

* **在恢复点之前增加、删除或重排 `@task` 调用或 [`interrupt`](https://reference.langchain.com/javascript/langchain-langgraph/index/interrupt) 调用**。LangGraph 按调用在重放中的位置来匹配缓存结果和恢复值，因此位置移动可能导致把错误的缓存值重放到另一个调用上。
* **在 `@task` 之外引入非确定性操作**，例如 `time.time()`、`random.random()`，或内联在入口点主体中的网络调用。重放时这些操作产生的值与首次运行不同，可能改变控制流。

更深入的说明与示例，请参阅 Functional API 指南中的[确定性](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#determinism)与[常见陷阱](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md#common-pitfalls)。

如果需要对仍有进行中运行的 `@entrypoint` 做较大代码改动，最安全的做法是：

* 等进行中的运行排空后再部署变更。
* 把新逻辑包进新的 `@task`，使其结果被独立检查点保存。
* 在 `langgraph.json` 中以新的图名称注册一个提供新行为的入口点，并把新线程路由到它。

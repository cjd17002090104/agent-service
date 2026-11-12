> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/test.md

# 测试

在完成 LangGraph 智能体的原型之后，一个自然的下一步就是添加测试。本指南介绍编写单元测试时可以使用的一些实用模式。

请注意，本指南是 LangGraph 专用的，涉及具有自定义结构的图相关场景——如果你刚刚入门，请查看 [Test](https://docs.langchain.com/oss/javascript/langchain/test.md)，它使用的是 LangChain 内置的 [`createAgent`](https://reference.langchain.com/javascript/langchain/index/createAgent)。

## 前置条件

首先，确保已安装 [`vitest`](https://vitest.dev/)：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
$ npm install -D vitest
```

## 入门

由于许多 LangGraph 智能体依赖状态，一个实用的模式是：在使用某个图的每个测试之前创建该图，然后在测试中使用新的检查点实例对其进行编译。

下面的示例展示了如何在一个简单的线性图上做到这一点，该图依次经过 `node1` 和 `node2`。每个节点都会更新单一的状态键 `my_key`：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { test, expect } from 'vitest';
import {
  StateGraph,
  StateSchema,
  START,
  END,
  MemorySaver,
} from '@langchain/langgraph';
import * as z from "zod";

const State = new StateSchema({
  my_key: z.string(),
});

const createGraph = () => {
  return new StateGraph(State)
    .addNode('node1', (state) => ({ my_key: 'hello from node1' }))
    .addNode('node2', (state) => ({ my_key: 'hello from node2' }))
    .addEdge(START, 'node1')
    .addEdge('node1', 'node2')
    .addEdge('node2', END);
};

test('basic agent execution', async () => {
  const uncompiledGraph = createGraph();
  const checkpointer = new MemorySaver();
  const compiledGraph = uncompiledGraph.compile({ checkpointer });
  const result = await compiledGraph.invoke(
    { my_key: 'initial_value' },
    { configurable: { thread_id: '1' } }
  );
  expect(result.my_key).toBe('hello from node2');
});
```

## 测试单个节点与边

编译后的 LangGraph 智能体会以 `graph.nodes` 的形式暴露对每个单独节点的引用。你可以利用这一点在智能体内部测试单个节点。注意，这样做会绕开编译图时传入的任何检查点保存器：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { test, expect } from 'vitest';
import {
  StateGraph,
  START,
  END,
  MemorySaver,
  StateSchema,
} from '@langchain/langgraph';
import * as z from "zod";

const State = new StateSchema({
  my_key: z.string(),
});

const createGraph = () => {
  return new StateGraph(State)
    .addNode('node1', (state) => ({ my_key: 'hello from node1' }))
    .addNode('node2', (state) => ({ my_key: 'hello from node2' }))
    .addEdge(START, 'node1')
    .addEdge('node1', 'node2')
    .addEdge('node2', END);
};

test('individual node execution', async () => {
  const uncompiledGraph = createGraph();
  // Will be ignored in this example
  const checkpointer = new MemorySaver();
  const compiledGraph = uncompiledGraph.compile({ checkpointer });
  // Only invoke node 1
  const result = await compiledGraph.nodes['node1'].invoke(
    { my_key: 'initial_value' },
  );
  expect(result.my_key).toBe('hello from node1');
});
```

## 部分执行

对于由较大图构成的智能体，你可能希望测试智能体内部的部分执行路径，而不是端到端地测试整个流程。在某些情况下，把这些部分[重构为子图](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs.md)在语义上更合理，你可以像普通图一样单独调用它们。

不过，如果你不想改动智能体图的整体结构，可以使用 LangGraph 的持久化机制来模拟这样一种状态：智能体在目标部分开始之前暂停，并在目标部分结束时再次暂停。步骤如下：

1. 使用检查点保存器编译智能体（测试时内存检查点保存器 [`MemorySaver`](https://reference.langchain.com/javascript/langchain-langgraph-checkpoint/MemorySaver) 就足够）。
2. 调用智能体的 [`update_state`](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel) 方法，并把 [`asNode`](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel#from-a-specific-node) 参数设置为你希望开始测试的节点*之前*那个节点的名称。
3. 使用与更新状态时相同的 `thread_id`，并把 `interruptBefore` 参数设置为希望停止的节点名称，然后调用智能体。

下面是一个只执行线性图中第二个和第三个节点的示例：

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { test, expect } from 'vitest';
import {
  StateGraph,
  StateSchema,
  START,
  END,
  MemorySaver,
} from '@langchain/langgraph';
import * as z from "zod";

const State = new StateSchema({
  my_key: z.string(),
});

const createGraph = () => {
  return new StateGraph(State)
    .addNode('node1', (state) => ({ my_key: 'hello from node1' }))
    .addNode('node2', (state) => ({ my_key: 'hello from node2' }))
    .addNode('node3', (state) => ({ my_key: 'hello from node3' }))
    .addNode('node4', (state) => ({ my_key: 'hello from node4' }))
    .addEdge(START, 'node1')
    .addEdge('node1', 'node2')
    .addEdge('node2', 'node3')
    .addEdge('node3', 'node4')
    .addEdge('node4', END);
};

test('partial execution from node2 to node3', async () => {
  const uncompiledGraph = createGraph();
  const checkpointer = new MemorySaver();
  const compiledGraph = uncompiledGraph.compile({ checkpointer });
  await compiledGraph.updateState(
    { configurable: { thread_id: '1' } },
    // The state passed into node 2 - simulating the state at
    // the end of node 1
    { my_key: 'initial_value' },
    // Update saved state as if it came from node 1
    // Execution will resume at node 2
    'node1',
  );
  const result = await compiledGraph.invoke(
    // Resume execution by passing None
    null,
    {
      configurable: { thread_id: '1' },
      // Stop after node 3 so that node 4 doesn't run
      interruptAfter: ['node3']
    },
  );
  expect(result.my_key).toBe('hello from node3');
});
```

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/install.md

# 安装 LangGraph

要安装 LangGraph 基础包：

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

使用 LangGraph 时，你通常需要访问 LLM 并定义工具。
你可以按自己合适的任何方式来做这件事。

其中一种方式（也是我们在文档中采用的方式）是使用 [LangChain](https://docs.langchain.com/oss/javascript/langchain/overview.md)。

使用以下命令安装 LangChain：

```bash npm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
npm install langchain
```

```bash pnpm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
pnpm add langchain
```

```bash yarn theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
yarn add langchain
```

```bash bun theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
bun add langchain
```

若要使用特定的 LLM 提供商包，你需要单独安装它们。

关于各提供商的具体安装说明，请参阅[集成](https://docs.langchain.com/oss/javascript/integrations/providers/overview.md)页面。

> 原文链接: https://docs.langchain.com/oss/javascript/langgraph/application-structure.md

# 应用结构

一个 LangGraph 应用由一个或多个图、一个配置文件（`langgraph.json`）、一个声明依赖的文件，以及一个可选的、用于声明环境变量的 `.env` 文件组成。

本指南展示一个应用的典型结构，并说明如何提供所需配置，以便用 [LangSmith Deployment](https://docs.langchain.com/langsmith/deployment.md) 部署应用。

> [!NOTE]
>
> LangSmith Deployment 是一个用于部署和扩展 LangGraph 智能体的托管平台。它负责基础设施、扩缩容和运维相关事项，让你可以直接从代码仓库部署有状态、长时间运行的智能体。更多信息请参阅 [Deployment 文档](https://docs.langchain.com/langsmith/deployment.md)。

## 核心概念

要使用 LangSmith 进行部署，需要提供以下信息：

1. 一个 [LangGraph 配置文件](#配置文件概念)（`langgraph.json`），用于指定应用的依赖、图和环境变量。
2. 实现应用逻辑的[图](#图)。
3. 一个声明运行应用所需[依赖](#依赖)的文件。
4. 应用运行所需的[环境变量](#环境变量)。

## 文件结构

下面是应用目录结构的示例：

```plaintext theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
my-app/
├── src # all project code lies within here
│   ├── utils # optional utilities for your graph
│   │   ├── tools.ts # tools for your graph
│   │   ├── nodes.ts # node functions for your graph
│   │   └── state.ts # state definition of your graph
│   └── agent.ts # code for constructing your graph
├── package.json # package dependencies
├── .env # environment variables
└── langgraph.json # configuration file for LangGraph
```

> [!NOTE]
>
> LangGraph 应用的目录结构会因所用编程语言和包管理器而有所不同。

## 配置文件

`langgraph.json` 是一个 JSON 文件，用于指定部署 LangGraph 应用所需的依赖、图、环境变量及其他设置。

有关该 JSON 文件所有受支持键的详细信息，请参阅 [LangGraph 配置文件参考](https://docs.langchain.com/langsmith/cli.md#configuration-file)。

> [!TIP]
>
> [LangGraph CLI](https://docs.langchain.com/langsmith/cli.md) 默认使用当前目录下的 `langgraph.json` 配置文件。

### 示例

* 依赖将从本地目录中的依赖文件（例如 `package.json`）加载。
* 从文件 `./your_package/your_file.js` 中加载名为 `agent` 的函数作为单个图。
* 内联设置环境变量 `OPENAI_API_KEY`。

```json theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  "dependencies": ["."],
  "graphs": {
    "my_agent": "./your_package/your_file.js:agent"
  },
  "env": {
    "OPENAI_API_KEY": "secret-key"
  }
}
```

## 依赖

LangGraph 应用可能依赖其他 TypeScript/JavaScript 库。

要让依赖被正确安装，通常需要指定以下信息：

1. 目录中声明依赖的文件（例如 `package.json`）。

2. [LangGraph 配置文件](#配置文件概念)中的 `dependencies` 键，用于指定运行 LangGraph 应用所需的依赖。

3. 任何额外的二进制或系统库，可通过 [LangGraph 配置文件](#配置文件概念)中的 `dockerfile_lines` 键指定。

## 图

使用 [LangGraph 配置文件](#配置文件概念)中的 `graphs` 键来指定部署后的 LangGraph 应用将提供哪些图。

你可以在配置文件中指定一个或多个图。每个图由一个名称（应当唯一）和一个路径标识，路径指向以下之一：（1）已编译的图，或（2）一个用于构建图的函数。

## 环境变量

如果在本地运行已部署的 LangGraph 应用，可以在 [LangGraph 配置文件](#配置文件概念)的 `env` 键中配置环境变量。

对于生产部署，通常应在部署环境中配置环境变量。

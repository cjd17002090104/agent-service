import {createAgent} from "langchain"
import knowledgeTool from "../tools/knowledge"
import {ChatDeepSeek} from "@langchain/deepseek"

const techAgent = createAgent({
  model:new ChatDeepSeek(
    {
      model:"deepseek-flash",
      apiKey:process.env.DEEPSEEK_API_KEY,
    }
  ),
  tools:[knowledgeTool],
  systemPrompt: "你是一个回答用户问题的助手,提炼用户关键词，根据关键词调用工具从知识库中检索答案,不能直接回答用户问题",
})


export default techAgent

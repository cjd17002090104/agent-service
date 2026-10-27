import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import z from "zod";


function createSupervisorModel() {
  const customMessageType = [
    "order",
    "refund",
    "tech",
    "complaint",
  ] 

  const outputSchema = z.object({
    type:z.enum(customMessageType),
    reason:z.string().describe("归类原因"),
  })

  const prompt = ChatPromptTemplate .fromMessages([
    ["system",`你是一位智能客服，负责将用户最新的消息归类为${customMessageType.join("/")} 之一,json格式输出`],
    new MessagesPlaceholder("history")
  ])
  
  return prompt.pipe(new ChatDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY_SUPVISOR, // Default value.
    model: process.env.DEEPSEEK_MODEL_SUPVISOR,
  }).withStructuredOutput(outputSchema,{
  method: "jsonMode"  // 关键：从默认的 functionCalling 改为 jsonMode
}));  
}

export { createSupervisorModel };
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import z from "zod";
import * as dotenv from 'dotenv';
dotenv.config();

const customMessageType = [
    "order",
    "refund",
    "tech",
    "complaint",
  ] 

const outputSchema = z.object({
  type:z.enum(customMessageType).describe("类型"),
  reason:z.string().describe("归类原因"),
})

const prompt = ChatPromptTemplate .fromMessages([
  ["system",`你是一位智能客服，负责将用户最新的消息归类为${customMessageType.join("/")} 之一,json格式输出`],
  new MessagesPlaceholder("messages")
])


const model = new ChatDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY, // Default value.
  model: process.env.DEEPSEEK_MODEL_SUPVISOR,
}).withStructuredOutput(outputSchema,{
method: "functionCalling"  // 关键：从默认的 functionCalling 改为 jsonMode
})
  
export default prompt.pipe(model);

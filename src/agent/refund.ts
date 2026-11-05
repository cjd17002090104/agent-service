import {createAgent} from "langchain"
import orderTool from "../tools/orders"
import refundTool from "../tools/refunds"
import {ChatDeepSeek} from "@langchain/deepseek"
import { interrupt } from "@langchain/langgraph"
import {createMiddleware} from  "langchain"

const approveMiddleware = createMiddleware({
  name:"approveMiddleware",
  async wrapToolCall(request,handler){
    console.log(request)
    const approve = await interrupt({question:"确定要退款吗?",test:"12345"})
    return await handler( request);
  }
})

const refundAgent = createAgent({
  model:new ChatDeepSeek({
    model:"deepseek-flash",
    apiKey:process.env.DEEPSEEK_API_KEY,
  }),
  tools:[orderTool,refundTool],
  systemPrompt:"你负责退款流程，先根据用户的给出的订单id查询订单状态，然后改变该订单状态为refunding，若无订单或者订单状态已经为refunding，则告知用户",
  middleware:[approveMiddleware]
})




export default refundAgent
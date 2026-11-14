import {createAgent} from "langchain"
import orderTool from "../tools/orders"
import refundTool from "../tools/refunds"
import {ChatDeepSeek} from "@langchain/deepseek"
import { interrupt } from "@langchain/langgraph"
import {createMiddleware} from  "langchain"
import { z } from "zod"

const desSchema = z.object({
  id:z.string().describe("中断id"),
  decision:z.boolean().describe("是否退款决策"),
})



const approveMiddleware = createMiddleware({
  name:"approveMiddleware",
  async wrapToolCall(request,handler){
    if(request.toolCall?.name==='refundTool'){
      const {orderDes,amount} = request.toolCall.args
      const approve = await interrupt({question:`您要退款的订单信息如下:\n${orderDes}\n退款金额为${amount},确定要退款吗?`,responseSchema:desSchema})
    }
   
    return await handler( request);
  }
})

const refundAgent = createAgent({
  model:new ChatDeepSeek({
    model:"deepseek-flash",
    apiKey:process.env.DEEPSEEK_API_KEY,
  }),
  tools:[orderTool,refundTool],
  systemPrompt:"你负责退款流程，先根据用户的给出的订单id查询订单状态，然后改变该订单状态为refunding，若无订单或者订单状态已经为refunding，则告知用户，必须调用refundTool确认退款,不要暴露原始数据",
  middleware:[approveMiddleware]
})




export default refundAgent
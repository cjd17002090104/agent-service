import { tool } from "@langchain/core/tools";
import { z } from "zod";


const refundTool = tool(({order,reason,amount,orderDes})=>{
  const refund_id=Date.now()
  return JSON.stringify({
    refund_id,
    reason,
    amount,
    status: "processing",
    estimatedDays: 3,
  }) 
},{
  name:"refundTool",
  description:"对一个订单发起退款。调用前必须已经通过 queryTool 确认订单存在且状态允许退款。",
  schema:z.object({
    order:z.object().describe("订单信息"),
    orderDes:z.string().describe("订单信息描述"),
    reason:z.string().describe("退款原因"),
    amount:z.number().describe("退款金额"),
  })
})
export default refundTool
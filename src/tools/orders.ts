import { tool } from "@langchain/core/tools";
import { z } from "zod";
// 模拟订单数据库
const ORDERS = new Map([
  ["O-1001", { status: "shipped", carrier: "顺丰", trackingNo: "SF1234", amount: 299 }],
  ["O-1002", { status: "delivered", carrier: "京东", trackingNo: "JD5678", amount: 1599 }],
  ["O-1003", { status: "pending_payment", amount: 89 }],
]);


const orderTool = tool(async ({orderId})=>{
  const order = ORDERS.get(orderId)
  return order?JSON.stringify({orderId,...order}):"订单不存在"
},
{
  name:"orderTool",
  description:"根据订单号查询订单信息",
  schema: z.object({
    orderId:z.string().describe("订单号"),
  }) 
}
)

export default orderTool
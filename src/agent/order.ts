import {createAgent} from "langchain"
import orderTool from "../tools/orders"
import {ChatDeepSeek} from "@langchain/deepseek"

const orderAgent = createAgent({
  model:new ChatDeepSeek({
      model:"deepseek-flash",
      apiKey:process.env.DEEPSEEK_API_KEY,
  }),
  tools:[orderTool],
  systemPrompt:"你负责根据用户给出的订单名调用工具查询对应订单的信息"
})

export default orderAgent
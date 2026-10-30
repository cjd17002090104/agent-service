import {tool} from "@langchain/core/tools"
import z from "zod"

const knowledgeStore = [
  {question:"如何重置密码",answer:"请在登录页面点击忘记密码链接,然后按照提示操作即可"},
  {question:"如何修改个人信息",answer:"请在个人中心页面修改个人信息,包括姓名、手机号、邮箱等"},
  {question:"如何修改订单收货地址",answer:"请在订单中心页面修改订单收货地址"},
]

const knowledgeTool = tool(async ({query})=>{
  const res = knowledgeStore.filter(f=>f.question.includes(query)||query.includes(f.question.slice(0,4))).slice(0,3)
  if(res.length>0){
    return res.map((f,i)=>`${i+1}. Q:${f.question}\nA:${f.answer}`).join("\n\n")
  }
  return "未找到相关答案"
},{
  name: "knowledge",
  description: "根据用户输入的关键词,从知识库中检索答案",
  schema: z.object({
    query: z.string().describe("用户输入的关键词"),
  }),
})

export default knowledgeTool

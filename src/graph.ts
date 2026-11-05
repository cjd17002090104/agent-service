import {StateSchema,MessagesValue,MemorySaver, type GraphNode,StateGraph,type ConditionalEdgeRouter ,START,END} from "@langchain/langgraph"
import supervisorModel from "./agent/supervisor.ts"
import orderAgent from "./agent/order.ts"
import techAgent from "./agent/tech.ts"
import refundAgent from "./agent/refund.ts"
import z from "zod";

const checkpointer = new MemorySaver()

const state = new StateSchema({
  messages:MessagesValue,
  category:z.string().describe("归类结果"),
})

type State = typeof state.State

const toAgent:ConditionalEdgeRouter<typeof state> = (state)=>{
  return state.category||END
}

const route:GraphNode<typeof state> = async (state)=>{
    const res = await supervisorModel.invoke({
        messages:state.messages,
    })
    return {messages:state.messages,category:res.type}
}

const runAgent = async (agent:typeof techAgent,state: State)=>{
  const res = await agent.invoke({
    messages:state.messages,
  })
  return {messages:res.messages.slice(state.messages.length)}
}

const agent = new StateGraph(state)
.addNode("supervisor",route)
.addNode("tech",(state)=>runAgent(techAgent,state))
.addNode("order",(state)=>runAgent(orderAgent,state))
.addNode("refund",(state)=>runAgent(refundAgent,state))
.addConditionalEdges("supervisor",toAgent,["tech","order","refund",END]) 
.addEdge(START,"supervisor")
.addEdge("tech",END)
.addEdge("order",END)
.addEdge("refund",END)
.compile({checkpointer})
export default agent
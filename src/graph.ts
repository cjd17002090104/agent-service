import {StateSchema,MessagesValue,type GraphNode,StateGraph,type ConditionalEdgeRouter ,START,END} from "@langchain/langgraph"
import supervisorModel from "./agent/supervisor.ts"
import techAgent from "./agent/tech.ts"
import z from "zod";


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
.addConditionalEdges("supervisor",toAgent,["tech",END]) 
.addEdge(START,"supervisor")
.addEdge("tech",END)
.compile()
export default agent

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { cors } from 'hono/cors'
import graph from './graph.ts'
import {Command} from "@langchain/langgraph"


const app = new Hono()
app.use('*', cors()) 
app.post('/:thread_id', async (c) => {
  
  const {thread_id} = c.req.param()
  const data = await c.req.json()

  return streamSSE(c, async (stream) => {
    const events = await graph.stream({messages:[data]},{
      configurable: {
      thread_id
    }
    })
    return 
  })
})

app.post('/approve', async (c) => {
  const data = await c.req.json()
  if(!data.id){
    return c.json({message:"未知的审批事件",status:0})
  }
  return streamSSE(c, async (stream) => {
    const events = await graph.invoke(new Command({resume:{id:data.id,decision:data.decision}}))
    
  }
)
})

async function streamEvents(events:any,stream:any){
  for await(const event of events ){
       const entries = Object.entries(event)
       const res:Record<string,Array<any>> = {} 
       let resEvent = ""

       for(const [key, value] of entries){
        if(value&& value instanceof Object&&Array.isArray(value.messages)){
          resEvent = "message"
          res.data = value.messages.map((item:any)=>({item:item.id,content:item.content,type:item.type}))
        }else if(key=="__interrupt__"){
          resEvent = "interrupt"
          res.data = (value as Array<any>).map(item=>({id:item.id,question:item.value.question,test:item.value.test}))
        }
       }
       await stream.writeSSE({ data: JSON.stringify(res) ,event:resEvent});
    }
}


serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

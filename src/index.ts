
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { cors } from 'hono/cors'
import graph from './graph.ts'
import {Command} from "@langchain/langgraph"


const app = new Hono()
app.use('*', cors()) 

type a=""
app.post('/:thread_id', async (c) => {
  
  const {thread_id} = c.req.param()
  const data = await c.req.json()

  return streamSSE(c, async (stream) => {
    const events = await graph.stream({messages:[data]},{
      configurable: {
      thread_id
    },
    streamMode: "messages"
    })
    type a=typeof events

    return streamEvents(events,stream)
  })
})

app.post('/:thread_id/approve', async (c) => {
  const {thread_id} = c.req.param()
  const data = await c.req.json()
  if(!data.id){
    return c.json({message:"未知的审批事件",status:0})
  }
  return streamSSE(c, async (stream) => {
    const events = await graph.stream(new Command({resume:{id:data.id,decision:data.decision}}),{
      configurable: {
      thread_id
    }
    })
    return streamEvents(events,stream)
  }
)
})

async function streamEvents(events:any,stream:any){
  try {
    for await(const chunk of events ){
    // const [msg] =  event as [{contentBlocks?: Array<{ type: string; text?: string }> }]
      
    const [msg] = chunk as [{ contentBlocks?: Array<{ type: string; text?: string }> }];
    const text = msg.contentBlocks
        // ?.filter((b) => b.type == "text")
        // .map((b) => b.text ?? "")
        // .join("") ?? "";
        console.log(msg,1)
    if (text) await stream.writeSSE({ event: "token", data: text });
      await stream.writeSSE({ event: "done", data: "" });
  }
  }catch(err){
    console.log(err)
  }

  
}


serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

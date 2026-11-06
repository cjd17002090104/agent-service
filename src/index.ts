
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { cors } from 'hono/cors'
import graph from './graph.ts'


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

    for await(const event of events ){
       await stream.writeSSE({ data: JSON.stringify(event) });
    }
  })
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

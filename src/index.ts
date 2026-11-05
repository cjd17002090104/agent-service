
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import agent from './graph.ts'


const app = new Hono()
app.get('/', async (c) => {
  const res = await agent.invoke({
    messages:[{role:"user",content:"你好,我想退款,订单号是O-1001"}]
  },{
    configurable: {
     thread_id: "1"
  }
  })
  return c.json(res)
  //  return c.json({"content":"你好"})
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

import * as dotenv from 'dotenv';
dotenv.config();
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {createSupervisorModel} from './agent/supervisor.ts'


const app = new Hono()

app.get('/', async (c) => {
  const res = await createSupervisorModel().invoke({
    history:[
  {
      role: "user",
      content: "你好,我想查询我的订单状态",
    },
    ]
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

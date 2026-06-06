import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

serve(
  {
    fetch: createApp().fetch,
    port,
  },
  (info) => {
    console.log(`ogame-agent api listening on http://localhost:${info.port}`);
  },
);

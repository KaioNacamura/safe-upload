import path from "node:path";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3002);
const pasta = path.resolve(process.env.UPLOAD_DIR ?? "uploads");

createApp(pasta).listen(port, () => {
  console.log(`safe-upload em http://localhost:${port}, salvando em ${pasta}`);
});

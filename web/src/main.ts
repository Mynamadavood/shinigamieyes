import { registerSW } from "virtual:pwa-register";
import "./style.css";

registerSW({ immediate: true });

const app = document.getElementById("app")!;
const h1 = document.createElement("h1");
h1.textContent = "SHINIGAMI EYES";
const healthLine = document.createElement("p");
healthLine.textContent = "health: …";
const sseLine = document.createElement("p");
sseLine.textContent = "sse probe: 0";
app.append(h1, healthLine, sseLine);

fetch("/api/health")
  .then((r) => r.json())
  .then((j) => {
    const t = new Date(j.server_time * 1000).toISOString();
    healthLine.textContent = `health: ${j.status} v${j.version} t=${t}`;
  })
  .catch(() => {
    healthLine.textContent = "health: unreachable";
  });

let n = 0;
const es = new EventSource("/api/_sse_probe?n=60");
es.addEventListener("tick", () => {
  n += 1;
  sseLine.textContent = `sse probe: ${n}`;
});
es.addEventListener("error", () => es.close());

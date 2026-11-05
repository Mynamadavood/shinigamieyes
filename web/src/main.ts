import { registerSW } from "virtual:pwa-register";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { boot } from "./app";

registerSW({ immediate: true });

void boot(document.getElementById("app")!);

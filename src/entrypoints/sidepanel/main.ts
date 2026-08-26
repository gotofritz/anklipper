import { mount } from "svelte";
import App from "./App.svelte";
import "./tdr.css";

const target = document.getElementById("app");
if (!target) throw new Error("sidepanel: #app missing");

export default mount(App, { target });

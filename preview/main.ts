import { mount } from "svelte";

import Panel from "@/sidebar/Panel.svelte";

import { DEFAULT_SCENE, SCENES } from "./scenes";

import "@/entrypoints/sidepanel/tdr.css";
import "./preview.css";

const wanted = new URLSearchParams(window.location.search).get("scene");
const name = wanted !== null && wanted in SCENES ? wanted : DEFAULT_SCENE;

const picker = document.getElementById("scenes");
if (picker !== null) {
  for (const [key, scene] of Object.entries(SCENES)) {
    const link = document.createElement("a");
    link.href = `?scene=${key}`;
    link.textContent = scene.label;
    if (key === name) link.setAttribute("aria-current", "page");
    picker.append(link);
  }
}

const target = document.getElementById("app");
if (target === null) throw new Error("preview: #app missing");

document.title = `Anklipper — ${SCENES[name]!.label}`;

mount(Panel, { target, props: SCENES[name]!.props });

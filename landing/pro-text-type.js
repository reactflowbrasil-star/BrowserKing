import React from "react";
import { createRoot } from "react-dom/client";
import ProTextType from "https://framer.com/m/ProTextType-KXoZ.js@zQQ6Rh7yVYyuhKxBRwZJ";

const mount = document.querySelector("#hero-pro-text");

if (mount) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  createRoot(mount).render(
    React.createElement(ProTextType, {
      text: ["assistir.", "esperar.", "só conversar."],
      as: "span",
      typingSpeed: reducedMotion ? 0 : 45,
      deletingSpeed: reducedMotion ? 0 : 30,
      initialDelay: reducedMotion ? 0 : 400,
      pauseDuration: reducedMotion ? 0 : 1220,
      loop: !reducedMotion,
      showCursor: !reducedMotion,
      cursorMode: "preset",
      cursorCharacterPreset: "▋",
      cursorColorMode: "custom",
      cursorCustomColor: "#C8FF3D",
      cursorBlinkDuration: 0.5,
      textColors: ["#C8FF3D"],
      sizingMode: "fixed",
      startOnVisible: false,
      className: "hero-pro-text-component",
      style: { display: "inline", width: "auto", height: "auto" },
      font: { font: "inherit", fontSize: "inherit", lineHeight: "inherit", fontWeight: "inherit" }
    })
  );
}

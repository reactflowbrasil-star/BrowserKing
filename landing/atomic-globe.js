import React from "react";
import { createRoot } from "react-dom/client";
import AtomicGlobe from "https://framer.com/m/AtomicGlobe-SnDdPL.js@fhEmkdKOhj93CEF57S57";

const mount = document.querySelector("#atomic-globe");

if (mount) {
  const acid = "#C8FF3D";
  const globeProps = {
    style: { width: "100%", height: "100%" },
    editorPreview: true,
    markers: [
      { label: "SÃO PAULO, BRA", lat: -23.5505, lng: -46.6333 },
      { label: "NEW YORK, USA", lat: 40.7128, lng: -74.006 },
      { label: "LONDON, UK", lat: 51.5074, lng: -0.1278 },
      { label: "TOKYO, JPN", lat: 35.6762, lng: 139.6503 },
      { label: "SYDNEY, AUS", lat: -33.8688, lng: 151.2093 }
    ],
    globe: {
      backgroundColor: "#080A08",
      globeScale: 1.42,
      rotationSpeed: 0.06,
      tilt: 18,
      centerLng: -20,
      positionX: 0,
      positionY: 0,
      performanceMode: "auto"
    },
    points: {
      dotColor: "#DFFFA0",
      dotDensity: 110000,
      baseSize: 4.2,
      sizeRandomness: 0.85,
      backParticleOpacity: 0.1
    },
    assembly: { introDuration: 2.4, reformOnScroll: true, persistentAssembly: false },
    drag: { allowVerticalDrag: true, verticalDragLimit: 55 },
    lens: {
      enableHover: true,
      hoverDelay: 0,
      hoverParticleColor: "#FFFFFF",
      lensRadius: 0.42,
      lensMagnification: 0.02,
      lensBulge: 0.02,
      lensParticleScale: 1
    },
    hotspots: {
      markerType: "beacon",
      pinHeight: 0.12,
      pinColor: acid,
      markerBgColor: "#171C14",
      markerTextColor: "#F4F7EE",
      markerActiveBgColor: acid,
      markerActiveIconColor: "#10140B"
    },
    paths: { showArcs: true, arcColor: acid, arcSpeed: 0.25, arcMode: "chain", arcHeight: 0.4 }
  };

  createRoot(mount).render(React.createElement(AtomicGlobe, globeProps));
}

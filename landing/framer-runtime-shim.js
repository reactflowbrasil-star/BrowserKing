// Minimal Framer runtime surface required by the published AtomicGlobe module.
// Property controls only exist inside the Framer editor, so they are no-ops here.
export const addPropertyControls = () => {};
export const ControlType = new Proxy({}, { get: (_, key) => key });
export const useIsStaticRenderer = () => false;
export const RenderTarget = {
  canvas: "canvas",
  current: () => "preview"
};

// The global stylesheet's reduced-motion block kills CSS *animations* only —
// transitions and rAF-driven JS motion keep running. Anything animating from
// JS (the atlas path-draw / marker slide, the battle outro walk, smooth
// scrolls) must check this and jump straight to its end state.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function bindControls(element, view, onTap) {
  const pointers = new Map();
  let gesture = null,
    pinchDistance = 0;
  const pos = (e) => {
    const r = element.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // A second contact on an overlay cancels the entire map gesture, including capture.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!element.contains(e.target)) {
        pointers.clear();
        gesture = null;
        pinchDistance = 0;
      }
    },
    { capture: true },
  );
  element.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    element.setPointerCapture(e.pointerId);
    const p = pos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1)
      gesture = { start: p, last: p, moved: false, multi: false };
    else {
      if (gesture) gesture.multi = true;
      const a = [...pointers.values()];
      pinchDistance = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    }
  });
  element.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e),
      previous = pointers.get(e.pointerId);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()],
        d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 1)
        view.scale(d / pinchDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchDistance = d;
      view.pan((p.x - previous.x) / 2, (p.y - previous.y) / 2);
      return;
    }
    if (!gesture) return;
    if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 9)
      gesture.moved = true;
    if (gesture.moved) view.pan(p.x - previous.x, p.y - previous.y);
    gesture.last = p;
  });
  const finish = (e, cancel = false) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e);
    pointers.delete(e.pointerId);
    const overMap = element.contains(
      document.elementFromPoint(e.clientX, e.clientY),
    );
    if (
      !cancel &&
      overMap &&
      gesture &&
      !gesture.moved &&
      !gesture.multi &&
      pointers.size === 0
    )
      onTap(p.x, p.y, e.shiftKey);
    if (pointers.size === 0) gesture = null;
  };
  element.addEventListener("pointerup", (e) => finish(e));
  element.addEventListener("pointercancel", (e) => finish(e, true));
  element.addEventListener("lostpointercapture", (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) gesture = null;
  });
  element.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = pos(e);
      view.scale(Math.exp(-e.deltaY * 0.001), p.x, p.y);
    },
    { passive: false },
  );
  element.addEventListener("contextmenu", (e) => e.preventDefault());
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "w",
        "a",
        "s",
        "d",
      ].includes(e.key)
    ) {
      keys.add(e.key);
      e.preventDefault();
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.key));
  addEventListener("blur", () => {
    keys.clear();
    pointers.clear();
    gesture = null;
  });
  view.onFrame = (dt) => {
    if (keys.has("w") || keys.has("ArrowUp")) view.pan(0, dt * 400);
    if (keys.has("s") || keys.has("ArrowDown")) view.pan(0, -dt * 400);
    if (keys.has("a") || keys.has("ArrowLeft")) view.pan(dt * 400, 0);
    if (keys.has("d") || keys.has("ArrowRight")) view.pan(-dt * 400, 0);
  };
}

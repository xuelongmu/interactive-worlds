interface PointerLockDocument {
  pointerLockElement: Element | null;
}

interface PointerLockTarget extends EventTarget {
  requestPointerLock(): Promise<void> | void;
}

/** Returns the exact cleanup needed by SplatScene.dispose(). */
export function bindPointerLockClick(
  container: PointerLockTarget,
  pointerDocument: PointerLockDocument = document
): () => void {
  const onClick = () => {
    if (!pointerDocument.pointerLockElement) void container.requestPointerLock();
  };
  container.addEventListener("click", onClick);
  return () => container.removeEventListener("click", onClick);
}

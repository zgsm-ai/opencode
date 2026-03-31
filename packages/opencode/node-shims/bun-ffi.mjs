export function dlopen() {
  throw new Error("bun:ffi is not available in the Node.js source runtime")
}

export function ptr() {
  throw new Error("bun:ffi is not available in the Node.js source runtime")
}

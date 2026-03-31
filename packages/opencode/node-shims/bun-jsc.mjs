export function heapStats() {
  return {
    heapSize: process.memoryUsage().heapUsed,
  }
}

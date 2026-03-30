type Task = {
  id: string
  interval: number
  run: () => void | Promise<void>
  scope?: string
}

const timers = new Map<string, ReturnType<typeof setInterval>>()

export namespace Scheduler {
  export function register(task: Task) {
    if (timers.has(task.id)) return
    const timer = setInterval(() => {
      void task.run()
    }, task.interval)
    timers.set(task.id, timer)
  }
}

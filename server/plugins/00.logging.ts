const levels = ['debug', 'info', 'log', 'warn', 'error'] as const
const loggingInstalled = Symbol.for('portalnuxt.logging.timestamps')

export default defineNitroPlugin(() => {
  const timestampedConsole = console as Console & { [loggingInstalled]?: boolean }

  if (timestampedConsole[loggingInstalled]) {
    return
  }

  Object.defineProperty(timestampedConsole, loggingInstalled, { value: true })

  for (const level of levels) {
    const write = console[level].bind(console)

    console[level] = (...args: unknown[]) => {
      write(`[${new Date().toISOString()}]`, ...args)
    }
  }

  console.info('Server logging initialized')
})

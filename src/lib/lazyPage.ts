import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Route loaders that survive transient failures: a flaky network request for
 * a JS chunk is retried automatically before giving up. (After a fresh
 * deployment old hashed chunks disappear — the error boundary then offers a
 * one-click reload which fetches the new build.)
 */
function loadWithRetry<T>(loader: () => Promise<T>, retries = 2, delayMs = 400): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = (left: number): void => {
      loader().then(resolve, (err: unknown) => {
        if (left <= 0) reject(err)
        else window.setTimeout(() => attempt(left - 1), delayMs)
      })
    }
    attempt(retries)
  })
}

export function lazyPage<T extends { default: ComponentType<object> }>(
  loader: () => Promise<T>,
): LazyExoticComponent<T['default']> {
  return lazy(() => loadWithRetry(loader))
}

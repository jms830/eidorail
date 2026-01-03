export async function checkNoCorsReachable(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs)

    fetch(url, { mode: "no-cors", cache: "no-store" })
      .then(() => resolve(true))
      .catch(() => resolve(false))
      .finally(() => clearTimeout(timeout))
  })
}

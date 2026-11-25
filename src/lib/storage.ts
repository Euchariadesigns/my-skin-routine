/** Ask the browser to keep our data even when the phone is low on space. */
export async function askForPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch { /* not supported; nothing to do */ }
}

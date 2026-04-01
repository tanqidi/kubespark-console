export function createRuntimeId(): string {
  const webCrypto = globalThis.crypto

  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID()
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16)
    webCrypto.getRandomValues(bytes)

    // RFC 4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

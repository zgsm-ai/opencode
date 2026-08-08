const separators = /[\p{Cc}\p{Z}\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+/gu

export function slugify(value: string) {
  return value.normalize("NFC").toLowerCase().replace(separators, "-").replace(/^-|-$/g, "")
}

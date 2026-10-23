// The scene JSON is also embedded in the exported PNG as an iTXt chunk (UTF-8), so a PNG whose sidecar went
// missing can still be re-imported. Pure byte manipulation; used by the renderer (write) and main (read).

export const PNG_SCENE_KEYWORD = 'poselens-scene'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export const isPng = (b: Uint8Array): boolean => SIGNATURE.every((v, i) => b[i] === v)

interface Chunk {
  type: string
  /** Offset of the chunk's length field. */
  start: number
  dataStart: number
  length: number
}

function chunks(b: Uint8Array): Chunk[] {
  if (!isPng(b)) throw new Error('Not a PNG file.')
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out: Chunk[] = []
  let p = SIGNATURE.length
  while (p + 8 <= b.length) {
    const length = view.getUint32(p)
    const type = String.fromCharCode(...b.subarray(p + 4, p + 8))
    out.push({ type, start: p, dataStart: p + 8, length })
    p += 12 + length
    if (type === 'IEND') break
  }
  return out
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** iTXt: keyword \0, compression flag 0, method 0, empty language \0, empty translated keyword \0, UTF-8 text. */
function itxtData(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder()
  const head = enc.encode(keyword)
  const body = enc.encode(text)
  const out = new Uint8Array(head.length + 5 + body.length)
  out.set(head, 0)
  out.set([0, 0, 0, 0, 0], head.length)
  out.set(body, head.length + 5)
  return out
}

/** Returns a copy with an iTXt chunk before IEND; an earlier chunk with the same keyword is replaced. */
export function embedPngText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  const list = chunks(png)
  const iend = list.find((c) => c.type === 'IEND')
  if (!iend) throw new Error('PNG has no IEND chunk.')
  const parts: Uint8Array[] = [png.subarray(0, SIGNATURE.length)]
  for (const c of list) {
    if (c.type === 'IEND') break
    if (c.type === 'iTXt' && readKeyword(png, c) === keyword) continue
    parts.push(png.subarray(c.start, c.dataStart + c.length + 4))
  }
  parts.push(makeChunk('iTXt', itxtData(keyword, text)))
  parts.push(png.subarray(iend.start, iend.dataStart + iend.length + 4))
  const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function readKeyword(b: Uint8Array, c: Chunk): string {
  const data = b.subarray(c.dataStart, c.dataStart + c.length)
  const end = data.indexOf(0)
  return new TextDecoder().decode(data.subarray(0, end < 0 ? data.length : end))
}

/** Text of the first uncompressed iTXt chunk with this keyword, or null. */
export function readPngText(png: Uint8Array, keyword: string): string | null {
  for (const c of chunks(png)) {
    if (c.type !== 'iTXt' || readKeyword(png, c) !== keyword) continue
    const data = png.subarray(c.dataStart, c.dataStart + c.length)
    let p = data.indexOf(0) + 1
    if (data[p] !== 0) return null // compressed: we never write those
    p += 2
    p = data.indexOf(0, p) + 1 // language tag
    p = data.indexOf(0, p) + 1 // translated keyword
    return new TextDecoder().decode(data.subarray(p))
  }
  return null
}

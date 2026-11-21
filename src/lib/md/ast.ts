// The document tree: one structure that both the preview (html.ts) and the PDF
// export render from, so the two can never disagree about what a document is.

export type BlockType =
  | 'document'
  | 'blockquote'
  | 'alert'
  | 'list'
  | 'item'
  | 'paragraph'
  | 'heading'
  | 'code'
  | 'math'
  | 'html'
  | 'hr'
  | 'table'

export interface ListData {
  ordered: boolean
  /** Bullet character, or the ordered delimiter. */
  marker: string
  start: number
  /** Column of the marker, and the width from it to the item's text. */
  markerOffset: number
  padding: number
}

export type Align = 'left' | 'center' | 'right' | null

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'softbreak' }
  | { type: 'hardbreak' }
  | { type: 'code'; value: string }
  | { type: 'math'; value: string }
  | { type: 'html'; value: string }
  | { type: 'emph'; children: Inline[] }
  | { type: 'strong'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'link'; href: string; title: string; children: Inline[] }
  | { type: 'image'; src: string; title: string; children: Inline[] }

export class Block {
  type: BlockType
  parent: Block | null = null
  children: Block[] = []
  open = true
  startLine: number
  endLine = 0

  /** Raw text of a leaf (paragraph, heading, code, math, html) while it is built. */
  content = ''
  /** Parsed inline content of a paragraph, heading or table cell. */
  inlines: Inline[] = []

  // heading
  level = 0
  // code / math
  info = ''
  fenced = false
  fenceChar = ''
  fenceLength = 0
  fenceOffset = 0
  // html
  htmlType = 0
  // list / item
  list: ListData | null = null
  tight = true
  /** Task item: null = not a task. */
  checked: boolean | null = null
  /** A3: "- {1.1} text" → "1.1". */
  label: string | null = null
  // alert
  alert = ''
  // table
  align: Align[] = []
  rows: Inline[][][] = []
  /** Raw cell text, parsed into `rows` once the reference definitions are known. */
  rawRows: string[][] = []

  constructor(type: BlockType, startLine: number) {
    this.type = type
    this.startLine = startLine
  }

  get last(): Block | undefined {
    return this.children[this.children.length - 1]
  }

  append(child: Block) {
    child.parent = this
    this.children.push(child)
  }

  remove() {
    if (!this.parent) return
    const i = this.parent.children.indexOf(this)
    if (i >= 0) this.parent.children.splice(i, 1)
    this.parent = null
  }
}

export interface LinkRef {
  href: string
  title: string
}

/**
 * 标注对象模型与撤销/重做（纯前端，无 DOM 依赖）
 *
 * 坐标约定：全部为**图片像素**（DIP 分辨率，与合成图 dataURL 同坐标系）。
 * 撤销/重做：以「对象数组」为单位做快照栈。
 */

export type ToolKind =
  | 'select'
  | 'pen'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'highlight'
  | 'text'
  | 'mosaic'

export interface Style {
  color: string
  lineWidth: number
  fill?: boolean
}

/** 绘制样式快照（字体随 text 存，避免全局耦合） */
export interface TextStyle {
  color: string
  size: number
  bold: boolean
}

export interface BaseAnno {
  id: string
  type: Exclude<ToolKind, 'select'>
}

export interface Point {
  x: number
  y: number
}

export interface PenAnno extends BaseAnno {
  type: 'pen'
  points: Point[]
  style: Style
}
export interface LineAnno extends BaseAnno {
  type: 'line'
  a: Point
  b: Point
  style: Style
}
export interface ArrowAnno extends BaseAnno {
  type: 'arrow'
  a: Point
  b: Point
  style: Style
}
export interface RectAnno extends BaseAnno {
  type: 'rect'
  rect: { x: number; y: number; w: number; h: number }
  style: Style
}
export interface EllipseAnno extends BaseAnno {
  type: 'ellipse'
  rect: { x: number; y: number; w: number; h: number }
  style: Style
}
export interface HighlightAnno extends BaseAnno {
  type: 'highlight'
  rect: { x: number; y: number; w: number; h: number }
  style: Style
}
export interface TextAnno extends BaseAnno {
  type: 'text'
  pos: Point
  text: string
  textStyle: TextStyle
}
export interface MosaicAnno extends BaseAnno {
  type: 'mosaic'
  rect: { x: number; y: number; w: number; h: number }
  /** 每格边长（越大马赛克越粗） */
  cell: number
  /** 颗粒形状：rect=方格，round=球状圆点 */
  shape: 'rect' | 'round'
}

export type Annotation =
  | PenAnno
  | LineAnno
  | ArrowAnno
  | RectAnno
  | EllipseAnno
  | HighlightAnno
  | TextAnno
  | MosaicAnno

let idCounter = 1
export function genId(): string {
  return `a${Date.now()}_${idCounter++}`
}

// ── 绘制 ──

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  anno: Annotation,
  /** 马赛克需要访问原图 */
  source?: CanvasImageSource
): void {
  ctx.save()
  switch (anno.type) {
    case 'pen': {
      if (anno.points.length < 2) break
      ctx.strokeStyle = anno.style.color
      ctx.lineWidth = anno.style.lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(anno.points[0].x, anno.points[0].y)
      for (let i = 1; i < anno.points.length; i++) ctx.lineTo(anno.points[i].x, anno.points[i].y)
      ctx.stroke()
      break
    }
    case 'line':
    case 'arrow': {
      const cp = ctx
      cp.strokeStyle = anno.style.color
      cp.lineWidth = anno.style.lineWidth
      cp.lineCap = 'round'
      cp.beginPath()
      cp.moveTo(anno.a.x, anno.a.y)
      cp.lineTo(anno.b.x, anno.b.y)
      cp.stroke()
      if (anno.type === 'arrow') {
        const ang = Math.atan2(anno.b.y - anno.a.y, anno.b.x - anno.a.x)
        const head = Math.max(10, anno.style.lineWidth * 3)
        const a = head
        cp.beginPath()
        cp.moveTo(anno.b.x, anno.b.y)
        cp.lineTo(
          anno.b.x - Math.cos(ang - 0.5) * a,
          anno.b.y - Math.sin(ang - 0.5) * a
        )
        cp.lineTo(
          anno.b.x - Math.cos(ang + 0.5) * a,
          anno.b.y - Math.sin(ang + 0.5) * a
        )
        cp.closePath()
        cp.fillStyle = anno.style.color
        cp.fill()
      }
      break
    }
    case 'rect': {
      if (anno.style.fill) {
        ctx.fillStyle = anno.style.color
        ctx.globalAlpha = 0.35
        ctx.fillRect(anno.rect.x, anno.rect.y, anno.rect.w, anno.rect.h)
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = anno.style.color
      ctx.lineWidth = anno.style.lineWidth
      ctx.strokeRect(anno.rect.x, anno.rect.y, anno.rect.w, anno.rect.h)
      break
    }
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(
        anno.rect.x + anno.rect.w / 2,
        anno.rect.y + anno.rect.h / 2,
        anno.rect.w / 2,
        anno.rect.h / 2,
        0,
        0,
        Math.PI * 2
      )
      if (anno.style.fill) {
        ctx.fillStyle = anno.style.color
        ctx.globalAlpha = 0.35
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = anno.style.color
      ctx.lineWidth = anno.style.lineWidth
      ctx.stroke()
      break
    }
    case 'highlight': {
      ctx.fillStyle = anno.style.color
      ctx.globalAlpha = 0.4
      ctx.fillRect(anno.rect.x, anno.rect.y, anno.rect.w, anno.rect.h)
      ctx.globalAlpha = 1
      break
    }
    case 'text': {
      ctx.font = `${anno.textStyle.bold ? 'bold ' : ''}${anno.textStyle.size}px sans-serif`
      ctx.fillStyle = anno.textStyle.color
      ctx.textBaseline = 'top'
      // 支持多行
      const lines = anno.text.split('\n')
      lines.forEach((ln, i) => {
        ctx.fillText(ln, anno.pos.x, anno.pos.y + i * (anno.textStyle.size * 1.2))
      })
      break
    }
    case 'mosaic': {
      if (!source) break
      const cell = anno.cell
      const r = anno.rect
      for (let gy = 0; gy < r.h; gy += cell) {
        for (let gx = 0; gx < r.w; gx += cell) {
          const sx = r.x + gx + cell / 2
          const sy = r.y + gy + cell / 2
          if (anno.shape === 'round') {
            // 球状：以当前像素颜色填充圆点，避免采样丢失细节
            const sample = ctx.getImageData(r.x + gx, r.y + gy, 1, 1).data
            ctx.beginPath()
            ctx.arc(r.x + gx + cell / 2, r.y + gy + cell / 2, cell / 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgb(${sample[0]},${sample[1]},${sample[2]})`
            ctx.globalAlpha = 0.9
            ctx.fill()
            ctx.globalAlpha = 1
          } else {
            ctx.drawImage(source, sx, sy, 1, 1, r.x + gx, r.y + gy, cell, cell)
          }
        }
      }
      break
    }
  }
  ctx.restore()
}

// ── 撤销/重做（快照栈） ──

export class History {
  private undoStack: Annotation[][] = []
  private redoStack: Annotation[][] = []

  constructor(private onChange?: () => void) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  push(list: Annotation[]): void {
    this.undoStack.push(clone(list))
    this.redoStack.length = 0
    this.onChange?.()
  }

  undo(currList: Annotation[]): Annotation[] {
    if (!this.undoStack.length) return currList
    this.redoStack.push(clone(currList))
    const prev = this.undoStack.pop()!
    this.onChange?.()
    return prev
  }

  redo(currList: Annotation[]): Annotation[] {
    if (!this.redoStack.length) return currList
    this.undoStack.push(clone(currList))
    const next = this.redoStack.pop()!
    this.onChange?.()
    return next
  }

  reset(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.onChange?.()
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
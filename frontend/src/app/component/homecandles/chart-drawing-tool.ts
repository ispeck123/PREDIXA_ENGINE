import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  Coordinate,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  MouseEventParams,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { ensureDefined } from 'src/assets/JS/assertions';
import { PluginBase } from 'src/assets/JS/plugin-base';

export type ChartDrawingToolType =
  | 'none'
  | 'select'
  | 'vertical'
  | 'horizontal'
  | 'entryPrice'
  | 'targetPrice'
  | 'stoplossPrice'
  | 'trendline'
  | 'rectangle'
  | 'text'
  | 'longPosition'
  | 'shortPosition';

export type ChartDrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface ChartDrawingPoint {
  time: Time;
  price: number;
}

export interface ChartDrawingRecord {
  id: string;
  type: ChartDrawingToolType;
  p1: ChartDrawingPoint;
  p2?: ChartDrawingPoint;

  text?: string;
  color?: string;
  fillColor?: string;
  lineWidth?: number;
  lineStyle?: ChartDrawingLineStyle;
  selected?: boolean;
  locked?: boolean;

  // Text settings
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  backgroundColor?: string;

  // Long / Short / Rectangle settings
  stopPrice?: number;
  targetColor?: string;
  stopColor?: string;
  entryColor?: string;
  fillOpacity?: number;
  showLabels?: boolean;

  // Entry / Target / Stoploss calculated info
  rrText?: string;
  tradeDirection?: 'BUY' | 'SELL' | 'INVALID';

  // Inline validation state for Entry / Target / Stoploss preview and dragging
  isInvalidPlacement?: boolean;
  validationMessage?: string;
}

export type ChartDrawingStylePatch = Partial<
  Pick<
    ChartDrawingRecord,
    | 'text'
    | 'color'
    | 'fillColor'
    | 'lineWidth'
    | 'lineStyle'
    | 'locked'
    | 'fontSize'
    | 'fontWeight'
    | 'backgroundColor'
    | 'targetColor'
    | 'stopColor'
    | 'entryColor'
    | 'fillOpacity'
    | 'showLabels'
  >
>;

interface ViewPoint {
  x: Coordinate | null;
  y: Coordinate | null;
}

interface MousePoint {
  x: number;
  y: number;
}

interface ChartDrawingToolOptions {
  color?: string;
  selectedColor?: string;
  lineWidth?: number;
  lineStyle?: ChartDrawingLineStyle;
  textColor?: string;

  // IMPORTANT:
  // Used to give manual Buy/Sell zones priority over TradingView drawings.
  shouldIgnoreMouseEvent?: (event: MouseEvent) => boolean;

  onCreated?: (item: ChartDrawingRecord) => void;
  onUpdated?: (item: ChartDrawingRecord) => void;
  onDeleted?: (item: ChartDrawingRecord) => void;
  onSelected?: (item: ChartDrawingRecord | null) => void;
  onToolChanged?: (tool: ChartDrawingToolType) => void;

  // Optional external hook. Validation is now shown inline on the chart,
  // so this is not required for normal usage.
  onValidationError?: (message: string) => void;
}

type ChartDrawingMoveMode =
  | 'none'
  | 'body'
  | 'trend-start'
  | 'trend-end'
  | 'rectangle-body'
  | 'rectangle-left'
  | 'rectangle-right'
  | 'rectangle-top'
  | 'rectangle-bottom'
  | 'position-body'
  | 'position-target'
  | 'position-stop'
  | 'position-entry'
  | 'position-right';

class ChartDrawingRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(
    private item: ChartDrawingRecord,
    private p1: ViewPoint,
    private p2: ViewPoint
  ) { }

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => {
      const ctx = scope.context;

      const ratioX = scope.horizontalPixelRatio;
      const ratioY = scope.verticalPixelRatio;

      const paneWidth = scope.bitmapSize.width;
      const paneHeight = scope.bitmapSize.height;

      const selectedColor = '#2563eb';

      const color = this.item.color || '#2563eb';
      const lineWidth = this.item.lineWidth || 2;

      ctx.save();

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lineWidth * ratioX;

      // =========================
      // Vertical Line
      // =========================
      if (this.item.type === 'vertical') {
        if (this.p1.x === null) {
          ctx.restore();
          return;
        }

        const x = Math.round(this.p1.x * ratioX);

        this.applyLineStyle(ctx, this.item.lineStyle || 'solid', ratioX);

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, paneHeight);
        ctx.stroke();

        ctx.setLineDash([]);

        if (this.item.selected) {
          this.drawSelectedSquare(ctx, x, 18 * ratioY, ratioX, selectedColor);
        }

        ctx.restore();
        return;
      }

      // =========================
      // Horizontal Line + Price Label
      // =========================
      if (this.isHorizontalPriceLine()) {
        if (this.p1.y === null) {
          ctx.restore();
          return;
        }

        const y = Math.round(this.p1.y * ratioY);

        const isTradePriceLine = this.isTradePriceLine();
        const isInvalidTradeLine =
          isTradePriceLine && this.item.isInvalidPlacement === true;

        const drawColor = isInvalidTradeLine ? '#9ca3af' : color;

        // Normal horizontal line remains full-width.
        // Entry / Target / Stoploss behave like Trade Tiger order lines:
        // start from clicked candle/time and extend only to the right side.
        const startX =
          isTradePriceLine && this.p1.x !== null
            ? Math.round(this.p1.x * ratioX)
            : 0;

        this.applyLineStyle(ctx, this.item.lineStyle || 'solid', ratioX);

        ctx.strokeStyle = drawColor;
        ctx.fillStyle = drawColor;

        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(paneWidth, y);
        ctx.stroke();

        ctx.setLineDash([]);

        const priceText = this.getHorizontalPriceLabel();
        const fontSize = isTradePriceLine ? 12 * ratioY : 11 * ratioY;

        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(priceText).width;
        const labelPaddingX = isTradePriceLine ? 6 * ratioX : 5 * ratioX;
        const labelHeight = isTradePriceLine ? 20 * ratioY : 18 * ratioY;
        const labelWidth = textWidth + labelPaddingX * 2;

        let labelX: number;
        let labelY: number;
        let textY: number;

        if (isTradePriceLine) {
          // Trade Tiger style:
          // Entry / Target / Stoploss label is shown near the starting candle/time,
          // above the line, not on the far-right price axis.
          labelX = startX + 6 * ratioX;
          labelX = Math.max(
            4 * ratioX,
            Math.min(labelX, paneWidth - labelWidth - 4 * ratioX)
          );

          labelY = y - labelHeight - 6 * ratioY;
          if (labelY < 2 * ratioY) {
            labelY = y + 6 * ratioY;
          }

          textY = labelY + labelHeight / 2;
        } else {
          // Normal horizontal line keeps its old right-side price label.
          labelX = paneWidth - labelWidth - 6 * ratioX;
          labelY = y - labelHeight / 2;
          textY = y;
        }

        ctx.fillStyle = drawColor;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(priceText, labelX + labelPaddingX, textY);

        if (isInvalidTradeLine && this.item.validationMessage) {
          this.drawTradeValidationMessage(
            ctx,
            this.item.validationMessage,
            labelX,
            labelY,
            y,
            paneWidth,
            ratioX,
            ratioY
          );
        }

        if (this.item.selected) {
          const handleX = isTradePriceLine ? startX : 18 * ratioX;
          const handleColor = isInvalidTradeLine ? '#9ca3af' : selectedColor;
          this.drawSelectedSquare(ctx, handleX, y, ratioX, handleColor);
        }

        ctx.restore();
        return;
      }

      // =========================
      // Free / Trend Line
      // =========================
      if (this.item.type === 'trendline') {
        if (
          this.p1.x === null ||
          this.p1.y === null ||
          this.p2.x === null ||
          this.p2.y === null
        ) {
          ctx.restore();
          return;
        }

        const x1 = Math.round(this.p1.x * ratioX);
        const y1 = Math.round(this.p1.y * ratioY);
        const x2 = Math.round(this.p2.x * ratioX);
        const y2 = Math.round(this.p2.y * ratioY);

        ctx.beginPath();

        if (this.item.id === '__trendline_preview__') {
          ctx.setLineDash([6 * ratioX, 4 * ratioX]);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1 * ratioX;
        } else {
          this.applyLineStyle(ctx, this.item.lineStyle || 'solid', ratioX);
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth * ratioX;
        }

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.setLineDash([]);

        if (this.item.selected) {
          ctx.fillStyle = selectedColor;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1 * ratioX;

          ctx.beginPath();
          ctx.arc(x1, y1, 5 * ratioX, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x2, y2, 5 * ratioX, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
        return;
      }

      // =========================
      // Rectangle
      // =========================
      if (this.item.type === 'rectangle') {
        this.drawRectangle(ctx, ratioX, ratioY);
        ctx.restore();
        return;
      }

      // =========================
      // Text
      // =========================
      if (this.item.type === 'text') {
        if (this.p1.x === null || this.p1.y === null) {
          ctx.restore();
          return;
        }

        const x = Math.round(this.p1.x * ratioX);
        const y = Math.round(this.p1.y * ratioY);

        const text = this.item.text || '';

        const fontSize = (this.item.fontSize || 13) * ratioY;
        const fontWeight = this.item.fontWeight || 'normal';

        ctx.font = `${fontWeight} ${fontSize}px Arial`;
        ctx.textBaseline = 'top';

        const width = ctx.measureText(text).width;
        const height = (this.item.fontSize || 13) * 1.35 * ratioY;

        if (this.item.backgroundColor) {
          ctx.fillStyle = this.item.backgroundColor;
          ctx.fillRect(
            x - 4 * ratioX,
            y - 3 * ratioY,
            width + 8 * ratioX,
            height + 6 * ratioY
          );
        }

        ctx.fillStyle = this.item.color || '#111827';
        ctx.fillText(text, x, y);

        if (this.item.selected) {
          ctx.strokeStyle = selectedColor;
          ctx.lineWidth = 1 * ratioX;

          ctx.strokeRect(
            x - 4 * ratioX,
            y - 3 * ratioY,
            width + 8 * ratioX,
            height + 6 * ratioY
          );
        }

        ctx.restore();
        return;
      }

      // =========================
      // Long / Short Position
      // =========================
      if (
        this.item.type === 'longPosition' ||
        this.item.type === 'shortPosition'
      ) {
        this.drawPosition(ctx, ratioX, ratioY);
        ctx.restore();
        return;
      }

      ctx.restore();
    });
  }

  private isHorizontalPriceLine(): boolean {
    return (
      this.item.type === 'horizontal' ||
      this.item.type === 'entryPrice' ||
      this.item.type === 'targetPrice' ||
      this.item.type === 'stoplossPrice'
    );
  }

  private isTradePriceLine(): boolean {
    return (
      this.item.type === 'entryPrice' ||
      this.item.type === 'targetPrice' ||
      this.item.type === 'stoplossPrice'
    );
  }

  private getHorizontalPriceLabel(): string {
    const price = Number(this.item.p1.price).toFixed(2);
    const rrText = this.item.rrText ? ` | ${this.item.rrText}` : '';

    if (this.item.type === 'entryPrice') {
      return `Entry @ ${price}${rrText}`;
    }

    if (this.item.type === 'targetPrice') {
      return `Target @ ${price}${rrText}`;
    }

    if (this.item.type === 'stoplossPrice') {
      return `Stoploss @ ${price}${rrText}`;
    }

    return price;
  }

  private drawTradeValidationMessage(
    ctx: CanvasRenderingContext2D,
    message: string,
    labelX: number,
    labelY: number,
    lineY: number,
    paneWidth: number,
    ratioX: number,
    ratioY: number
  ): void {
    if (!message) return;

    ctx.save();

    const fontSize = 11 * ratioY;
    const paddingX = 6 * ratioX;
    const maxWidth = Math.min(420 * ratioX, paneWidth - 8 * ratioX);

    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = 'middle';

    const messageText = this.truncateCanvasText(
      ctx,
      message,
      maxWidth - paddingX * 2
    );

    const textWidth = ctx.measureText(messageText).width;
    const boxWidth = Math.min(maxWidth, textWidth + paddingX * 2);
    const boxHeight = 22 * ratioY;

    let x = Math.max(4 * ratioX, Math.min(labelX, paneWidth - boxWidth - 4 * ratioX));
    let y = labelY - boxHeight - 5 * ratioY;

    // Prefer above the line. If the chart is too close to the top edge,
    // place it just below the line so it remains readable.
    if (y < 2 * ratioY) {
      y = lineY + 8 * ratioY;
    }

    ctx.fillStyle = '#f3f4f6';
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1 * ratioX;

    ctx.beginPath();
    ctx.rect(x, y, boxWidth, boxHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#374151';
    ctx.fillText(messageText, x + paddingX, y + boxHeight / 2);

    ctx.restore();
  }

  private truncateCanvasText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string {
    if (ctx.measureText(text).width <= maxWidth) return text;

    const ellipsis = '...';
    let result = text;

    while (result.length > 0 && ctx.measureText(result + ellipsis).width > maxWidth) {
      result = result.slice(0, -1);
    }

    return result ? result + ellipsis : ellipsis;
  }

  private drawRectangle(
    ctx: CanvasRenderingContext2D,
    ratioX: number,
    ratioY: number
  ): void {
    if (
      this.p1.x === null ||
      this.p1.y === null ||
      this.p2.x === null ||
      this.p2.y === null
    ) {
      return;
    }

    const x1 = Math.round(this.p1.x * ratioX);
    const y1 = Math.round(this.p1.y * ratioY);
    const x2 = Math.round(this.p2.x * ratioX);
    const y2 = Math.round(this.p2.y * ratioY);

    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) return;

    const borderColor = this.item.color || '#2563eb';
    const opacity = this.item.fillOpacity ?? 0.18;
    const fillColor = this.item.fillColor || this.toRgba(borderColor, opacity);

    ctx.fillStyle = fillColor;
    ctx.fillRect(left, top, width, height);

    this.applyLineStyle(ctx, this.item.lineStyle || 'solid', ratioX);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = (this.item.lineWidth || 2) * ratioX;
    ctx.strokeRect(left, top, width, height);

    ctx.setLineDash([]);

    if (this.item.selected) {
      const selectedColor = '#2563eb';
      const handleSize = 5 * ratioX;

      ctx.fillStyle = selectedColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 * ratioX;

      const handles = [
        { x: left, y: top },
        { x: right, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
      ];

      handles.forEach(h => {
        ctx.beginPath();
        ctx.rect(
          h.x - handleSize,
          h.y - handleSize,
          handleSize * 2,
          handleSize * 2
        );
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  private drawPosition(
    ctx: CanvasRenderingContext2D,
    ratioX: number,
    ratioY: number
  ): void {
    if (
      this.p1.x === null ||
      this.p1.y === null ||
      this.p2.x === null ||
      this.p2.y === null ||
      this.item.stopPrice === undefined
    ) {
      return;
    }

    const stopYCoordinate = (this as any).getStopYCoordinate
      ? (this as any).getStopYCoordinate()
      : null;

    if (stopYCoordinate === null) return;

    const x1 = Math.round(this.p1.x * ratioX);
    const x2 = Math.round(this.p2.x * ratioX);

    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const width = Math.abs(right - left);

    if (width <= 0) return;

    const entryPrice = this.item.p1.price;
    const targetPrice = this.item.p2?.price ?? entryPrice;
    const stopPrice = this.item.stopPrice;

    const yEntry = Math.round(this.p1.y * ratioY);
    const yTarget = Math.round(this.p2.y! * ratioY);
    const yStop = Math.round(stopYCoordinate * ratioY);

    const selectedColor = '#2563eb';

    const targetColor = this.item.targetColor || '#10b981';
    const stopColor = this.item.stopColor || '#f43f5e';
    const entryColor = this.item.entryColor || '#14b8a6';
    const opacity = this.item.fillOpacity ?? 0.25;

    const targetFill = this.toRgba(targetColor, opacity);
    const stopFill = this.toRgba(stopColor, opacity);

    // Profit zone
    const profitTop = Math.min(yEntry, yTarget);
    const profitBottom = Math.max(yEntry, yTarget);

    ctx.fillStyle = targetFill;
    ctx.fillRect(left, profitTop, width, profitBottom - profitTop);

    ctx.strokeStyle = targetColor;
    ctx.lineWidth = (this.item.lineWidth || 2) * ratioX;
    ctx.strokeRect(left, profitTop, width, profitBottom - profitTop);

    // Risk zone
    const riskTop = Math.min(yEntry, yStop);
    const riskBottom = Math.max(yEntry, yStop);

    ctx.fillStyle = stopFill;
    ctx.fillRect(left, riskTop, width, riskBottom - riskTop);

    ctx.strokeStyle = stopColor;
    ctx.lineWidth = (this.item.lineWidth || 2) * ratioX;
    ctx.strokeRect(left, riskTop, width, riskBottom - riskTop);

    // Entry line
    this.applyLineStyle(ctx, this.item.lineStyle || 'solid', ratioX);

    ctx.strokeStyle = entryColor;
    ctx.lineWidth = (this.item.lineWidth || 2) * ratioX;
    ctx.beginPath();
    ctx.moveTo(left, yEntry);
    ctx.lineTo(right, yEntry);
    ctx.stroke();

    ctx.setLineDash([]);

    const showLabels = this.item.showLabels !== false;

    if (showLabels) {
      const profitPercent =
        this.item.type === 'longPosition'
          ? ((targetPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - targetPrice) / entryPrice) * 100;

      const riskPercent =
        this.item.type === 'longPosition'
          ? ((entryPrice - stopPrice) / entryPrice) * 100
          : ((stopPrice - entryPrice) / entryPrice) * 100;

      const reward = Math.abs(targetPrice - entryPrice);
      const risk = Math.abs(entryPrice - stopPrice);
      const rr = risk > 0 ? reward / risk : 0;

      const targetText = `Target: ${reward.toFixed(
        2
      )} (${profitPercent.toFixed(2)}%) ${targetPrice.toFixed(2)}`;

      const stopText = `Stop: ${risk.toFixed(2)} (${riskPercent.toFixed(
        2
      )}%) ${stopPrice.toFixed(2)}`;

      const entryText = `Risk/reward ratio: ${rr.toFixed(2)}`;

      this.drawLabel(
        ctx,
        targetText,
        left + 20 * ratioX,
        yTarget - 22 * ratioY,
        targetColor,
        ratioX,
        ratioY
      );

      this.drawLabel(
        ctx,
        entryText,
        left + width / 2 - 60 * ratioX,
        yEntry - 14 * ratioY,
        entryColor,
        ratioX,
        ratioY
      );

      this.drawLabel(
        ctx,
        stopText,
        left + 20 * ratioX,
        yStop + 4 * ratioY,
        stopColor,
        ratioX,
        ratioY
      );
    }

    // Selected handles
    if (this.item.selected) {
      ctx.fillStyle = selectedColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 * ratioX;

      const handleSize = 5 * ratioX;

      const handles = [
        { x: left, y: yEntry },
        { x: right, y: yEntry },
        { x: right, y: yTarget },
        { x: right, y: yStop },
      ];

      handles.forEach(h => {
        ctx.beginPath();
        ctx.rect(
          h.x - handleSize,
          h.y - handleSize,
          handleSize * 2,
          handleSize * 2
        );
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    bgColor: string,
    ratioX: number,
    ratioY: number
  ): void {
    ctx.save();

    ctx.font = `${12 * ratioY}px Arial`;
    ctx.textBaseline = 'top';

    const paddingX = 5 * ratioX;
    const paddingY = 3 * ratioY;
    const textWidth = ctx.measureText(text).width;
    const height = 18 * ratioY;

    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, textWidth + paddingX * 2, height);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + paddingX, y + paddingY);

    ctx.restore();
  }

  private drawSelectedSquare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    ratioX: number,
    color: string
  ): void {
    const size = 5 * ratioX;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * ratioX;

    ctx.beginPath();
    ctx.rect(x - size, y - size, size * 2, size * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private applyLineStyle(
    ctx: CanvasRenderingContext2D,
    style: ChartDrawingLineStyle,
    ratioX: number
  ): void {
    if (style === 'dashed') {
      ctx.setLineDash([8 * ratioX, 5 * ratioX]);
    } else if (style === 'dotted') {
      ctx.setLineDash([2 * ratioX, 5 * ratioX]);
    } else {
      ctx.setLineDash([]);
    }
  }

  private toRgba(color: string, opacity: number): string {
    if (!color) return `rgba(0,0,0,${opacity})`;

    if (color.startsWith('rgba')) return color;

    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
    }

    if (color.startsWith('#')) {
      let hex = color.replace('#', '');

      if (hex.length === 3) {
        hex = hex
          .split('')
          .map(x => x + x)
          .join('');
      }

      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
    }

    return color;
  }
}

class ChartDrawingPaneView implements ISeriesPrimitivePaneView {
  private p1: ViewPoint = { x: null, y: null };
  private p2: ViewPoint = { x: null, y: null };

  constructor(private source: ChartDrawingPrimitive) { }

  update() {
    const chart = this.source.chart;
    const series = this.source.series;
    const item = this.source.item;

    const timeScale = chart.timeScale();

    const x1 = timeScale.timeToCoordinate(item.p1.time);
    const y1 = series.priceToCoordinate(item.p1.price);

    this.p1 = {
      x: x1,
      y: y1,
    };

    if (item.p2) {
      const x2 = timeScale.timeToCoordinate(item.p2.time);
      const y2 = series.priceToCoordinate(item.p2.price);

      this.p2 = {
        x: x2,
        y: y2,
      };
    } else {
      this.p2 = {
        x: null,
        y: null,
      };
    }
  }

  renderer() {
    const renderer = new ChartDrawingRenderer(
      this.source.item,
      this.p1,
      this.p2
    );

    (renderer as any).getStopYCoordinate = () => {
      if (this.source.item.stopPrice === undefined) return null;
      return this.source.series.priceToCoordinate(this.source.item.stopPrice);
    };

    return renderer;
  }
}

class ChartDrawingPrimitive extends PluginBase {
  private paneViewsArr: ChartDrawingPaneView[];

  constructor(public item: ChartDrawingRecord) {
    super();
    this.paneViewsArr = [new ChartDrawingPaneView(this)];
  }

  updateAllViews() {
    this.paneViewsArr.forEach(view => view.update());
  }

  paneViews() {
    return this.paneViewsArr;
  }

  updateItem(item: ChartDrawingRecord) {
    this.item = item;
    this.updateAllViews();
    this.requestUpdate();
  }
}

interface StoredDrawing {
  item: ChartDrawingRecord;
  primitive: ChartDrawingPrimitive;
}

export class ChartDrawingTool {
  private activeTool: ChartDrawingToolType = 'none';

  private drawings: StoredDrawing[] = [];
  private selectedDrawing: StoredDrawing | null = null;

  private pendingTrendStart: ChartDrawingPoint | null = null;
  private previewTrendDrawing: StoredDrawing | null = null;

  private pendingRectangleStart: ChartDrawingPoint | null = null;
  private previewRectangleDrawing: StoredDrawing | null = null;

  private previewTradePriceDrawing: StoredDrawing | null = null;

  private isRectangleDrawing = false;
  private rectangleStartMousePoint: MousePoint | null = null;

  private lastPoint: ChartDrawingPoint | null = null;

  private isMoving = false;
  private moveStartPoint: ChartDrawingPoint | null = null;
  private moveStartMousePoint: MousePoint | null = null;
  private moveOriginalItem: ChartDrawingRecord | null = null;
  private hasMoved = false;
  private moveMode: ChartDrawingMoveMode = 'none';

  private selectionEnabled = true;

  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<SeriesType>,
    private chartContainer: HTMLElement,
    private options: ChartDrawingToolOptions = {}
  ) {
    this.chart.subscribeCrosshairMove(this.onCrosshairMove);

    this.chartContainer.addEventListener('mousedown', this.onMouseDown);
    this.chartContainer.addEventListener('click', this.onClick);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  setSelectionEnabled(enabled: boolean): void {
    this.selectionEnabled = enabled;

    if (!enabled) {
      this.selectDrawing(null);
      this.isMoving = false;
      this.moveStartPoint = null;
      this.moveStartMousePoint = null;
      this.moveOriginalItem = null;
      this.hasMoved = false;
      this.moveMode = 'none';

      this.pendingRectangleStart = null;
      this.previewRectangleDrawing = null;
      this.removeTradePricePreview();
      this.isRectangleDrawing = false;
      this.rectangleStartMousePoint = null;

      this.chartContainer.style.cursor = 'default';
      this.setChartDragEnabled(true);
    }
  }

  setActiveTool(tool: ChartDrawingToolType) {
    this.activeTool = tool;

    if (tool !== 'trendline') {
      this.pendingTrendStart = null;
      this.removeTrendPreview();
      this.setChartDragEnabled(true);
    }

    if (tool !== 'rectangle') {
      this.pendingRectangleStart = null;
      this.isRectangleDrawing = false;
      this.rectangleStartMousePoint = null;
      this.removeRectanglePreview();
      this.setChartDragEnabled(true);
    }

    if (!this.isTradePriceToolType(tool)) {
      this.removeTradePricePreview();
    }

    if (tool !== 'select') {
      this.selectDrawing(null);
    }

    if (tool === 'none' || tool === 'select') {
      this.chartContainer.style.cursor = 'default';
    } else {
      this.chartContainer.style.cursor = 'crosshair';
    }

    this.options.onToolChanged?.(tool);
  }

  getActiveTool(): ChartDrawingToolType {
    return this.activeTool;
  }

  getSelectedDrawing(): ChartDrawingRecord | null {
    if (!this.selectedDrawing) return null;
    return JSON.parse(JSON.stringify(this.selectedDrawing.item));
  }

  updateSelectedStyle(style: ChartDrawingStylePatch): ChartDrawingRecord | null {
    if (!this.selectedDrawing) return null;

    const item = this.selectedDrawing.item;

    this.selectedDrawing.item = {
      ...item,
      ...style,
    };

    this.selectedDrawing.primitive.updateItem({
      ...this.selectedDrawing.item,
      selected: true,
    });

    this.options.onUpdated?.(this.selectedDrawing.item);
    this.options.onSelected?.(this.selectedDrawing.item);

    this.forceUpdate();

    return JSON.parse(JSON.stringify(this.selectedDrawing.item));
  }

  duplicateSelected(): ChartDrawingRecord | null {
    if (!this.selectedDrawing) return null;

    const original = this.selectedDrawing.item;

    const copy: ChartDrawingRecord = JSON.parse(JSON.stringify(original));

    copy.id = this.createId();
    copy.selected = false;
    copy.locked = false;

    const deltaX = 30;
    const deltaY = 24;

    copy.p1 = {
      time: this.shiftTimeByPixel(original.p1.time, deltaX),
      price: this.shiftPriceByPixel(original.p1.price, deltaY),
    };

    if (original.p2) {
      copy.p2 = {
        time: this.shiftTimeByPixel(original.p2.time, deltaX),
        price: this.shiftPriceByPixel(original.p2.price, deltaY),
      };
    }

    if (original.stopPrice !== undefined) {
      copy.stopPrice = this.shiftPriceByPixel(original.stopPrice, deltaY);
    }

    const created = this.addDrawing(copy);

    this.options.onCreated?.(created);

    return JSON.parse(JSON.stringify(created));
  }

  addDrawing(item: ChartDrawingRecord): ChartDrawingRecord {
    const normalized: ChartDrawingRecord = {
      ...item,
      id: item.id || this.createId(),
      color: item.color || this.options.color || '#2563eb',
      lineWidth: item.lineWidth ?? this.options.lineWidth ?? 2,
      lineStyle: item.lineStyle || this.options.lineStyle || 'solid',
      selected: false,
      locked: item.locked ?? false,
      showLabels: item.showLabels ?? true,
    };

    const primitive = new ChartDrawingPrimitive(normalized);

    this.drawings.push({
      item: normalized,
      primitive,
    });

    ensureDefined(this.series).attachPrimitive(primitive);

    return normalized;
  }

  removeAll() {
    this.removeTrendPreview();
    this.removeRectanglePreview();
    this.removeTradePricePreview();

    this.drawings.forEach(d => {
      try {
        this.series.detachPrimitive(d.primitive);
      } catch { }
    });

    this.drawings = [];
    this.selectedDrawing = null;
    this.pendingTrendStart = null;
    this.pendingRectangleStart = null;
    this.isRectangleDrawing = false;
    this.rectangleStartMousePoint = null;
    this.moveMode = 'none';
  }

  destroy() {
    this.removeAll();

    try {
      this.chart.unsubscribeCrosshairMove(this.onCrosshairMove);
    } catch { }

    try {
      this.chartContainer.removeEventListener('mousedown', this.onMouseDown);
      this.chartContainer.removeEventListener('click', this.onClick);
      window.removeEventListener('mouseup', this.onMouseUp);
    } catch { }

    this.chartContainer.style.cursor = 'default';
    this.setChartDragEnabled(true);
  }

  deleteSelected(): boolean {
    if (!this.selectionEnabled) return false;
    if (!this.selectedDrawing) return false;

    if (this.selectedDrawing.item.locked) {
      return false;
    }

    const deleted = this.selectedDrawing.item;

    // Trade Tiger validation rule:
    // Entry is the parent line. If Entry is deleted, Target and Stoploss
    // must also be removed automatically to avoid an incomplete trade setup.
    if (deleted.type === 'entryPrice') {
      return this.deleteEntryTradeGroup();
    }

    try {
      this.series.detachPrimitive(this.selectedDrawing.primitive);
    } catch { }

    this.drawings = this.drawings.filter(d => d.item.id !== deleted.id);
    this.selectedDrawing = null;
    this.moveMode = 'none';

    if (this.isTradePriceToolType(deleted.type)) {
      this.refreshTradePriceMetrics();
    }

    this.options.onDeleted?.(deleted);
    this.options.onSelected?.(null);

    this.forceUpdate();

    return true;
  }

  private deleteEntryTradeGroup(): boolean {
    const tradeTypes = new Set<ChartDrawingToolType>([
      'entryPrice',
      'targetPrice',
      'stoplossPrice',
    ]);

    const toDelete = this.drawings.filter(d => tradeTypes.has(d.item.type));

    if (!toDelete.length) return false;

    toDelete.forEach(d => {
      try {
        this.series.detachPrimitive(d.primitive);
      } catch { }

      this.options.onDeleted?.(d.item);
    });

    this.drawings = this.drawings.filter(d => !tradeTypes.has(d.item.type));
    this.selectedDrawing = null;
    this.moveMode = 'none';

    this.refreshTradePriceMetrics();
    this.options.onSelected?.(null);
    this.forceUpdate();

    return true;
  }

  private finishOneShotTool(): void {
    this.pendingTrendStart = null;

    this.pendingRectangleStart = null;
    this.isRectangleDrawing = false;
    this.rectangleStartMousePoint = null;

    this.removeTrendPreview();
    this.removeRectanglePreview();
    this.removeTradePricePreview();

    this.setChartDragEnabled(true);
    this.setActiveTool('select');
  }

  private createOrUpdateTrendPreview(
    start: ChartDrawingPoint,
    end: ChartDrawingPoint
  ): void {
    const previewItem: ChartDrawingRecord = {
      id: '__trendline_preview__',
      type: 'trendline',
      p1: start,
      p2: end,
      color: '#64748b',
      lineWidth: 2,
      lineStyle: 'dashed',
      selected: false,
    };

    if (!this.previewTrendDrawing) {
      const primitive = new ChartDrawingPrimitive(previewItem);

      this.previewTrendDrawing = {
        item: previewItem,
        primitive,
      };

      ensureDefined(this.series).attachPrimitive(primitive);
    } else {
      this.previewTrendDrawing.item = previewItem;
      this.previewTrendDrawing.primitive.updateItem(previewItem);
    }
  }

  private removeTrendPreview(): void {
    if (!this.previewTrendDrawing) return;

    try {
      this.series.detachPrimitive(this.previewTrendDrawing.primitive);
    } catch { }

    this.previewTrendDrawing = null;

    this.forceUpdate();
  }

  private createOrUpdateRectanglePreview(
    start: ChartDrawingPoint,
    end: ChartDrawingPoint
  ): void {
    const previewItem: ChartDrawingRecord = {
      id: '__rectangle_preview__',
      type: 'rectangle',
      p1: start,
      p2: end,
      color: '#64748b',
      fillColor: 'rgba(100, 116, 139, 0.16)',
      lineWidth: 2,
      lineStyle: 'dashed',
      fillOpacity: 0.16,
      selected: false,
    };

    if (!this.previewRectangleDrawing) {
      const primitive = new ChartDrawingPrimitive(previewItem);

      this.previewRectangleDrawing = {
        item: previewItem,
        primitive,
      };

      ensureDefined(this.series).attachPrimitive(primitive);
    } else {
      this.previewRectangleDrawing.item = previewItem;
      this.previewRectangleDrawing.primitive.updateItem(previewItem);
    }
  }

  private removeRectanglePreview(): void {
    if (!this.previewRectangleDrawing) return;

    try {
      this.series.detachPrimitive(this.previewRectangleDrawing.primitive);
    } catch { }

    this.previewRectangleDrawing = null;

    this.forceUpdate();
  }

  private createOrUpdateTradePricePreview(
    tool: 'entryPrice' | 'targetPrice' | 'stoplossPrice',
    point: ChartDrawingPoint
  ): void {
    const validation = this.validateTradePricePlacement(tool, point.price);
    const isInvalid = !validation.valid;

    const previewItem: ChartDrawingRecord = {
      id: `__${tool}_preview__`,
      type: tool,
      p1: point,
      color: isInvalid
        ? this.getTradePriceDisabledColor()
        : this.getTradePriceToolColor(tool),
      lineWidth: 2,
      lineStyle: 'dashed',
      selected: false,
      isInvalidPlacement: isInvalid,
      validationMessage: isInvalid ? validation.message : undefined,
    };

    this.chartContainer.style.cursor = isInvalid ? 'not-allowed' : 'crosshair';

    if (!this.previewTradePriceDrawing) {
      const primitive = new ChartDrawingPrimitive(previewItem);

      this.previewTradePriceDrawing = {
        item: previewItem,
        primitive,
      };

      ensureDefined(this.series).attachPrimitive(primitive);
    } else {
      this.previewTradePriceDrawing.item = previewItem;
      this.previewTradePriceDrawing.primitive.updateItem(previewItem);
    }
  }

  private removeTradePricePreview(): void {
    if (!this.previewTradePriceDrawing) return;

    try {
      this.series.detachPrimitive(this.previewTradePriceDrawing.primitive);
    } catch { }

    this.previewTradePriceDrawing = null;

    this.forceUpdate();
  }

  private onCrosshairMove = (param: MouseEventParams) => {
    if (!param.point || !param.time) return;

    const price = this.series.coordinateToPrice(param.point.y);
    if (price === null) return;

    this.lastPoint = {
      time: param.time,
      price,
    };

    if (this.isTradePriceToolType(this.activeTool) && !this.isMoving) {
      this.createOrUpdateTradePricePreview(this.activeTool, this.lastPoint);
      this.updateCursor(param.point.x, param.point.y);
      return;
    }

    if (
      this.activeTool === 'trendline' &&
      this.pendingTrendStart &&
      !this.isMoving
    ) {
      this.createOrUpdateTrendPreview(this.pendingTrendStart, this.lastPoint);
      return;
    }

    if (
      this.activeTool === 'rectangle' &&
      this.isRectangleDrawing &&
      this.pendingRectangleStart &&
      !this.isMoving
    ) {
      this.createOrUpdateRectanglePreview(
        this.pendingRectangleStart,
        this.lastPoint
      );
      return;
    }

    if (
      this.selectionEnabled &&
      this.isMoving &&
      this.selectedDrawing &&
      this.moveStartPoint &&
      this.moveStartMousePoint &&
      this.moveOriginalItem
    ) {
      this.applyMoveOrEdit(this.lastPoint, {
        x: Number(param.point.x),
        y: Number(param.point.y),
      });

      this.hasMoved = true;
      return;
    }

    this.updateCursor(param.point.x, param.point.y);
  };

  //   private onMouseDown = (event: MouseEvent) => {
  //   if (!this.selectionEnabled) return;

  //   // =========================
  //   // Rectangle tool
  //   // TradingView-style drag create
  //   // =========================
  //   if (this.activeTool === 'rectangle') {
  //     const point = this.getPointFromMouseEvent(event);
  //     if (!point) return;

  //     event.preventDefault();
  //     event.stopPropagation();

  //     this.pendingRectangleStart = point;
  //     this.rectangleStartMousePoint = this.getMousePointFromEvent(event);
  //     this.isRectangleDrawing = true;

  //     this.removeRectanglePreview();
  //     this.createOrUpdateRectanglePreview(point, point);

  //     this.setChartDragEnabled(false);

  //     return;
  //   }

  //   // Move/select/edit only in Select / Move mode
  //   if (this.activeTool !== 'select') return;

  //   // IMPORTANT:
  //   // If mouse is on manual Buy/Sell zone, do not let chartDrawingTool
  //   // capture this click. ManualRectangleTool should get priority.
  //   if (this.options.shouldIgnoreMouseEvent?.(event)) {
  //     this.selectDrawing(null);
  //     this.isMoving = false;
  //     this.hasMoved = false;
  //     this.moveMode = 'none';
  //     this.setChartDragEnabled(true);
  //     return;
  //   }

  //   const point = this.getPointFromMouseEvent(event);
  //   if (!point) return;

  //   const found = this.findDrawingAtMouseEvent(event);

  //   if (!found) {
  //     this.selectDrawing(null);
  //     return;
  //   }

  //   event.preventDefault();
  //   event.stopPropagation();

  //   this.selectDrawing(found);

  //   if (found.item.locked) {
  //     this.isMoving = false;
  //     this.setChartDragEnabled(true);
  //     return;
  //   }

  //   this.isMoving = true;
  //   this.hasMoved = false;
  //   this.moveStartPoint = point;
  //   this.moveStartMousePoint = this.getMousePointFromEvent(event);
  //   this.moveOriginalItem = JSON.parse(JSON.stringify(found.item));
  //   this.moveMode = this.getMoveModeForDrawing(found, event);

  //   this.setChartDragEnabled(false);
  // };
  private onMouseDown = (event: MouseEvent) => {
    if (!this.selectionEnabled) return;

    // =========================
    // Rectangle tool
    // TradingView-style drag create
    // =========================
    if (this.activeTool === 'rectangle') {
      const point = this.getPointFromMouseEvent(event);
      if (!point) return;

      event.preventDefault();
      event.stopPropagation();

      this.pendingRectangleStart = point;
      this.rectangleStartMousePoint = this.getMousePointFromEvent(event);
      this.isRectangleDrawing = true;

      this.removeRectanglePreview();
      this.createOrUpdateRectanglePreview(point, point);

      this.setChartDragEnabled(false);

      return;
    }

    // Move/select/edit only in Select / Move mode
    if (this.activeTool !== 'select') return;

    const point = this.getPointFromMouseEvent(event);
    if (!point) return;

    // IMPORTANT FIX:
    // First check if mouse is on any TradingView / Trade Tiger drawing.
    // If yes, that drawing should get priority even when it is inside a manual Buy/Sell zone.
    const found = this.findDrawingAtMouseEvent(event);

    // If no chart drawing is found, then allow manual Buy/Sell zone to take priority.
    if (!found && this.options.shouldIgnoreMouseEvent?.(event)) {
      this.selectDrawing(null);
      this.isMoving = false;
      this.hasMoved = false;
      this.moveMode = 'none';
      this.setChartDragEnabled(true);
      return;
    }

    if (!found) {
      this.selectDrawing(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.selectDrawing(found);

    if (found.item.locked) {
      this.isMoving = false;
      this.setChartDragEnabled(true);
      return;
    }

    this.isMoving = true;
    this.hasMoved = false;
    this.moveStartPoint = point;
    this.moveStartMousePoint = this.getMousePointFromEvent(event);
    this.moveOriginalItem = JSON.parse(JSON.stringify(found.item));
    this.moveMode = this.getMoveModeForDrawing(found, event);

    this.setChartDragEnabled(false);
  };

  private onMouseUp = (event: MouseEvent) => {
    // =========================
    // Finish Rectangle Drag Drawing
    // =========================
    if (
      this.activeTool === 'rectangle' &&
      this.isRectangleDrawing &&
      this.pendingRectangleStart
    ) {
      const endPoint = this.getPointFromMouseEvent(event) || this.lastPoint;

      const startMouse = this.rectangleStartMousePoint;
      const endMouse = this.getMousePointFromEvent(event);

      this.removeRectanglePreview();

      if (!endPoint || !startMouse) {
        this.pendingRectangleStart = null;
        this.isRectangleDrawing = false;
        this.rectangleStartMousePoint = null;
        this.setChartDragEnabled(true);
        return;
      }

      const dragDistance = Math.hypot(
        endMouse.x - startMouse.x,
        endMouse.y - startMouse.y
      );

      // Prevent accidental tiny rectangle
      if (dragDistance < 6) {
        this.pendingRectangleStart = null;
        this.isRectangleDrawing = false;
        this.rectangleStartMousePoint = null;
        this.setChartDragEnabled(true);
        return;
      }

      const item = this.addDrawing({
        id: this.createId(),
        type: 'rectangle',
        p1: this.pendingRectangleStart,
        p2: endPoint,
        color: '#2563eb',
        lineWidth: 2,
        lineStyle: 'solid',
        fillOpacity: 0.18,
        selected: false,
      });

      this.options.onCreated?.(item);

      this.finishOneShotTool();

      return;
    }

    // =========================
    // Normal move/edit mouseup
    // =========================
    if (!this.isMoving) return;

    const updated = this.selectedDrawing?.item || null;
    const selectedDrawingRef = this.selectedDrawing;
    const originalBeforeMove = this.moveOriginalItem
      ? JSON.parse(JSON.stringify(this.moveOriginalItem))
      : null;

    this.isMoving = false;
    this.moveStartPoint = null;
    this.moveStartMousePoint = null;
    this.moveOriginalItem = null;
    this.moveMode = 'none';

    this.setChartDragEnabled(true);
    this.chartContainer.style.cursor = 'default';

    if (updated && this.hasMoved) {
      if (this.isTradePriceToolType(updated.type)) {
        const validation = this.validateCurrentTradePriceSetup(updated.type);

        if (!validation.valid && selectedDrawingRef && originalBeforeMove) {
          selectedDrawingRef.item = {
            ...originalBeforeMove,
            selected: true,
            isInvalidPlacement: false,
            validationMessage: undefined,
          };

          selectedDrawingRef.primitive.updateItem({
            ...selectedDrawingRef.item,
            selected: true,
          });

          this.refreshTradePriceMetrics();
          this.forceUpdate();
        } else {
          this.refreshTradePriceMetrics();
          this.options.onUpdated?.(updated);
        }
      } else {
        this.options.onUpdated?.(updated);
      }
    }

    this.hasMoved = false;
  };

  private onClick = (event: MouseEvent) => {
    if (this.isMoving || this.hasMoved) return;

    const point = this.getPointFromMouseEvent(event);
    if (!point) return;



    // =========================
    // Vertical Line
    // =========================
    if (this.activeTool === 'vertical') {
      const item = this.addDrawing({
        id: this.createId(),
        type: 'vertical',
        p1: point,
        color: '#2563eb',
        lineWidth: 2,
        lineStyle: 'solid',
      });

      this.options.onCreated?.(item);

      this.finishOneShotTool();
      return;
    }

    // =========================
    // Horizontal Line
    // =========================
    if (this.activeTool === 'horizontal') {
      const item = this.addDrawing({
        id: this.createId(),
        type: 'horizontal',
        p1: point,
        color: '#2563eb',
        lineWidth: 2,
        lineStyle: 'solid',
      });

      this.options.onCreated?.(item);

      this.finishOneShotTool();
      return;
    }

    // =========================
    // Entry / Target / Stoploss Price Tools
    // =========================
    if (this.isTradePriceToolType(this.activeTool)) {
      const validation = this.validateTradePricePlacement(
        this.activeTool,
        point.price
      );

      if (!validation.valid) {
        // Placement is disabled while invalid.
        // The preview line itself shows the readable message and stays gray.
        this.createOrUpdateTradePricePreview(this.activeTool, point);
        return;
      }

      // Keep only one Entry, one Target, and one Stoploss line on chart.
      this.removeDrawingsByType(this.activeTool);
      this.removeTradePricePreview();

      const item = this.addDrawing({
        id: this.createId(),
        type: this.activeTool,
        p1: point,
        color: this.getTradePriceToolColor(this.activeTool),
        lineWidth: 2,
        lineStyle: 'solid',
      });

      this.refreshTradePriceMetrics();
      this.options.onCreated?.(item);

      this.finishOneShotTool();
      return;
    }

    // =========================
    // Free / Trend Line
    // =========================
    if (this.activeTool === 'trendline') {
      if (!this.pendingTrendStart) {
        this.pendingTrendStart = point;

        this.setChartDragEnabled(false);

        this.createOrUpdateTrendPreview(point, point);

        return;
      }

      this.removeTrendPreview();

      const item = this.addDrawing({
        id: this.createId(),
        type: 'trendline',
        p1: this.pendingTrendStart,
        p2: point,
        color: '#2563eb',
        lineWidth: 2,
        lineStyle: 'solid',
      });

      this.pendingTrendStart = null;

      this.options.onCreated?.(item);

      this.finishOneShotTool();
      return;
    }

    // IMPORTANT:
    // Rectangle is handled by mouse down / mouse move / mouse up.
    // Do not create rectangle here.

    // =========================
    // Text
    // =========================
    if (this.activeTool === 'text') {
      const text = window.prompt('Enter text');

      if (!text || !text.trim()) {
        this.finishOneShotTool();
        return;
      }

      const item = this.addDrawing({
        id: this.createId(),
        type: 'text',
        p1: point,
        text: text.trim(),
        color: '#111827',
        lineWidth: 2,
        fontSize: 13,
        fontWeight: 'normal',
      });

      this.options.onCreated?.(item);

      this.finishOneShotTool();
      return;
    }

    // =========================
    // Long / Short Position
    // TradingView-style:
    // One click creates default position box.
    // =========================
    if (this.activeTool === 'longPosition' || this.activeTool === 'shortPosition') {
      const item = this.addDrawing(
        this.buildDefaultPositionItem(
          this.createId(),
          this.activeTool,
          point,
          event
        )
      );

      this.options.onCreated?.(item);

      this.finishOneShotTool();
      return;
    }

    if (this.selectionEnabled && this.activeTool === 'select') {
      // IMPORTANT FIX:
      // First check TradingView / Trade Tiger drawings.
      // This allows text, rectangle, entry, target, stoploss, etc.
      // to be selected even if they are drawn inside a manual Buy/Sell zone.
      const found = this.findDrawingAtMouseEvent(event);

      // If no chart drawing is found, then manual Buy/Sell zone can take priority.
      if (!found && this.options.shouldIgnoreMouseEvent?.(event)) {
        this.selectDrawing(null);
        return;
      }

      this.selectDrawing(found);
    }
    // if (this.selectionEnabled && this.activeTool === 'select') {
    //   // IMPORTANT:
    //   // If click is on manual Buy/Sell zone,
    //   // chartDrawingTool should ignore it.
    //   if (this.options.shouldIgnoreMouseEvent?.(event)) {
    //     this.selectDrawing(null);
    //     return;
    //   }

    //   const found = this.findDrawingAtMouseEvent(event);
    //   this.selectDrawing(found);
    // }
  };



  getTradePriceValues(): {
    entry: number | null;
    target: number | null;
    stoploss: number | null;
    reward: number | null;
    risk: number | null;
    rr: number | null;
    direction: 'BUY' | 'SELL' | 'INVALID' | null;
  } {
    const entryDrawing = this.drawings.find(d => d.item.type === 'entryPrice');
    const targetDrawing = this.drawings.find(d => d.item.type === 'targetPrice');
    const stoplossDrawing = this.drawings.find(d => d.item.type === 'stoplossPrice');

    const entry = entryDrawing ? Number(Number(entryDrawing.item.p1.price).toFixed(2)) : null;
    const target = targetDrawing ? Number(Number(targetDrawing.item.p1.price).toFixed(2)) : null;
    const stoploss = stoplossDrawing ? Number(Number(stoplossDrawing.item.p1.price).toFixed(2)) : null;

    const metrics = this.calculateTradePriceMetrics(entry, target, stoploss);

    return {
      entry,
      target,
      stoploss,
      reward: metrics.reward,
      risk: metrics.risk,
      rr: metrics.rr,
      direction: metrics.direction,
    };
  }

  private calculateTradePriceMetrics(
    entry: number | null,
    target: number | null,
    stoploss: number | null
  ): {
    reward: number | null;
    risk: number | null;
    rr: number | null;
    direction: 'BUY' | 'SELL' | 'INVALID' | null;
  } {
    if (entry === null || target === null || stoploss === null) {
      return { reward: null, risk: null, rr: null, direction: null };
    }

    let direction: 'BUY' | 'SELL' | 'INVALID' = 'INVALID';

    if (target > entry && stoploss < entry) {
      direction = 'BUY';
    } else if (target < entry && stoploss > entry) {
      direction = 'SELL';
    }

    const reward = Math.abs(target - entry);
    const risk = Math.abs(entry - stoploss);
    const rr = risk > 0 && direction !== 'INVALID' ? reward / risk : null;

    return {
      reward: Number(reward.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      rr: rr === null ? null : Number(rr.toFixed(2)),
      direction,
    };
  }

  private validateTradePricePlacement(
    type: 'entryPrice' | 'targetPrice' | 'stoplossPrice',
    price: number
  ): { valid: boolean; message: string } {
    const prices = this.getTradePriceSnapshot({ type, price });

    return this.validateTradePriceValues(
      prices.entry,
      prices.target,
      prices.stoploss,
      type
    );
  }

  private validateCurrentTradePriceSetup(
    changedType: 'entryPrice' | 'targetPrice' | 'stoplossPrice'
  ): { valid: boolean; message: string } {
    const prices = this.getTradePriceSnapshot();

    return this.validateTradePriceValues(
      prices.entry,
      prices.target,
      prices.stoploss,
      changedType
    );
  }

  private getTradePriceSnapshot(override?: {
    type: 'entryPrice' | 'targetPrice' | 'stoplossPrice';
    price: number;
  }): {
    entry: number | null;
    target: number | null;
    stoploss: number | null;
  } {
    const entryDrawing = this.drawings.find(d => d.item.type === 'entryPrice');
    const targetDrawing = this.drawings.find(d => d.item.type === 'targetPrice');
    const stoplossDrawing = this.drawings.find(
      d => d.item.type === 'stoplossPrice'
    );

    let entry = entryDrawing ? entryDrawing.item.p1.price : null;
    let target = targetDrawing ? targetDrawing.item.p1.price : null;
    let stoploss = stoplossDrawing ? stoplossDrawing.item.p1.price : null;

    if (override) {
      if (override.type === 'entryPrice') entry = override.price;
      if (override.type === 'targetPrice') target = override.price;
      if (override.type === 'stoplossPrice') stoploss = override.price;
    }

    return {
      entry: entry === null ? null : Number(Number(entry).toFixed(6)),
      target: target === null ? null : Number(Number(target).toFixed(6)),
      stoploss: stoploss === null ? null : Number(Number(stoploss).toFixed(6)),
    };
  }

  private validateTradePriceValues(
    entry: number | null,
    target: number | null,
    stoploss: number | null,
    changedType: 'entryPrice' | 'targetPrice' | 'stoplossPrice'
  ): { valid: boolean; message: string } {
    const baseMessage =
      'Invalid trade setup. Entry must be between Target and Stoploss. For BUY: Stoploss < Entry < Target. For SELL: Target < Entry < Stoploss.';

    // Target and Stoploss should not be placed before Entry.
    // This prevents orphan trade lines and makes the workflow clear.
    if (changedType !== 'entryPrice' && entry === null) {
      return {
        valid: false,
        message:
          'Please place Entry first. After Entry, place Target and Stoploss.',
      };
    }

    if (entry !== null && target !== null && entry === target) {
      return {
        valid: false,
        message:
          'Invalid Target. Target price cannot be equal to Entry price.',
      };
    }

    if (entry !== null && stoploss !== null && entry === stoploss) {
      return {
        valid: false,
        message:
          'Invalid Stoploss. Stoploss price cannot be equal to Entry price.',
      };
    }

    // If all three are available, the only valid structures are:
    // BUY  => Stoploss below Entry and Target above Entry
    // SELL => Target below Entry and Stoploss above Entry
    if (entry !== null && target !== null && stoploss !== null) {
      const isBuySetup = stoploss < entry && target > entry;
      const isSellSetup = stoploss > entry && target < entry;

      if (isBuySetup || isSellSetup) {
        return { valid: true, message: '' };
      }

      if (changedType === 'targetPrice') {
        if (stoploss < entry) {
          return {
            valid: false,
            message:
              'Invalid Target. Stoploss is below Entry, so this is a BUY setup. Target must be above Entry.',
          };
        }

        if (stoploss > entry) {
          return {
            valid: false,
            message:
              'Invalid Target. Stoploss is above Entry, so this is a SELL setup. Target must be below Entry.',
          };
        }
      }

      if (changedType === 'stoplossPrice') {
        if (target > entry) {
          return {
            valid: false,
            message:
              'Invalid Stoploss. Target is above Entry, so this is a BUY setup. Stoploss must be below Entry.',
          };
        }

        if (target < entry) {
          return {
            valid: false,
            message:
              'Invalid Stoploss. Target is below Entry, so this is a SELL setup. Stoploss must be above Entry.',
          };
        }
      }

      if (changedType === 'entryPrice') {
        return {
          valid: false,
          message:
            'Invalid Entry. Entry must be between Target and Stoploss. BUY: Stoploss < Entry < Target. SELL: Target < Entry < Stoploss.',
        };
      }

      return { valid: false, message: baseMessage };
    }

    // If Target is already present and Entry is moved/placed,
    // Entry cannot sit exactly on Target. Direction will be finalized
    // after Stoploss is placed.
    if (entry !== null && target !== null && stoploss === null) {
      if (entry === target) {
        return {
          valid: false,
          message:
            'Invalid setup. Entry and Target cannot be the same price.',
        };
      }

      return { valid: true, message: '' };
    }

    // If Stoploss is already present and Entry is moved/placed,
    // Entry cannot sit exactly on Stoploss. Direction will be finalized
    // after Target is placed.
    if (entry !== null && stoploss !== null && target === null) {
      if (entry === stoploss) {
        return {
          valid: false,
          message:
            'Invalid setup. Entry and Stoploss cannot be the same price.',
        };
      }

      return { valid: true, message: '' };
    }

    return { valid: true, message: '' };
  }

  private showTradePriceValidationError(message: string): void {
    const finalMessage =
      message ||
      'Invalid trade setup. Please keep Entry between Target and Stoploss.';

    // No alert box. Validation is rendered inline above the trade line.
    // This optional callback is kept only for logging or external UI if required.
    this.options.onValidationError?.(finalMessage);
  }

  private applyInlineTradePriceValidationState(
    item: ChartDrawingRecord,
    changedType: 'entryPrice' | 'targetPrice' | 'stoplossPrice'
  ): void {
    const validation = this.validateCurrentTradePriceSetup(changedType);

    item.isInvalidPlacement = !validation.valid;
    item.validationMessage = validation.valid ? undefined : validation.message;

    this.chartContainer.style.cursor = validation.valid
      ? 'ns-resize'
      : 'not-allowed';
  }

  private refreshTradePriceMetrics(): void {
    const values = this.getTradePriceValues();

    this.drawings.forEach(d => {
      if (!this.isTradePriceToolType(d.item.type)) return;

      const patch: Partial<ChartDrawingRecord> = {
        rrText: undefined,
        tradeDirection: values.direction || undefined,
      };

      if (values.rr !== null) {
        if (d.item.type === 'entryPrice') {
          patch.rrText = `RR : ${values.rr.toFixed(2)}`
        }
      }

      d.item = {
        ...d.item,
        ...patch,
      };

      d.primitive.updateItem({
        ...d.item,
        selected: d.item.selected,
      });
    });

    this.forceUpdate();
  }

  private isHorizontalPriceToolType(type: ChartDrawingToolType): boolean {
    return (
      type === 'horizontal' ||
      type === 'entryPrice' ||
      type === 'targetPrice' ||
      type === 'stoplossPrice'
    );
  }

  private isTradePriceToolType(
    type: ChartDrawingToolType
  ): type is 'entryPrice' | 'targetPrice' | 'stoplossPrice' {
    return (
      type === 'entryPrice' ||
      type === 'targetPrice' ||
      type === 'stoplossPrice'
    );
  }

  private getTradePriceToolColor(tool: ChartDrawingToolType): string {
    if (tool === 'entryPrice') return '#2563eb';
    if (tool === 'targetPrice') return '#10b981';
    if (tool === 'stoplossPrice') return '#f43f5e';

    return '#2563eb';
  }

  private getTradePriceDisabledColor(): string {
    return '#9ca3af';
  }

  private removeDrawingsByType(type: ChartDrawingToolType): void {
    const toRemove = this.drawings.filter(d => d.item.type === type);

    if (!toRemove.length) return;

    toRemove.forEach(d => {
      try {
        this.series.detachPrimitive(d.primitive);
      } catch { }

      this.options.onDeleted?.(d.item);
    });

    this.drawings = this.drawings.filter(d => d.item.type !== type);

    if (this.selectedDrawing?.item.type === type) {
      this.selectedDrawing = null;
      this.options.onSelected?.(null);
    }

    this.refreshTradePriceMetrics();
    this.forceUpdate();
  }

  private buildDefaultPositionItem(
    id: string,
    type: 'longPosition' | 'shortPosition',
    point: ChartDrawingPoint,
    event: MouseEvent
  ): ChartDrawingRecord {
    const entry = point.price;

    const targetPercent = 0.05;
    const stopPercent = 0.025;

    const target =
      type === 'longPosition'
        ? entry * (1 + targetPercent)
        : entry * (1 - targetPercent);

    const stop =
      type === 'longPosition'
        ? entry * (1 - stopPercent)
        : entry * (1 + stopPercent);

    const rect = this.chartContainer.getBoundingClientRect();
    const clickX = event.clientX - rect.left;

    const preferredWidth = Math.max(420, rect.width * 0.32);
    const maxWidth = rect.width * 0.55;
    const defaultWidthPx = Math.min(preferredWidth, maxWidth);

    let rightX = clickX + defaultWidthPx;

    if (rightX > rect.width - 30) {
      rightX = rect.width - 30;
    }

    if (rightX <= clickX + 120) {
      rightX = Math.min(rect.width - 20, clickX + 220);
    }

    const rightTime =
      this.chart.timeScale().coordinateToTime(rightX as Coordinate) ||
      point.time;

    return {
      id,
      type,
      p1: {
        time: point.time,
        price: entry,
      },
      p2: {
        time: rightTime,
        price: target,
      },
      stopPrice: stop,
      color: type === 'longPosition' ? '#10b981' : '#f43f5e',
      lineWidth: 2,
      lineStyle: 'solid',
      targetColor: '#10b981',
      stopColor: '#f43f5e',
      entryColor: '#14b8a6',
      fillOpacity: 0.25,
      showLabels: true,
      selected: false,
    };
  }

  private applyMoveOrEdit(
    currentPoint: ChartDrawingPoint,
    currentMousePoint: MousePoint
  ) {
    if (
      !this.selectedDrawing ||
      !this.moveStartPoint ||
      !this.moveStartMousePoint ||
      !this.moveOriginalItem
    ) {
      return;
    }

    const item = this.selectedDrawing.item;
    const original = this.moveOriginalItem;

    if (item.locked) {
      return;
    }

    const priceDiff = currentPoint.price - this.moveStartPoint.price;

    if (item.type === 'vertical') {
      item.p1 = {
        ...item.p1,
        time: currentPoint.time,
      };
    }

    if (item.type === 'horizontal') {
      item.p1 = {
        ...item.p1,
        price: currentPoint.price,
      };
    }

    if (this.isTradePriceToolType(item.type)) {
      // Entry / Target / Stoploss should be editable in both directions.
      // Dragging up/down changes price, and dragging left/right changes
      // the starting candle/time from where the line extends to the right.
      const deltaX = currentMousePoint.x - this.moveStartMousePoint.x;

      item.p1 = {
        time: this.shiftTimeByPixel(original.p1.time, deltaX),
        price: original.p1.price + priceDiff,
      };
    }

    if (item.type === 'text') {
      const deltaX = currentMousePoint.x - this.moveStartMousePoint.x;
      const deltaY = currentMousePoint.y - this.moveStartMousePoint.y;

      item.p1 = {
        time: this.shiftTimeByPixel(original.p1.time, deltaX),
        price: this.shiftPriceByPixel(original.p1.price, deltaY),
      };
    }

    if (item.type === 'trendline') {
      if (this.moveMode === 'trend-start') {
        item.p1 = {
          time: currentPoint.time,
          price: currentPoint.price,
        };
      } else if (this.moveMode === 'trend-end') {
        item.p2 = {
          time: currentPoint.time,
          price: currentPoint.price,
        };
      } else {
        const deltaX = currentMousePoint.x - this.moveStartMousePoint.x;

        item.p1 = {
          time: this.shiftTimeByPixel(original.p1.time, deltaX),
          price: original.p1.price + priceDiff,
        };

        if (original.p2) {
          item.p2 = {
            time: this.shiftTimeByPixel(original.p2.time, deltaX),
            price: original.p2.price + priceDiff,
          };
        }
      }
    }

    if (item.type === 'rectangle') {
      this.applyRectangleMoveOrEdit(
        item,
        original,
        currentPoint,
        currentMousePoint,
        priceDiff
      );
    }

    if (item.type === 'longPosition' || item.type === 'shortPosition') {
      this.applyPositionMoveOrEdit(
        item,
        original,
        currentPoint,
        currentMousePoint,
        priceDiff
      );
    }

    if (this.isTradePriceToolType(item.type)) {
      this.applyInlineTradePriceValidationState(item, item.type);
    }

    this.selectedDrawing.primitive.updateItem({
      ...item,
      selected: true,
    });

    if (this.isTradePriceToolType(item.type)) {
      this.refreshTradePriceMetrics();
    }
  }

  private applyRectangleMoveOrEdit(
    item: ChartDrawingRecord,
    original: ChartDrawingRecord,
    currentPoint: ChartDrawingPoint,
    currentMousePoint: MousePoint,
    priceDiff: number
  ): void {
    if (!original.p2) return;

    const minGap = 0.0001;

    const originalTop = Math.max(original.p1.price, original.p2.price);
    const originalBottom = Math.min(original.p1.price, original.p2.price);

    if (this.moveMode === 'rectangle-top') {
      const newTop = Math.max(currentPoint.price, originalBottom + minGap);

      if (original.p1.price >= original.p2.price) {
        item.p1 = {
          ...item.p1,
          price: newTop,
        };
      } else {
        item.p2 = {
          ...item.p2!,
          price: newTop,
        };
      }
    } else if (this.moveMode === 'rectangle-bottom') {
      const newBottom = Math.min(currentPoint.price, originalTop - minGap);

      if (original.p1.price <= original.p2.price) {
        item.p1 = {
          ...item.p1,
          price: newBottom,
        };
      } else {
        item.p2 = {
          ...item.p2!,
          price: newBottom,
        };
      }
    } else if (this.moveMode === 'rectangle-left') {
      const p1X = this.chart.timeScale().timeToCoordinate(original.p1.time);
      const p2X = this.chart.timeScale().timeToCoordinate(original.p2.time);

      if (p1X !== null && p2X !== null && Number(p1X) <= Number(p2X)) {
        item.p1 = {
          ...item.p1,
          time: currentPoint.time,
        };
      } else {
        item.p2 = {
          ...item.p2!,
          time: currentPoint.time,
        };
      }
    } else if (this.moveMode === 'rectangle-right') {
      const p1X = this.chart.timeScale().timeToCoordinate(original.p1.time);
      const p2X = this.chart.timeScale().timeToCoordinate(original.p2.time);

      if (p1X !== null && p2X !== null && Number(p1X) >= Number(p2X)) {
        item.p1 = {
          ...item.p1,
          time: currentPoint.time,
        };
      } else {
        item.p2 = {
          ...item.p2!,
          time: currentPoint.time,
        };
      }
    } else {
      const deltaX = currentMousePoint.x - this.moveStartMousePoint!.x;

      item.p1 = {
        time: this.shiftTimeByPixel(original.p1.time, deltaX),
        price: original.p1.price + priceDiff,
      };

      item.p2 = {
        time: this.shiftTimeByPixel(original.p2.time, deltaX),
        price: original.p2.price + priceDiff,
      };
    }
  }

  private applyPositionMoveOrEdit(
    item: ChartDrawingRecord,
    original: ChartDrawingRecord,
    currentPoint: ChartDrawingPoint,
    currentMousePoint: MousePoint,
    priceDiff: number
  ): void {
    if (!original.p2 || original.stopPrice === undefined) return;

    if (this.moveMode === 'position-target') {
      item.p2 = {
        ...item.p2!,
        price: currentPoint.price,
      };
    } else if (this.moveMode === 'position-stop') {
      item.stopPrice = currentPoint.price;
    } else if (this.moveMode === 'position-entry') {
      item.p1 = {
        ...item.p1,
        price: currentPoint.price,
      };
    } else if (this.moveMode === 'position-right') {
      item.p2 = {
        ...item.p2!,
        time: currentPoint.time,
      };
    } else {
      const deltaX = currentMousePoint.x - this.moveStartMousePoint!.x;

      item.p1 = {
        time: this.shiftTimeByPixel(original.p1.time, deltaX),
        price: original.p1.price + priceDiff,
      };

      item.p2 = {
        time: this.shiftTimeByPixel(original.p2.time, deltaX),
        price: original.p2.price + priceDiff,
      };

      item.stopPrice = original.stopPrice + priceDiff;
    }
  }

  private getMoveModeForDrawing(
    drawing: StoredDrawing,
    event: MouseEvent
  ): ChartDrawingMoveMode {
    const item = drawing.item;

    if (item.type === 'trendline' && item.p2) {
      return this.getTrendlineMoveMode(item, event);
    }

    if (item.type === 'rectangle' && item.p2) {
      return this.getRectangleMoveMode(item, event);
    }

    if (
      (item.type === 'longPosition' || item.type === 'shortPosition') &&
      item.p2 &&
      item.stopPrice !== undefined
    ) {
      return this.getPositionMoveMode(item, event);
    }

    return 'body';
  }

  private getTrendlineMoveMode(
    item: ChartDrawingRecord,
    event: MouseEvent
  ): ChartDrawingMoveMode {
    const rect = this.chartContainer.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const timeScale = this.chart.timeScale();

    const p1x = timeScale.timeToCoordinate(item.p1.time);
    const p1y = this.series.priceToCoordinate(item.p1.price);

    const p2x = timeScale.timeToCoordinate(item.p2!.time);
    const p2y = this.series.priceToCoordinate(item.p2!.price);

    if (p1x === null || p1y === null || p2x === null || p2y === null) {
      return 'body';
    }

    const handleTolerance = 10;

    const d1 = Math.hypot(x - Number(p1x), y - Number(p1y));
    const d2 = Math.hypot(x - Number(p2x), y - Number(p2y));

    if (d1 <= handleTolerance) {
      return 'trend-start';
    }

    if (d2 <= handleTolerance) {
      return 'trend-end';
    }

    return 'body';
  }

  private getRectangleMoveMode(
    item: ChartDrawingRecord,
    event: MouseEvent
  ): ChartDrawingMoveMode {
    if (!item.p2) return 'rectangle-body';

    const rect = this.chartContainer.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const bounds = this.getRectanglePixelBounds(item);

    if (!bounds) return 'rectangle-body';

    const tolerance = 8;

    const insideX = x >= bounds.left && x <= bounds.right;
    const insideY = y >= bounds.top && y <= bounds.bottom;

    if (insideX && Math.abs(y - bounds.top) <= tolerance) {
      return 'rectangle-top';
    }

    if (insideX && Math.abs(y - bounds.bottom) <= tolerance) {
      return 'rectangle-bottom';
    }

    if (insideY && Math.abs(x - bounds.left) <= tolerance) {
      return 'rectangle-left';
    }

    if (insideY && Math.abs(x - bounds.right) <= tolerance) {
      return 'rectangle-right';
    }

    return 'rectangle-body';
  }

  private getPositionMoveMode(
    item: ChartDrawingRecord,
    event: MouseEvent
  ): ChartDrawingMoveMode {
    const rect = this.chartContainer.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const timeScale = this.chart.timeScale();

    const x1 = timeScale.timeToCoordinate(item.p1.time);
    const x2 = timeScale.timeToCoordinate(item.p2!.time);

    const yEntry = this.series.priceToCoordinate(item.p1.price);
    const yTarget = this.series.priceToCoordinate(item.p2!.price);
    const yStop = this.series.priceToCoordinate(item.stopPrice!);

    if (
      x1 === null ||
      x2 === null ||
      yEntry === null ||
      yTarget === null ||
      yStop === null
    ) {
      return 'position-body';
    }

    const right = Math.max(Number(x1), Number(x2));
    const tolerance = 8;

    if (Math.abs(y - Number(yTarget)) <= tolerance) {
      return 'position-target';
    }

    if (Math.abs(y - Number(yStop)) <= tolerance) {
      return 'position-stop';
    }

    if (Math.abs(y - Number(yEntry)) <= tolerance) {
      return 'position-entry';
    }

    if (Math.abs(x - right) <= tolerance) {
      return 'position-right';
    }

    return 'position-body';
  }

  private selectDrawing(drawing: StoredDrawing | null) {
    if (this.selectedDrawing) {
      this.selectedDrawing.item.selected = false;

      this.selectedDrawing.primitive.updateItem({
        ...this.selectedDrawing.item,
        selected: false,
      });
    }

    this.selectedDrawing = drawing;

    if (this.selectedDrawing) {
      this.selectedDrawing.item.selected = true;

      this.selectedDrawing.primitive.updateItem({
        ...this.selectedDrawing.item,
        selected: true,
      });

      this.options.onSelected?.(this.selectedDrawing.item);
    } else {
      this.options.onSelected?.(null);
    }

    this.forceUpdate();
  }

  private updateCursor(x: Coordinate, y: Coordinate) {
    if (!this.selectionEnabled) {
      this.chartContainer.style.cursor = 'default';
      return;
    }

    if (this.activeTool !== 'none' && this.activeTool !== 'select') {
      this.chartContainer.style.cursor = 'crosshair';
      return;
    }

    if (this.activeTool !== 'select') {
      this.chartContainer.style.cursor = 'default';
      return;
    }

    const mode = this.getHoverMode(Number(x), Number(y));
    const found = this.findDrawingAtXY(Number(x), Number(y));

    if (found?.item?.locked) {
      this.chartContainer.style.cursor = 'not-allowed';
      return;
    }

    if (mode === 'trend-start' || mode === 'trend-end') {
      this.chartContainer.style.cursor = 'crosshair';
      return;
    }

    if (mode === 'rectangle-top' || mode === 'rectangle-bottom') {
      this.chartContainer.style.cursor = 'ns-resize';
      return;
    }

    if (mode === 'rectangle-left' || mode === 'rectangle-right') {
      this.chartContainer.style.cursor = 'ew-resize';
      return;
    }

    if (mode === 'rectangle-body') {
      this.chartContainer.style.cursor = 'move';
      return;
    }

    if (
      mode === 'position-target' ||
      mode === 'position-stop' ||
      mode === 'position-entry'
    ) {
      this.chartContainer.style.cursor = 'ns-resize';
      return;
    }

    if (mode === 'position-right') {
      this.chartContainer.style.cursor = 'ew-resize';
      return;
    }

    if (mode === 'body' || mode === 'position-body') {
      this.chartContainer.style.cursor = 'move';
      return;
    }

    this.chartContainer.style.cursor = 'default';
  }

  private getHoverMode(x: number, y: number): ChartDrawingMoveMode {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const drawing = this.drawings[i];

      if (!this.hitTest(drawing.item, x, y)) {
        continue;
      }

      if (drawing.item.type === 'trendline' && drawing.item.p2) {
        return this.getTrendlineHoverMode(drawing.item, x, y);
      }

      if (drawing.item.type === 'rectangle' && drawing.item.p2) {
        return this.getRectangleHoverMode(drawing.item, x, y);
      }

      if (
        (drawing.item.type === 'longPosition' ||
          drawing.item.type === 'shortPosition') &&
        drawing.item.p2 &&
        drawing.item.stopPrice !== undefined
      ) {
        return this.getPositionHoverMode(drawing.item, x, y);
      }

      return 'body';
    }

    return 'none';
  }

  private getTrendlineHoverMode(
    item: ChartDrawingRecord,
    x: number,
    y: number
  ): ChartDrawingMoveMode {
    const timeScale = this.chart.timeScale();

    const p1x = timeScale.timeToCoordinate(item.p1.time);
    const p1y = this.series.priceToCoordinate(item.p1.price);

    const p2x = timeScale.timeToCoordinate(item.p2!.time);
    const p2y = this.series.priceToCoordinate(item.p2!.price);

    if (p1x !== null && p1y !== null && p2x !== null && p2y !== null) {
      const handleTolerance = 10;

      const d1 = Math.hypot(x - Number(p1x), y - Number(p1y));
      const d2 = Math.hypot(x - Number(p2x), y - Number(p2y));

      if (d1 <= handleTolerance) return 'trend-start';
      if (d2 <= handleTolerance) return 'trend-end';
    }

    return 'body';
  }

  private getRectangleHoverMode(
    item: ChartDrawingRecord,
    x: number,
    y: number
  ): ChartDrawingMoveMode {
    if (!item.p2) return 'rectangle-body';

    const bounds = this.getRectanglePixelBounds(item);

    if (!bounds) return 'rectangle-body';

    const tolerance = 8;

    const insideX = x >= bounds.left && x <= bounds.right;
    const insideY = y >= bounds.top && y <= bounds.bottom;

    if (insideX && Math.abs(y - bounds.top) <= tolerance) {
      return 'rectangle-top';
    }

    if (insideX && Math.abs(y - bounds.bottom) <= tolerance) {
      return 'rectangle-bottom';
    }

    if (insideY && Math.abs(x - bounds.left) <= tolerance) {
      return 'rectangle-left';
    }

    if (insideY && Math.abs(x - bounds.right) <= tolerance) {
      return 'rectangle-right';
    }

    return 'rectangle-body';
  }

  private getPositionHoverMode(
    item: ChartDrawingRecord,
    x: number,
    y: number
  ): ChartDrawingMoveMode {
    const timeScale = this.chart.timeScale();

    const x1 = timeScale.timeToCoordinate(item.p1.time);
    const x2 = timeScale.timeToCoordinate(item.p2!.time);

    const yEntry = this.series.priceToCoordinate(item.p1.price);
    const yTarget = this.series.priceToCoordinate(item.p2!.price);
    const yStop = this.series.priceToCoordinate(item.stopPrice!);

    if (
      x1 === null ||
      x2 === null ||
      yEntry === null ||
      yTarget === null ||
      yStop === null
    ) {
      return 'position-body';
    }

    const right = Math.max(Number(x1), Number(x2));
    const tolerance = 8;

    if (Math.abs(y - Number(yTarget)) <= tolerance) {
      return 'position-target';
    }

    if (Math.abs(y - Number(yStop)) <= tolerance) {
      return 'position-stop';
    }

    if (Math.abs(y - Number(yEntry)) <= tolerance) {
      return 'position-entry';
    }

    if (Math.abs(x - right) <= tolerance) {
      return 'position-right';
    }

    return 'position-body';
  }

  private findDrawingAtMouseEvent(event: MouseEvent): StoredDrawing | null {
    const rect = this.chartContainer.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return this.findDrawingAtXY(x, y);
  }

  private findDrawingAtXY(x: number, y: number): StoredDrawing | null {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const drawing = this.drawings[i];

      if (this.hitTest(drawing.item, x, y)) {
        return drawing;
      }
    }

    return null;
  }

  private hitTest(item: ChartDrawingRecord, x: number, y: number): boolean {
    const timeScale = this.chart.timeScale();

    const x1 = timeScale.timeToCoordinate(item.p1.time);
    const y1 = this.series.priceToCoordinate(item.p1.price);

    if (x1 === null || y1 === null) return false;

    const tolerance = 7;

    if (item.type === 'vertical') {
      return Math.abs(x - Number(x1)) <= tolerance;
    }

    if (this.isHorizontalPriceToolType(item.type)) {
      // Normal horizontal line can be selected from anywhere on the row.
      if (item.type === 'horizontal') {
        return Math.abs(y - Number(y1)) <= tolerance;
      }

      // Entry / Target / Stoploss should not be active on the left side.
      // They start from clicked candle/time and extend only to the right.
      return x >= Number(x1) - tolerance && Math.abs(y - Number(y1)) <= tolerance;
    }

    if (item.type === 'text') {
      const text = item.text || '';
      const fontSize = item.fontSize || 13;
      const width = Math.max(30, text.length * fontSize * 0.65);
      const height = fontSize * 1.5;

      return (
        x >= Number(x1) - 4 &&
        x <= Number(x1) + width + 4 &&
        y >= Number(y1) - 4 &&
        y <= Number(y1) + height + 4
      );
    }

    if (item.type === 'trendline' && item.p2) {
      const x2 = timeScale.timeToCoordinate(item.p2.time);
      const y2 = this.series.priceToCoordinate(item.p2.price);

      if (x2 === null || y2 === null) return false;

      const d1 = Math.hypot(x - Number(x1), y - Number(y1));
      const d2 = Math.hypot(x - Number(x2), y - Number(y2));

      if (d1 <= 10 || d2 <= 10) {
        return true;
      }

      return (
        this.distanceToSegment(
          x,
          y,
          Number(x1),
          Number(y1),
          Number(x2),
          Number(y2)
        ) <= tolerance
      );
    }

    if (item.type === 'rectangle' && item.p2) {
      const bounds = this.getRectanglePixelBounds(item);

      if (!bounds) return false;

      return (
        x >= bounds.left - tolerance &&
        x <= bounds.right + tolerance &&
        y >= bounds.top - tolerance &&
        y <= bounds.bottom + tolerance
      );
    }

    if (
      (item.type === 'longPosition' || item.type === 'shortPosition') &&
      item.p2 &&
      item.stopPrice !== undefined
    ) {
      const x2 = timeScale.timeToCoordinate(item.p2.time);
      const yTarget = this.series.priceToCoordinate(item.p2.price);
      const yStop = this.series.priceToCoordinate(item.stopPrice);

      if (x2 === null || yTarget === null || yStop === null) {
        return false;
      }

      const left = Math.min(Number(x1), Number(x2));
      const right = Math.max(Number(x1), Number(x2));

      const top = Math.min(Number(yTarget), Number(yStop), Number(y1));
      const bottom = Math.max(Number(yTarget), Number(yStop), Number(y1));

      return x >= left && x <= right && y >= top && y <= bottom;
    }

    return false;
  }

  private getRectanglePixelBounds(item: ChartDrawingRecord): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null {
    if (!item.p2) return null;

    const x1 = this.chart.timeScale().timeToCoordinate(item.p1.time);
    const x2 = this.chart.timeScale().timeToCoordinate(item.p2.time);

    const y1 = this.series.priceToCoordinate(item.p1.price);
    const y2 = this.series.priceToCoordinate(item.p2.price);

    if (x1 === null || x2 === null || y1 === null || y2 === null) {
      return null;
    }

    return {
      left: Math.min(Number(x1), Number(x2)),
      right: Math.max(Number(x1), Number(x2)),
      top: Math.min(Number(y1), Number(y2)),
      bottom: Math.max(Number(y1), Number(y2)),
    };
  }

  private distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
      return Math.hypot(px - x1, py - y1);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    return Math.hypot(px - closestX, py - closestY);
  }

  private getMousePointFromEvent(event: MouseEvent): MousePoint {
    const rect = this.chartContainer.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private getPointFromMouseEvent(event: MouseEvent): ChartDrawingPoint | null {
    const rect = this.chartContainer.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const time = this.chart.timeScale().coordinateToTime(x as Coordinate);
    const price = this.series.coordinateToPrice(y as Coordinate);

    if (!time || price === null) {
      return this.lastPoint;
    }

    return {
      time,
      price,
    };
  }

  private shiftTimeByPixel(time: Time, deltaX: number): Time {
    const oldX = this.chart.timeScale().timeToCoordinate(time);

    if (oldX === null) {
      return time;
    }

    const newX = Number(oldX) + deltaX;

    const newTime = this.chart.timeScale().coordinateToTime(newX as Coordinate);

    if (!newTime) {
      return time;
    }

    return newTime;
  }

  private shiftPriceByPixel(price: number, deltaY: number): number {
    const oldY = this.series.priceToCoordinate(price);

    if (oldY === null) {
      return price;
    }

    const newY = Number(oldY) + deltaY;

    const newPrice = this.series.coordinateToPrice(newY as Coordinate);

    if (newPrice === null) {
      return price;
    }

    return newPrice;
  }

  private setChartDragEnabled(enabled: boolean): void {
    try {
      this.chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: enabled,
          horzTouchDrag: enabled,
          vertTouchDrag: enabled,
        },
        handleScale: {
          mouseWheel: true,
          pinch: enabled,
          axisPressedMouseMove: enabled,
        },
      });
    } catch { }
  }

  private forceUpdate() {
    try {
      const range = this.chart.timeScale().getVisibleLogicalRange();

      if (range) {
        this.chart.timeScale().setVisibleLogicalRange({
          from: range.from,
          to: range.to,
        });
      }
    } catch { }
  }

  private createId(): string {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch { }

    return `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }


  public setTradePriceLinesFromSetup(config: {
  setupType: 'BUY' | 'SELL';
  entryPrice: number;
  targetPrice: number;
  stoplossPrice: number;
  entryTime: Time;
  targetTime?: Time;
  stoplossTime?: Time;
  clearExisting?: boolean;
}): { success: boolean; message: string } {
  const entry = Number(config.entryPrice);
  const target = Number(config.targetPrice);
  const stoploss = Number(config.stoplossPrice);

  if (
    Number.isNaN(entry) ||
    Number.isNaN(target) ||
    Number.isNaN(stoploss)
  ) {
    return {
      success: false,
      message: 'Invalid setup price. Entry, Target, and Stoploss must be valid numbers.',
    };
  }

  if (config.setupType === 'BUY') {
    if (!(stoploss < entry && entry < target)) {
      return {
        success: false,
        message:
          'Invalid BUY setup. Correct structure is Stoploss < Entry < Target.',
      };
    }
  }

  if (config.setupType === 'SELL') {
    if (!(target < entry && entry < stoploss)) {
      return {
        success: false,
        message:
          'Invalid SELL setup. Correct structure is Target < Entry < Stoploss.',
      };
    }
  }

  if (config.clearExisting !== false) {
    this.removeDrawingsByType('entryPrice');
    this.removeDrawingsByType('targetPrice');
    this.removeDrawingsByType('stoplossPrice');
  }

  const entryItem = this.addDrawing({
    id: this.createId(),
    type: 'entryPrice',
    p1: {
      time: config.entryTime,
      price: entry,
    },
    color: this.getTradePriceToolColor('entryPrice'),
    lineWidth: 2,
    lineStyle: 'solid',
    selected: false,
  });

  const targetItem = this.addDrawing({
    id: this.createId(),
    type: 'targetPrice',
    p1: {
      time: config.targetTime || config.entryTime,
      price: target,
    },
    color: this.getTradePriceToolColor('targetPrice'),
    lineWidth: 2,
    lineStyle: 'solid',
    selected: false,
  });

  const stoplossItem = this.addDrawing({
    id: this.createId(),
    type: 'stoplossPrice',
    p1: {
      time: config.stoplossTime || config.entryTime,
      price: stoploss,
    },
    color: this.getTradePriceToolColor('stoplossPrice'),
    lineWidth: 2,
    lineStyle: 'solid',
    selected: false,
  });

  this.refreshTradePriceMetrics();

  this.options.onCreated?.(entryItem);
  this.options.onCreated?.(targetItem);
  this.options.onCreated?.(stoplossItem);

  this.selectDrawing(null);
  this.setActiveTool('select');
  this.forceUpdate();

  return {
    success: true,
    message: 'Trade setup lines created successfully.',
  };
}

public getTradePriceLineData(): {
  entry: number | null;
  target: number | null;
  stoploss: number | null;
  entryTime: Time | null;
  targetTime: Time | null;
  stoplossTime: Time | null;
  reward: number | null;
  risk: number | null;
  rr: number | null;
  direction: 'BUY' | 'SELL' | 'INVALID' | null;
} {
  const entryDrawing = this.drawings.find(d => d.item.type === 'entryPrice');
  const targetDrawing = this.drawings.find(d => d.item.type === 'targetPrice');
  const stoplossDrawing = this.drawings.find(d => d.item.type === 'stoplossPrice');

  const entry = entryDrawing
    ? Number(Number(entryDrawing.item.p1.price).toFixed(2))
    : null;

  const target = targetDrawing
    ? Number(Number(targetDrawing.item.p1.price).toFixed(2))
    : null;

  const stoploss = stoplossDrawing
    ? Number(Number(stoplossDrawing.item.p1.price).toFixed(2))
    : null;

  const metrics = this.calculateTradePriceMetrics(entry, target, stoploss);

  return {
    entry,
    target,
    stoploss,
    entryTime: entryDrawing ? entryDrawing.item.p1.time : null,
    targetTime: targetDrawing ? targetDrawing.item.p1.time : null,
    stoplossTime: stoplossDrawing ? stoplossDrawing.item.p1.time : null,
    reward: metrics.reward,
    risk: metrics.risk,
    rr: metrics.rr,
    direction: metrics.direction,
  };
}
}
import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
	Coordinate,
	IChartApi,
	isBusinessDay,
	ISeriesApi,
	ISeriesPrimitiveAxisView,
	ISeriesPrimitivePaneRenderer,
	ISeriesPrimitivePaneView,
	MouseEventParams,
	SeriesPrimitivePaneViewZOrder,
	SeriesType,
	Time,
} from 'lightweight-charts';
import { ensureDefined } from 'src/assets/JS/assertions';
import { PluginBase } from 'src/assets/JS/plugin-base';
import { positionsBox } from 'src/assets/JS/positions';

interface ViewPoint {
	x: Coordinate | null;
	y: Coordinate | null;
}

export interface Point {
	time: Time;
	price: number;
}

export interface CandleOHLCData {
	time: Time;
	open: number;
	high: number;
	low: number;
	close: number;
}

export interface RectangleStyleOptions {
	fillColor: string;
	outlineColor?: string;
	outlineWidth?: number;
	text?: string;
	color?: string;
	textColor?: string;
}

export interface ManualRectangleRecord {
	id: string;
	p1: Point;
	p2: Point;
	extendRight: boolean;
	options: RectangleStyleOptions;
	sourceTimeframe?: string;
	symbol?: string;
	createdAt?: number;
}

interface StoredRectangleItem {
	id: string;
	rectangle: Rectangle;
	p1: Point;
	p2: Point;
	options: RectangleStyleOptions;
	extendRight: boolean;
}

type RectangleEditMode =
	| 'none'
	| 'move'
	| 'top'
	| 'bottom'
	| 'left'
	| 'right'
	| 'top-left'
	| 'bottom-left'
	| 'top-right'
	| 'bottom-right';

export interface RectangleDrawingToolOptions {
	fillColor: string;
	previewFillColor: string;
	labelColor: string;
	labelTextColor: string;
	showLabels: boolean;
	priceLabelFormatter: (price: number) => string;
	timeLabelFormatter: (time: Time) => string;

	outlineColor?: string;
	outlineWidth?: number;
	text?: string;
	color?: string;
	textColor?: string;

	extendRight?: boolean;
	continuousDrawing?: boolean;
	onRectangleCreated?: (rect: ManualRectangleRecord) => void;

	enableSelection?: boolean;
	enableEditing?: boolean;
	selectedOutlineColor?: string;
	selectedOutlineWidth?: number;
	onRectangleSelected?: (rect: ManualRectangleRecord | null) => void;
	onRectangleDeleted?: (rect: ManualRectangleRecord) => void;
	onRectangleUpdated?: (rect: ManualRectangleRecord) => void;

	// New: used to snap manual zone drawing to nearest OHLC point
	candleData?: CandleOHLCData[];
	snapToOHLC?: boolean;
}

const defaultOptions: RectangleDrawingToolOptions = {
	fillColor: 'rgba(112, 145, 195, 0.2)',
	previewFillColor: 'rgba(200, 50, 100, 0.25)',
	labelColor: 'rgba(200, 50, 100, 1)',
	labelTextColor: 'white',
	showLabels: true,

	priceLabelFormatter: (price: number) => price.toFixed(2),

	timeLabelFormatter: (time: Time) => {
		if (typeof time === 'string') return time;

		const date = isBusinessDay(time)
			? new Date(time.year, time.month - 1, time.day)
			: new Date((time as number) * 1000);

		return date.toLocaleDateString();
	},

	outlineColor: undefined,
	outlineWidth: 1,
	text: undefined,
	color: undefined,
	textColor: undefined,

	extendRight: false,
	continuousDrawing: false,

	enableSelection: false,
	enableEditing: false,
	selectedOutlineColor: '#111827',
	selectedOutlineWidth: 2,

	candleData: [],
	snapToOHLC: true,
};

class RectanglePaneRenderer implements ISeriesPrimitivePaneRenderer {
	_p1: ViewPoint;
	_p2: ViewPoint;
	_fillColor: string;
	_outlineColor?: string;
	_outlineWidth?: number;
	_text?: string;
	_textColor?: string;
	_extendRight: boolean;

	constructor(
		p1: ViewPoint,
		p2: ViewPoint,
		fillColor: string,
		outlineColor?: string,
		outlineWidth: number = 1,
		text?: string,
		textColor?: string,
		extendRight: boolean = false
	) {
		this._p1 = p1;
		this._p2 = p2;
		this._fillColor = fillColor;
		this._outlineColor = outlineColor;
		this._outlineWidth = outlineWidth;
		this._text = text;
		this._textColor = textColor;
		this._extendRight = extendRight;
	}

	draw(target: CanvasRenderingTarget2D) {
		target.useBitmapCoordinateSpace(scope => {
			if (
				this._p1.x === null ||
				this._p1.y === null ||
				this._p2.x === null ||
				this._p2.y === null
			) {
				return;
			}

			const ctx = scope.context;

			const x1 = Math.round(this._p1.x * scope.horizontalPixelRatio);
			const x2 = this._extendRight
				? scope.bitmapSize.width
				: Math.round(this._p2.x * scope.horizontalPixelRatio);

			const y1 = Math.round(this._p1.y * scope.verticalPixelRatio);
			const y2 = Math.round(this._p2.y * scope.verticalPixelRatio);

			const x = Math.min(x1, x2);
			const y = Math.min(y1, y2);
			const width = Math.abs(x2 - x1);
			const height = Math.abs(y2 - y1);

			if (width <= 0 || height <= 0) return;

			ctx.fillStyle = this._fillColor;
			ctx.fillRect(x, y, width, height);

			const outlineWidth = this._outlineWidth ?? 0;

			if (this._outlineColor && outlineWidth > 0) {
				ctx.strokeStyle = this._outlineColor;
				ctx.lineWidth = outlineWidth * scope.horizontalPixelRatio;
				ctx.strokeRect(x, y, width, height);
			}

			if (this._text) {
				ctx.save();

				ctx.fillStyle = this._textColor || this._outlineColor || '#111827';
				ctx.font = `${Math.max(12, 12 * scope.verticalPixelRatio)}px Arial`;
				ctx.textAlign = 'right';
				ctx.textBaseline = 'top';

				const padding = 6 * scope.horizontalPixelRatio;
				const textX = x + width - padding;
				const textY = y + padding;

				ctx.fillText(this._text, textX, textY);

				ctx.restore();
			}
		});
	}
}

class RectanglePaneView implements ISeriesPrimitivePaneView {
	_source: Rectangle;
	_p1: ViewPoint = { x: null, y: null };
	_p2: ViewPoint = { x: null, y: null };

	constructor(source: Rectangle) {
		this._source = source;
	}

	update() {
		const series = this._source.series;

		const y1 = series.priceToCoordinate(this._source._p1.price);
		const y2 = series.priceToCoordinate(this._source._p2.price);

		const timeScale = this._source.chart.timeScale();

		const x1 = timeScale.timeToCoordinate(this._source._p1.time);
		const x2 = timeScale.timeToCoordinate(this._source._p2.time);

		this._p1 = { x: x1, y: y1 };
		this._p2 = { x: x2, y: y2 };
	}

	renderer() {
		return new RectanglePaneRenderer(
			this._p1,
			this._p2,
			this._source._options.fillColor,
			this._source._options.outlineColor,
			this._source._options.outlineWidth,
			this._source._options.text,
			this._source._options.textColor || this._source._options.color,
			!!this._source._options.extendRight
		);
	}
}

class RectangleAxisPaneRenderer implements ISeriesPrimitivePaneRenderer {
	_p1: number | null;
	_p2: number | null;
	_fillColor: string;
	_vertical: boolean = false;

	constructor(
		p1: number | null,
		p2: number | null,
		fillColor: string,
		vertical: boolean
	) {
		this._p1 = p1;
		this._p2 = p2;
		this._fillColor = fillColor;
		this._vertical = vertical;
	}

	draw(target: CanvasRenderingTarget2D) {
		target.useBitmapCoordinateSpace(scope => {
			if (this._p1 === null || this._p2 === null) return;

			const ctx = scope.context;
			ctx.globalAlpha = 0.5;

			const positions = positionsBox(
				this._p1,
				this._p2,
				this._vertical ? scope.verticalPixelRatio : scope.horizontalPixelRatio
			);

			ctx.fillStyle = this._fillColor;

			if (this._vertical) {
				ctx.fillRect(0, positions.position, 15, positions.length);
			} else {
				ctx.fillRect(positions.position, 0, positions.length, 15);
			}
		});
	}
}

abstract class RectangleAxisPaneView implements ISeriesPrimitivePaneView {
	_source: Rectangle;
	_p1: number | null = null;
	_p2: number | null = null;
	_vertical: boolean = false;

	constructor(source: Rectangle, vertical: boolean) {
		this._source = source;
		this._vertical = vertical;
	}

	abstract getPoints(): [Coordinate | null, Coordinate | null];

	update() {
		[this._p1, this._p2] = this.getPoints();
	}

	renderer() {
		return new RectangleAxisPaneRenderer(
			this._p1,
			this._p2,
			this._source._options.fillColor,
			this._vertical
		);
	}

	zOrder(): SeriesPrimitivePaneViewZOrder {
		return 'bottom';
	}
}

class RectanglePriceAxisPaneView extends RectangleAxisPaneView {
	getPoints(): [Coordinate | null, Coordinate | null] {
		const series = this._source.series;

		const y1 = series.priceToCoordinate(this._source._p1.price);
		const y2 = series.priceToCoordinate(this._source._p2.price);

		return [y1, y2];
	}
}

class RectangleTimeAxisPaneView extends RectangleAxisPaneView {
	getPoints(): [Coordinate | null, Coordinate | null] {
		const timeScale = this._source.chart.timeScale();

		const x1 = timeScale.timeToCoordinate(this._source._p1.time);
		const x2 = timeScale.timeToCoordinate(this._source._p2.time);

		return [x1, x2];
	}
}

abstract class RectangleAxisView implements ISeriesPrimitiveAxisView {
	_source: Rectangle;
	_p: Point;
	_pos: Coordinate | null = null;

	constructor(source: Rectangle, p: Point) {
		this._source = source;
		this._p = p;
	}

	abstract update(): void;
	abstract text(): string;

	coordinate() {
		return this._pos ?? -1;
	}

	visible(): boolean {
		return this._source._options.showLabels;
	}

	tickVisible(): boolean {
		return this._source._options.showLabels;
	}

	textColor() {
		return this._source._options.labelTextColor;
	}

	backColor() {
		return this._source._options.labelColor;
	}

	movePoint(p: Point) {
		this._p = p;
		this.update();
	}
}

class RectangleTimeAxisView extends RectangleAxisView {
	update() {
		const timeScale = this._source.chart.timeScale();
		this._pos = timeScale.timeToCoordinate(this._p.time);
	}

	text() {
		return this._source._options.timeLabelFormatter(this._p.time);
	}
}

class RectanglePriceAxisView extends RectangleAxisView {
	update() {
		const series = this._source.series;
		this._pos = series.priceToCoordinate(this._p.price);
	}

	text() {
		return this._source._options.priceLabelFormatter(this._p.price);
	}
}

class Rectangle extends PluginBase {
	_options: RectangleDrawingToolOptions;
	_p1: Point;
	_p2: Point;
	_paneViews: RectanglePaneView[];
	_timeAxisViews: RectangleTimeAxisView[];
	_priceAxisViews: RectanglePriceAxisView[];
	_priceAxisPaneViews: RectanglePriceAxisPaneView[];
	_timeAxisPaneViews: RectangleTimeAxisPaneView[];

	constructor(
		p1: Point,
		p2: Point,
		options: Partial<RectangleDrawingToolOptions> = {}
	) {
		super();

		this._p1 = p1;
		this._p2 = p2;

		this._options = {
			...defaultOptions,
			...options,
		};

		this._paneViews = [new RectanglePaneView(this)];

		this._timeAxisViews = [
			new RectangleTimeAxisView(this, p1),
			new RectangleTimeAxisView(this, p2),
		];

		this._priceAxisViews = [
			new RectanglePriceAxisView(this, p1),
			new RectanglePriceAxisView(this, p2),
		];

		this._priceAxisPaneViews = [new RectanglePriceAxisPaneView(this, true)];
		this._timeAxisPaneViews = [new RectangleTimeAxisPaneView(this, false)];
	}

	updateAllViews() {
		this._paneViews.forEach(pw => pw.update());
		this._timeAxisViews.forEach(pw => pw.update());
		this._priceAxisViews.forEach(pw => pw.update());
		this._priceAxisPaneViews.forEach(pw => pw.update());
		this._timeAxisPaneViews.forEach(pw => pw.update());
	}

	updatePoints(p1: Point, p2: Point) {
		this._p1 = p1;
		this._p2 = p2;

		this._timeAxisViews[0].movePoint(p1);
		this._timeAxisViews[1].movePoint(p2);

		this._priceAxisViews[0].movePoint(p1);
		this._priceAxisViews[1].movePoint(p2);

		this.updateAllViews();
		this.requestUpdate();
	}

	priceAxisViews() {
		return this._priceAxisViews;
	}

	timeAxisViews() {
		return this._timeAxisViews;
	}

	paneViews() {
		return this._paneViews;
	}

	priceAxisPaneViews() {
		return this._priceAxisPaneViews;
	}

	timeAxisPaneViews() {
		return this._timeAxisPaneViews;
	}

	applyOptions(options: Partial<RectangleDrawingToolOptions>) {
		this._options = { ...this._options, ...options };
		this.requestUpdate();
	}
}

class PreviewRectangle extends Rectangle {
	constructor(
		p1: Point,
		p2: Point,
		options: Partial<RectangleDrawingToolOptions> = {}
	) {
		super(p1, p2, options);

		this._options.fillColor =
			options.previewFillColor ||
			this._options.previewFillColor ||
			this._options.fillColor;

		// IMPORTANT:
		// Preview should also extend right.
		// Otherwise when user draws straight up/down on same candle,
		// x1 and x2 are same, width becomes 0, so preview is invisible.
		this._options.extendRight =
			options.extendRight !== undefined ? options.extendRight : true;
	}

	public updateEndPoint(p: Point) {
		this.updatePoints(this._p1, p);
	}
}

// class PreviewRectangle extends Rectangle {
//   constructor(
//     p1: Point,
//     p2: Point,
//     options: Partial<RectangleDrawingToolOptions> = {}
//   ) {
//     super(p1, p2, options);

//     this._options.fillColor = this._options.previewFillColor;
//     this._options.extendRight = false;
//   }

//   public updateEndPoint(p: Point) {
//     this.updatePoints(this._p1, p);
//   }
// }

export class RectangleDrawingTool {
	private _chart: IChartApi | undefined;
	private _series: ISeriesApi<SeriesType> | undefined;
	private _drawingsToolbarContainer: HTMLDivElement | undefined;
	private _chartContainer: HTMLElement | undefined;

	private _defaultOptions: Partial<RectangleDrawingToolOptions>;
	private _rectangles: StoredRectangleItem[] = [];
	private _selectedRectangle: StoredRectangleItem | null = null;
	private _previewRectangle: PreviewRectangle | undefined = undefined;

	private _drawing: boolean = false;
	private _isDragging: boolean = false;
	private _dragStartPoint: Point | undefined;
	private _lastPoint: Point | undefined;

	private _editing: boolean = false;
	private _editMode: RectangleEditMode = 'none';
	private _editStartPoint: Point | null = null;
	private _editOriginalP1: Point | null = null;
	private _editOriginalP2: Point | null = null;

	private _toolbarButton: HTMLDivElement | undefined;
	private _colorPicker: HTMLInputElement | undefined;

	private _ohlcMap: Map<string, CandleOHLCData> = new Map();
	private _ohlcCandles: CandleOHLCData[] = [];

	constructor(
		chart: IChartApi,
		series: ISeriesApi<SeriesType>,
		drawingsToolbarContainer: HTMLDivElement,
		options: Partial<RectangleDrawingToolOptions>,
		chartContainer?: HTMLElement
	) {
		this._chart = chart;
		this._series = series;
		this._drawingsToolbarContainer = drawingsToolbarContainer;
		this._chartContainer = chartContainer;

		this._defaultOptions = {
			...defaultOptions,
			...options,
		};

		this.setCandleData(this._defaultOptions.candleData || []);

		this._addToolbarButton();

		this._chart.subscribeCrosshairMove(this._moveHandler);

		if (this._chartContainer) {
			// Use capture=true so manual zone edit gets priority before chart drag/pan.
			this._chartContainer.addEventListener('mousedown', this._mouseDownHandler, true);
			this._chartContainer.addEventListener('click', this._clickHandler, true);
			window.addEventListener('mouseup', this._mouseUpHandler, true);
		}
	}

	private _moveHandler = (param: MouseEventParams) => this._onMouseMove(param);

	private _mouseDownHandler = (event: MouseEvent) => {
		if (this._drawing) {
			const rawPoint = this._getPointFromMouseEvent(event) || this._lastPoint;
			if (!rawPoint) return;

			const point = this._snapPointToNearestOHLC(rawPoint);

			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();

			this._setChartDragEnabled(false);

			this._isDragging = true;
			this._dragStartPoint = point;

			this._removePreviewRectangle();
			this._addPreviewRectangle(point);

			return;
		}

		if (
			this._defaultOptions.enableSelection &&
			this._defaultOptions.enableEditing &&
			this._selectedRectangle
		) {
			const editMode = this._getEditModeFromMouseEvent(event);

			if (editMode !== 'none') {
				const point = this._getPointFromMouseEvent(event) || this._lastPoint;
				if (!point) return;

				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();

				this._setChartDragEnabled(false);

				this._editing = true;
				this._editMode = editMode;
				this._editStartPoint = point;
				this._editOriginalP1 = { ...this._selectedRectangle.p1 };
				this._editOriginalP2 = { ...this._selectedRectangle.p2 };

				return;
			}
		}
	};

	private _mouseUpHandler = (event: MouseEvent) => {
		if (this._editing) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();

			const updated = this._selectedRectangle
				? this._toManualRecord(this._selectedRectangle)
				: null;

			this._editing = false;
			this._editMode = 'none';
			this._editStartPoint = null;
			this._editOriginalP1 = null;
			this._editOriginalP2 = null;

			this._setChartDragEnabled(true);

			if (updated) {
				this._defaultOptions.onRectangleUpdated?.(updated);
			}

			return;
		}

		if (!this._drawing || !this._isDragging || !this._dragStartPoint) return;

		const rawPoint = this._getPointFromMouseEvent(event) || this._lastPoint;

		if (!rawPoint) {
			this._resetDragState();
			this._setChartDragEnabled(true);
			return;
		}

		const point = this._snapPointToNearestOHLC(rawPoint);

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		const normalized = this._normalizeRectanglePoints(this._dragStartPoint, point);

		const p1 = normalized.p1;
		const p2 = normalized.p2;

		if (p1.time === p2.time && Math.abs(p1.price - p2.price) < 0.0001) {
			this._resetDragState();
			this._setChartDragEnabled(true);
			return;
		}

		const rectOptions: RectangleStyleOptions = {
			fillColor: this._defaultOptions.fillColor || 'rgba(37, 99, 235, 0.20)',
			outlineColor: this._defaultOptions.outlineColor || '#2563eb',
			outlineWidth: this._defaultOptions.outlineWidth ?? 1,
			text: this._defaultOptions.text,
			color:
				this._defaultOptions.textColor ||
				this._defaultOptions.color ||
				'#2563eb',
			textColor:
				this._defaultOptions.textColor ||
				this._defaultOptions.color ||
				'#2563eb',
		};

		const createdRectangle = this._addNewRectangle(p1, p2, rectOptions);

		this._defaultOptions.onRectangleCreated?.(createdRectangle);

		this._resetDragState();
		this._setChartDragEnabled(true);

		if (!this._defaultOptions.continuousDrawing) {
			this.stopDrawing();
		}
	};


	private _clickHandler = (event: MouseEvent) => {
		if (!this._defaultOptions.enableSelection) return;
		if (this._drawing) return;
		if (this._editing) return;

		const point = this._getPointFromMouseEvent(event);

		if (!point) {
			this._selectRectangle(null);
			return;
		}

		const selected = this._findRectangleAtPoint(point);
		this._selectRectangle(selected);
	};

	private _getPointFromMouseEvent(event: MouseEvent): Point | null {
		if (!this._chartContainer) return null;

		const rect = this._chartContainer.getBoundingClientRect();

		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		return this._getPointFromXY(x, y);
	}

	private _getPointFromXY(x: number, y: number): Point | null {
		if (!this._chart || !this._series) return null;

		const price = this._series.coordinateToPrice(y as Coordinate);

		if (price === null) return null;

		const nearestCandle = this._getNearestCandleByX(x);

		if (nearestCandle) {
			return {
				time: nearestCandle.time,
				price,
			};
		}

		const time = this._chart.timeScale().coordinateToTime(x as Coordinate);

		if (!time) return null;

		return {
			time,
			price,
		};
	}

	private _getNearestCandleByX(x: number): CandleOHLCData | null {
		if (!this._chart || !this._ohlcCandles.length) {
			return null;
		}

		const timeScale = this._chart.timeScale();

		let nearestCandle: CandleOHLCData | null = null;
		let nearestDistance = Number.MAX_SAFE_INTEGER;

		for (const candle of this._ohlcCandles) {
			const candleX = timeScale.timeToCoordinate(candle.time);

			if (candleX === null) continue;

			const distance = Math.abs(Number(candleX) - x);

			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestCandle = candle;
			}
		}

		return nearestCandle;
	}

	private _normalizeRectanglePoints(p1: Point, p2: Point): { p1: Point; p2: Point } {
		if (!this._defaultOptions.extendRight) {
			return {
				p1: { ...p1 },
				p2: { ...p2 },
			};
		}

		const t1 = this._toTimeNumber(p1.time);
		const t2 = this._toTimeNumber(p2.time);

		if (t2 < t1) {
			return {
				p1: { ...p2 },
				p2: { ...p1 },
			};
		}

		return {
			p1: { ...p1 },
			p2: { ...p2 },
		};
	}


	private _onMouseMove(param: MouseEventParams) {
		if (!param.point || !this._series) return;

		const rawPoint = this._getPointFromXY(
			Number(param.point.x),
			Number(param.point.y)
		);

		if (!rawPoint) return;

		this._lastPoint = rawPoint;

		if (this._editing && this._selectedRectangle) {
			this._applyEdit(this._lastPoint);
			return;
		}

		if (!this._drawing && !this._editing) {
			this._updateCursorFromPoint(param.point.x, param.point.y);
		}

		if (
			!this._drawing ||
			!this._isDragging ||
			!this._previewRectangle ||
			!this._dragStartPoint
		) {
			return;
		}

		const snappedPoint = this._snapPointToNearestOHLC(rawPoint);

		const normalized = this._normalizeRectanglePoints(
			this._dragStartPoint,
			snappedPoint
		);

		this._previewRectangle.updatePoints(normalized.p1, normalized.p2);
	}


	private _resetDragState() {
		this._isDragging = false;
		this._dragStartPoint = undefined;
		this._removePreviewRectangle();
	}

	private _createId(): string {
		try {
			if (typeof crypto !== 'undefined' && crypto.randomUUID) {
				return crypto.randomUUID();
			}
		} catch { }

		return `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
	}

	private _setChartDragEnabled(enabled: boolean): void {
		if (!this._chart) return;

		try {
			this._chart.applyOptions({
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

	private _toTimeNumber(time: any): number {
		if (typeof time === 'number') {
			return time;
		}

		if (typeof time === 'string') {
			const parsed = new Date(time).getTime();
			return isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
		}

		if (time?.year && time?.month && time?.day) {
			return Math.floor(
				new Date(time.year, time.month - 1, time.day).getTime() / 1000
			);
		}

		return 0;
	}

	private _timeKey(time: any): string {
		if (typeof time === 'number') {
			return `number:${time}`;
		}

		if (typeof time === 'string') {
			return `string:${time}`;
		}

		if (time?.year && time?.month && time?.day) {
			return `business:${time.year}-${time.month}-${time.day}`;
		}

		return JSON.stringify(time);
	}

	private _normalizeCandle(raw: any): CandleOHLCData | null {
		if (!raw) return null;

		const time = raw.time ?? raw.Time;

		const open = Number(raw.open ?? raw.Open);
		const high = Number(raw.high ?? raw.High);
		const low = Number(raw.low ?? raw.Low);
		const close = Number(raw.close ?? raw.Close);

		if (
			time === undefined ||
			Number.isNaN(open) ||
			Number.isNaN(high) ||
			Number.isNaN(low) ||
			Number.isNaN(close)
		) {
			return null;
		}

		return {
			time,
			open,
			high,
			low,
			close,
		};
	}

	private _snapPointToNearestOHLC(point: Point): Point {
		if (this._defaultOptions.snapToOHLC === false) {
			return point;
		}

		const candle = this._ohlcMap.get(this._timeKey(point.time));

		if (!candle) {
			return point;
		}

		const candidates = [
			{ key: 'open', price: candle.open },
			{ key: 'high', price: candle.high },
			{ key: 'low', price: candle.low },
			{ key: 'close', price: candle.close },
		].filter(x => typeof x.price === 'number' && !Number.isNaN(x.price));

		if (!candidates.length) {
			return point;
		}

		let nearest = candidates[0];

		for (const item of candidates) {
			if (
				Math.abs(item.price - point.price) <
				Math.abs(nearest.price - point.price)
			) {
				nearest = item;
			}
		}

		return {
			time: candle.time,
			price: nearest.price,
		};
	}

	setCandleData(data: any[]): void {
		this._ohlcMap.clear();
		this._ohlcCandles = [];

		if (!Array.isArray(data)) return;

		for (const raw of data) {
			const candle = this._normalizeCandle(raw);

			if (!candle) continue;

			this._ohlcMap.set(this._timeKey(candle.time), candle);
			this._ohlcCandles.push(candle);
		}

		this._ohlcCandles.sort((a, b) => {
			return this._toTimeNumber(a.time) - this._toTimeNumber(b.time);
		});
	}


	private _findRectangleAtPoint(point: Point): StoredRectangleItem | null {
		const clickedTime = this._toTimeNumber(point.time);
		const clickedPrice = point.price;

		for (let i = this._rectangles.length - 1; i >= 0; i--) {
			const item = this._rectangles[i];

			const p1Time = this._toTimeNumber(item.p1.time);
			const p2Time = this._toTimeNumber(item.p2.time);

			const startTime = Math.min(p1Time, p2Time);
			const endTime = Math.max(p1Time, p2Time);

			const top = Math.max(item.p1.price, item.p2.price);
			const bottom = Math.min(item.p1.price, item.p2.price);

			const priceHit = clickedPrice >= bottom && clickedPrice <= top;

			let timeHit = false;

			if (item.extendRight) {
				timeHit = clickedTime >= startTime;
			} else {
				timeHit = clickedTime >= startTime && clickedTime <= endTime;
			}

			if (priceHit && timeHit) {
				return item;
			}
		}

		return null;
	}

	private _getRectanglePixelBounds(item: StoredRectangleItem) {
		if (!this._chart || !this._series || !this._chartContainer) return null;

		const timeScale = this._chart.timeScale();

		const p1X = timeScale.timeToCoordinate(item.p1.time);

		const p2X = item.extendRight
			? (this._chartContainer.clientWidth as Coordinate)
			: timeScale.timeToCoordinate(item.p2.time);

		const p1Y = this._series.priceToCoordinate(item.p1.price);
		const p2Y = this._series.priceToCoordinate(item.p2.price);

		if (p1X === null || p2X === null || p1Y === null || p2Y === null) {
			return null;
		}

		const left = Math.min(Number(p1X), Number(p2X));
		const right = Math.max(Number(p1X), Number(p2X));
		const top = Math.min(Number(p1Y), Number(p2Y));
		const bottom = Math.max(Number(p1Y), Number(p2Y));

		return { left, right, top, bottom };
	}

	private _getEditModeFromMouseEvent(event: MouseEvent): RectangleEditMode {
		if (!this._chartContainer || !this._selectedRectangle) return 'none';

		const rect = this._chartContainer.getBoundingClientRect();

		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		return this._getEditModeFromXY(x, y);
	}

	private _getEditModeFromXY(x: number, y: number): RectangleEditMode {
		if (!this._selectedRectangle) return 'none';

		const bounds = this._getRectanglePixelBounds(this._selectedRectangle);
		if (!bounds) return 'none';

		const tolerance = 10;

		const insideX = x >= bounds.left && x <= bounds.right;
		const insideY = y >= bounds.top && y <= bounds.bottom;

		const nearTop = Math.abs(y - bounds.top) <= tolerance;
		const nearBottom = Math.abs(y - bounds.bottom) <= tolerance;
		const nearLeft = Math.abs(x - bounds.left) <= tolerance;

		const nearRight =
			!this._selectedRectangle.extendRight &&
			Math.abs(x - bounds.right) <= tolerance;

		// IMPORTANT:
		// Corners must be checked first.
		// Otherwise top/bottom edge wins and it only moves up/down.
		if (nearTop && nearLeft) return 'top-left';
		if (nearBottom && nearLeft) return 'bottom-left';

		if (nearTop && nearRight) return 'top-right';
		if (nearBottom && nearRight) return 'bottom-right';

		if (insideX && nearTop) return 'top';
		if (insideX && nearBottom) return 'bottom';
		if (insideY && nearLeft) return 'left';
		if (insideY && nearRight) return 'right';

		// Body dragging disabled
		return 'none';
	}


	private _updateCursorFromPoint(x: Coordinate, y: Coordinate): void {
		if (!this._chartContainer) return;

		if (
			!this._defaultOptions.enableSelection ||
			!this._defaultOptions.enableEditing ||
			!this._selectedRectangle
		) {
			this._chartContainer.style.cursor = 'default';
			return;
		}

		const mode = this._getEditModeFromXY(Number(x), Number(y));

		if (mode === 'top-left' || mode === 'bottom-right') {
			this._chartContainer.style.cursor = 'nwse-resize';
			return;
		}

		if (mode === 'bottom-left' || mode === 'top-right') {
			this._chartContainer.style.cursor = 'nesw-resize';
			return;
		}

		if (mode === 'top' || mode === 'bottom') {
			this._chartContainer.style.cursor = 'ns-resize';
			return;
		}

		if (mode === 'left' || mode === 'right') {
			this._chartContainer.style.cursor = 'ew-resize';
			return;
		}

		this._chartContainer.style.cursor = 'default';
	}

	private _applyEdit(currentPoint: Point): void {
		if (
			!this._selectedRectangle ||
			!this._editStartPoint ||
			!this._editOriginalP1 ||
			!this._editOriginalP2
		) {
			return;
		}

		// Do not allow chart to pan while editing zone.
		this._setChartDragEnabled(false);

		const snappedPoint = this._snapPointToNearestOHLC(currentPoint);

		let newP1: Point = { ...this._editOriginalP1 };
		let newP2: Point = { ...this._editOriginalP2 };

		const originalP1 = this._editOriginalP1;
		const originalP2 = this._editOriginalP2;

		const p1IsTop = originalP1.price >= originalP2.price;
		const p1IsBottom = originalP1.price <= originalP2.price;

		const p1Time = this._toTimeNumber(originalP1.time);
		const p2Time = this._toTimeNumber(originalP2.time);

		const p1IsLeft = p1Time <= p2Time;
		const p2IsLeft = p2Time < p1Time;

		const setTopPrice = () => {
			// No min/max restriction.
			// User can drag top edge below bottom edge if required.
			if (p1IsTop) {
				newP1.price = snappedPoint.price;
			} else {
				newP2.price = snappedPoint.price;
			}
		};

		const setBottomPrice = () => {
			// No min/max restriction.
			// User can drag bottom edge above top edge if required.
			if (p1IsBottom) {
				newP1.price = snappedPoint.price;
			} else {
				newP2.price = snappedPoint.price;
			}
		};

		const setLeftTime = () => {
			// For extendRight=true manual zones, visible left side should move.
			// In your manual zone, p1 is usually the left/start time.
			if (this._selectedRectangle?.extendRight) {
				newP1.time = snappedPoint.time;
				return;
			}

			if (p1IsLeft) {
				newP1.time = snappedPoint.time;
			} else if (p2IsLeft) {
				newP2.time = snappedPoint.time;
			}
		};

		const setRightTime = () => {
			// Right edge is editable only for normal rectangle.
			// For manual Buy/Sell zone extendRight=true, right side is chart extreme right.
			if (this._selectedRectangle?.extendRight) return;

			if (!p1IsLeft) {
				newP1.time = snappedPoint.time;
			} else {
				newP2.time = snappedPoint.time;
			}
		};

		// =========================
		// Edge edit
		// =========================
		if (this._editMode === 'top') {
			setTopPrice();
		}

		if (this._editMode === 'bottom') {
			setBottomPrice();
		}

		if (this._editMode === 'left') {
			setLeftTime();
		}

		if (this._editMode === 'right') {
			setRightTime();
		}

		// =========================
		// Corner edit
		// This is what you need.
		// It changes candle/time + price together.
		// =========================
		if (this._editMode === 'top-left') {
			setLeftTime();
			setTopPrice();
		}

		if (this._editMode === 'bottom-left') {
			setLeftTime();
			setBottomPrice();
		}

		if (this._editMode === 'top-right') {
			setRightTime();
			setTopPrice();
		}

		if (this._editMode === 'bottom-right') {
			setRightTime();
			setBottomPrice();
		}

		// Body move is disabled from _getEditModeFromXY().
		// Keeping this only for safety.
		if (this._editMode === 'move') {
			const priceDiff = snappedPoint.price - this._editStartPoint.price;

			newP1 = {
				time: originalP1.time,
				price: originalP1.price + priceDiff,
			};

			newP2 = {
				time: originalP2.time,
				price: originalP2.price + priceDiff,
			};
		}

		// IMPORTANT:
		// For manual zones extendRight=true, do NOT normalize during edit.
		// Normalizing while editing causes jump/vanish behavior.
		if (this._selectedRectangle.extendRight) {
			this._selectedRectangle.p1 = newP1;
			this._selectedRectangle.p2 = newP2;

			this._selectedRectangle.rectangle.updatePoints(newP1, newP2);
			return;
		}

		const normalized = this._normalizeRectanglePoints(newP1, newP2);

		this._selectedRectangle.p1 = normalized.p1;
		this._selectedRectangle.p2 = normalized.p2;

		this._selectedRectangle.rectangle.updatePoints(normalized.p1, normalized.p2);
	}

	private _toManualRecord(item: StoredRectangleItem): ManualRectangleRecord {
		return {
			id: item.id,
			p1: item.p1,
			p2: item.p2,
			extendRight: item.extendRight,
			options: item.options,
		};
	}

	private _selectRectangle(item: StoredRectangleItem | null): void {
		if (this._selectedRectangle) {
			this._selectedRectangle.rectangle.applyOptions({
				fillColor: this._selectedRectangle.options.fillColor,
				outlineColor: this._selectedRectangle.options.outlineColor,
				outlineWidth: this._selectedRectangle.options.outlineWidth ?? 1,
				text: this._selectedRectangle.options.text,
				color:
					this._selectedRectangle.options.textColor ||
					this._selectedRectangle.options.color,
				textColor:
					this._selectedRectangle.options.textColor ||
					this._selectedRectangle.options.color,
			});
		}

		this._selectedRectangle = item;

		if (this._selectedRectangle) {
			this._selectedRectangle.rectangle.applyOptions({
				fillColor: this._selectedRectangle.options.fillColor,
				outlineColor: this._defaultOptions.selectedOutlineColor || '#111827',
				outlineWidth: this._defaultOptions.selectedOutlineWidth ?? 2,
				text: this._selectedRectangle.options.text,
				color:
					this._selectedRectangle.options.textColor ||
					this._selectedRectangle.options.color,
				textColor:
					this._selectedRectangle.options.textColor ||
					this._selectedRectangle.options.color,
			});

			this._defaultOptions.onRectangleSelected?.(
				this._toManualRecord(this._selectedRectangle)
			);
		} else {
			this._defaultOptions.onRectangleSelected?.(null);
		}
	}

	startDrawing(): void {
		this._drawing = true;
		this._isDragging = false;
		this._dragStartPoint = undefined;

		this._setChartDragEnabled(false);

		if (this._toolbarButton) {
			this._toolbarButton.style.background = 'rgba(57, 193, 143, 0.22)';
			this._toolbarButton.style.border = '1px solid rgba(57, 193, 143, 0.9)';
		}
	}

	stopDrawing(): void {
		this._drawing = false;
		this._resetDragState();

		this._setChartDragEnabled(true);

		if (this._toolbarButton) {
			this._toolbarButton.style.background = 'transparent';
			this._toolbarButton.style.border = '1px solid transparent';
		}
	}

	isDrawing(): boolean {
		return this._drawing;
	}

	hasSelectedRectangle(): boolean {
		return !!this._selectedRectangle;
	}

	setSelectionEnabled(enabled: boolean): void {
		this._defaultOptions.enableSelection = enabled;

		if (!enabled) {
			try {
				this._selectRectangle(null);
			} catch { }
		}
	}

	deleteSelectedRectangle(): boolean {
		if (!this._selectedRectangle) {
			return false;
		}

		const selected = this._selectedRectangle;
		const deletedRecord = this._toManualRecord(selected);

		try {
			this._removeRectangle(selected.rectangle);
		} catch { }

		this._rectangles = this._rectangles.filter(item => item.id !== selected.id);

		this._selectedRectangle = null;

		this._defaultOptions.onRectangleDeleted?.(deletedRecord);

		return true;
	}

	removeAllRectangles() {
		this._rectangles.forEach(item => {
			this._removeRectangle(item.rectangle);
		});

		this._rectangles = [];
		this._selectedRectangle = null;
		this._removePreviewRectangle();
	}

	addRectangle(
		p1: Point,
		p2: Point,
		options: RectangleStyleOptions,
		id?: string
	): ManualRectangleRecord {
		const normalized = this._normalizeRectanglePoints(p1, p2);
		return this._addNewRectangle(normalized.p1, normalized.p2, options, id);
	}


	addRectanglesFromData(dataPoints: Point[], options: RectangleStyleOptions) {
		if (!dataPoints || dataPoints.length < 2) return;

		const rectOptions: RectangleStyleOptions = {
			fillColor: options.fillColor,
			outlineColor: options.outlineColor,
			outlineWidth: options.outlineWidth ?? 1,
			text: options.text,
			color: options.textColor || options.color,
			textColor: options.textColor || options.color,
		};

		const normalized = this._normalizeRectanglePoints(dataPoints[0], dataPoints[1]);

		this._addNewRectangle(normalized.p1, normalized.p2, rectOptions);
	}


	private _addNewRectangle(
		p1: Point,
		p2: Point,
		rectOptions: RectangleStyleOptions,
		id?: string
	): ManualRectangleRecord {
		const normalizedOptions: RectangleStyleOptions = {
			fillColor: rectOptions.fillColor,
			outlineColor: rectOptions.outlineColor,
			outlineWidth: rectOptions.outlineWidth ?? 1,
			text: rectOptions.text,
			color: rectOptions.textColor || rectOptions.color,
			textColor: rectOptions.textColor || rectOptions.color,
		};

		const rectangle = new Rectangle(p1, p2, {
			...this._defaultOptions,
			fillColor: normalizedOptions.fillColor,
			outlineColor: normalizedOptions.outlineColor,
			outlineWidth: normalizedOptions.outlineWidth,
			text: normalizedOptions.text,
			color: normalizedOptions.color,
			textColor: normalizedOptions.textColor,
			extendRight: this._defaultOptions.extendRight,
		});

		const storedItem: StoredRectangleItem = {
			id: id || this._createId(),
			rectangle,
			p1,
			p2,
			options: normalizedOptions,
			extendRight: !!this._defaultOptions.extendRight,
		};

		this._rectangles.push(storedItem);

		ensureDefined(this._series).attachPrimitive(rectangle);

		return this._toManualRecord(storedItem);
	}

	private _removeRectangle(rectangle: Rectangle) {
		try {
			ensureDefined(this._series).detachPrimitive(rectangle);
		} catch { }
	}

	private _addPreviewRectangle(p: Point) {
		this._previewRectangle = new PreviewRectangle(p, p, {
			...this._defaultOptions,

			// IMPORTANT:
			// While drawing manual Buy/Sell zone,
			// preview should extend right like final zone.
			extendRight: this._defaultOptions.extendRight !== false,

			fillColor:
				this._defaultOptions.previewFillColor ||
				this._defaultOptions.fillColor ||
				'rgba(37, 99, 235, 0.12)',

			outlineColor:
				this._defaultOptions.outlineColor ||
				this._defaultOptions.color ||
				'#2563eb',

			outlineWidth: this._defaultOptions.outlineWidth ?? 1,

			text: this._defaultOptions.text,

			color:
				this._defaultOptions.textColor ||
				this._defaultOptions.color ||
				this._defaultOptions.outlineColor,

			textColor:
				this._defaultOptions.textColor ||
				this._defaultOptions.color ||
				this._defaultOptions.outlineColor,
		});

		ensureDefined(this._series).attachPrimitive(this._previewRectangle);
	}

	isMouseEventOverRectangle(event: MouseEvent): boolean {
		const point = this._getPointFromMouseEvent(event);

		if (!point) {
			return false;
		}

		return !!this._findRectangleAtPoint(point);
	}

	private _removePreviewRectangle() {
		if (this._previewRectangle) {
			try {
				ensureDefined(this._series).detachPrimitive(this._previewRectangle);
			} catch { }

			this._previewRectangle = undefined;
		}
	}

	private _addToolbarButton() {
		if (!this._drawingsToolbarContainer) return;

		const button = document.createElement('div');

		button.style.width = '24px';
		button.style.height = '24px';
		button.style.display = 'flex';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.cursor = 'pointer';
		button.style.borderRadius = '4px';
		button.style.border = '1px solid transparent';
		button.style.color = '#111827';
		button.title = 'Draw Rectangle Zone';

		button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="1"></rect>
      </svg>
    `;

		button.addEventListener('click', () => {
			if (this.isDrawing()) {
				this.stopDrawing();
			} else {
				this.startDrawing();
			}
		});

		this._drawingsToolbarContainer.appendChild(button);
		this._toolbarButton = button;

		const colorPicker = document.createElement('input');

		colorPicker.type = 'color';
		colorPicker.value = '#2563eb';
		colorPicker.title = 'Rectangle Color';
		colorPicker.style.width = '24px';
		colorPicker.style.height = '22px';
		colorPicker.style.border = 'none';
		colorPicker.style.padding = '0px';
		colorPicker.style.backgroundColor = 'transparent';
		colorPicker.style.cursor = 'pointer';

		colorPicker.addEventListener('change', () => {
			const newColor = colorPicker.value;

			this._defaultOptions.fillColor = newColor + '33';
			this._defaultOptions.previewFillColor = newColor + '22';
			this._defaultOptions.labelColor = newColor;
			this._defaultOptions.outlineColor = newColor;
			this._defaultOptions.color = newColor;
			this._defaultOptions.textColor = newColor;
		});

		this._drawingsToolbarContainer.appendChild(colorPicker);
		this._colorPicker = colorPicker;
	}

	setDrawingStyle(options: RectangleStyleOptions): void {
		this._defaultOptions.fillColor = options.fillColor;
		this._defaultOptions.previewFillColor = options.fillColor;
		this._defaultOptions.outlineColor = options.outlineColor;
		this._defaultOptions.outlineWidth = options.outlineWidth ?? 1;
		this._defaultOptions.text = options.text;
		this._defaultOptions.color = options.textColor || options.color;
		this._defaultOptions.textColor = options.textColor || options.color;
	}

	destroy() {
		try {
			this.removeAllRectangles();
		} catch { }

		try {
			if (this._chart) {
				this._chart.unsubscribeCrosshairMove(this._moveHandler);
			}
		} catch { }

		try {
			if (this._chartContainer) {
				this._chartContainer.removeEventListener(
					'mousedown',
					this._mouseDownHandler,
					true
				);

				this._chartContainer.removeEventListener('click', this._clickHandler, true);
				window.removeEventListener('mouseup', this._mouseUpHandler, true);
			}

			window.removeEventListener('mouseup', this._mouseUpHandler);
		} catch { }

		this._toolbarButton = undefined;
		this._colorPicker = undefined;
		this._chart = undefined;
		this._series = undefined;
		this._chartContainer = undefined;
		this._ohlcMap.clear();
		this._ohlcCandles = [];
	}
}
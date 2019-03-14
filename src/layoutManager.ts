import * as Utils from './utils';
import { translationValue, visibilityValue, extraSizeForInsertion, containersInDraggable } from './constants';
import { Orientation, ElementX, Rect, Dictionary, Position, IContainer, OffsetSize } from './interfaces';

export interface PropMap {
	[key: string]: any;
}

const horizontalMap: PropMap = {
	size: 'offsetWidth',
	distanceToParent: 'offsetLeft',
	translate: 'transform',
	begin: 'left',
	end: 'right',
	dragPosition: 'x',
	scrollSize: 'scrollWidth',
	offsetSize: 'offsetWidth',
	scrollValue: 'scrollLeft',
	scale: 'scaleX',
	setSize: 'width',
	setters: {
		'translate': (val: number) => `translate3d(${val}px, 0, 0)`
	}
};

const verticalMap: PropMap = {
	size: 'offsetHeight',
	distanceToParent: 'offsetTop',
	translate: 'transform',
	begin: 'top',
	end: 'bottom',
	dragPosition: 'y',
	scrollSize: 'scrollHeight',
	offsetSize: 'offsetHeight',
	scrollValue: 'scrollTop',
	scale: 'scaleY',
	setSize: 'height',
	setters: {
		'translate': (val: string) => `translate3d(0,${val}px, 0)`
	}
};

function orientationDependentProps(map: PropMap) {
	function get(obj: Dictionary, prop:string) {
		const mappedProp = map[prop];
		return obj[mappedProp || prop];
	}

	function set(obj: Dictionary, prop: string, value: any) {
        requestAnimationFrame(() => {
            obj[map[prop]] = map.setters[prop] ? map.setters[prop](value) : value;
        });
    }

	return { get, set };
}



export default function layoutManager(containerElement: ElementX, orientation: Orientation, _animationDuration: number) {
	containerElement[extraSizeForInsertion] = 0;
	const animationDuration = _animationDuration;
	const map = orientation === 'horizontal' ? horizontalMap : verticalMap;
	const propMapper = orientationDependentProps(map);
	const values: Dictionary = {
		translation: 0
	};
	let registeredScrollListener: Function | null = null;

	global.addEventListener('resize', function() {
		invalidateContainerRectangles(containerElement);
		// invalidateContainerScale(containerElement);
	});

	setTimeout(() => {
		invalidate();
	}, 10);
	// invalidate();

	const scrollListener = Utils.listenScrollParent(containerElement, function() {
		invalidateContainerRectangles(containerElement);
		registeredScrollListener && registeredScrollListener();
	});
	function invalidate() {
		invalidateContainerRectangles(containerElement);
		invalidateContainerScale(containerElement);
	}

	let visibleRect: Rect;
	function invalidateContainerRectangles(containerElement: ElementX) {
		values.rect = Utils.getContainerRect(containerElement);
		values.visibleRect = Utils.getVisibleRect(containerElement, values.rect);
	}

	function invalidateContainerScale(containerElement: ElementX) {
		const rect = containerElement.getBoundingClientRect();
		values.scaleX = containerElement.offsetWidth ? ((rect.right - rect.left) / containerElement.offsetWidth) : 1;
		values.scaleY = containerElement.offsetHeight ? ((rect.bottom - rect.top) / containerElement.offsetHeight) : 1;
	}

	function getContainerRectangles() {
		return {
			rect: values.rect,
			visibleRect: values.visibleRect
		};
	}

	function getBeginEndOfDOMRect(rect: Rect) {
		return {
			begin: propMapper.get(rect, 'begin'),
			end: propMapper.get(rect, 'end')
		};
	}

	function getBeginEndOfContainer() {
		const begin = propMapper.get(values.rect, 'begin') + values.translation;
		const end = propMapper.get(values.rect, 'end') + values.translation;
		return { begin, end };
	}

	function getBeginEndOfContainerVisibleRect() {
		const begin = propMapper.get(values.visibleRect, 'begin') + values.translation;
		const end = propMapper.get(values.visibleRect, 'end') + values.translation;
		return { begin, end };
	}

	function getContainerScale() {
		return { scaleX: values.scaleX, scaleY: values.scaleY };
	}

	function getSize(element: HTMLElement | OffsetSize) {
		return propMapper.get(element, 'size') * propMapper.get(values, 'scale');
	}

	function getDistanceToOffsetParent(element: ElementX) {
		const distance = propMapper.get(element, 'distanceToParent') + (element[translationValue] || 0);
		return distance * propMapper.get(values, 'scale');
	}

	function getBeginEnd(element: HTMLElement) {
		const begin = getDistanceToOffsetParent(element) + (propMapper.get(values.rect, 'begin') + values.translation) - propMapper.get(containerElement, 'scrollValue');
		return {
			begin,
			end: begin + getSize(element) * propMapper.get(values, 'scale')
		};
	}

	function setSize(element: HTMLElement | CSSStyleDeclaration, size: string) {
		propMapper.set(element, 'setSize', size);
	}

	function getAxisValue(position: Position) {
		return propMapper.get(position, 'dragPosition');
	}

	function updateDescendantContainerRects(container: IContainer) {
		container.layout.invalidateRects();
		container.onTranslated();
		if (container.getChildContainers()) {
			container.getChildContainers().forEach(p => updateDescendantContainerRects(p));
		}
	}

	function setTranslation(element: ElementX, translation: number) {
		if (!translation) {
			element.style.removeProperty('transform');
		} else {
			propMapper.set(element.style, 'translate', translation);
		}
		element[translationValue] = translation;

		if (element[containersInDraggable]) {
			setTimeout(() => {
				element[containersInDraggable].forEach((p: IContainer) => {
					updateDescendantContainerRects(p);
				});
			}, animationDuration + 20);
		}
	}

	function getTranslation(element: ElementX) {
		return element[translationValue];
	}

	function setVisibility(element: ElementX, isVisible: boolean) {
		if (element[visibilityValue] === undefined || element[visibilityValue] !== isVisible) {
			if (isVisible) {
				element.style.removeProperty('visibility');
			} else {
				element.style.visibility = 'hidden';
			}
			element[visibilityValue] = isVisible;
		}
	}

	function isVisible(element: ElementX) {
		return element[visibilityValue] === undefined || element[visibilityValue];
	}

	function isInVisibleRect(x: number, y: number) {
		let { left, top, right, bottom } = values.visibleRect;

		// if there is no wrapper in rect size will be 0 and wont accept any drop
		// so make sure at least there is 30px difference
		if (bottom - top < 2) {
			bottom = top + 30;
		}
		const containerRect = values.rect;
		if (orientation === 'vertical') {
			return x > containerRect.left && x < containerRect.right && y > top && y < bottom;
		} else {
			return x > left && x < right && y > containerRect.top && y < containerRect.bottom;
		}
	}

	function setScrollListener(callback: Function) {
		registeredScrollListener = callback;
	}

	function getTopLeftOfElementBegin(begin: number) {
		let top = 0;
		let left = 0;
		if (orientation === 'horizontal') {
			left = begin;
			top = values.rect.top;
		} else {
			left = values.rect.left;
			top = begin;
		}

		return {
			top, left
		};
	}

	function getScrollSize(element: HTMLElement) {
		return propMapper.get(element, 'scrollSize');
	}

	function getScrollValue(element: HTMLElement) {
		return propMapper.get(element, 'scrollValue');
	}

	function setScrollValue(element:HTMLElement, val: number) {
		return propMapper.set(element, 'scrollValue', val);
	}

	function dispose() {
		if (scrollListener) {
			scrollListener.dispose();
		}

		// if (visibleRect) {
		// 	visibleRect.parentNode.removeChild(visibleRect);
		// 	visibleRect = null;
		// }
	}

	function getPosition(position: Position) {
		return isInVisibleRect(position.x, position.y) ? getAxisValue(position) : null;
	}

	function invalidateRects() {
		invalidateContainerRectangles(containerElement);
	}

	return {
		getSize,
		//getDistanceToContainerBegining,
		getContainerRectangles,
		getBeginEndOfDOMRect,
		getBeginEndOfContainer,
		getBeginEndOfContainerVisibleRect,
		getBeginEnd,
		getAxisValue,
		setTranslation,
		getTranslation,
		setVisibility,
		isVisible,
		isInVisibleRect,
		dispose,
		getContainerScale,
		setScrollListener,
		setSize,
		getTopLeftOfElementBegin,
		getScrollSize,
		getScrollValue,
		setScrollValue,
		invalidate,
		invalidateRects,
		getPosition,
	};
}
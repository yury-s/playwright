# class: Touchscreen
* since: v1.8

The Touchscreen class operates in main-frame CSS pixels relative to the top-left corner of the viewport. Methods on the
touchscreen can only be used in browser contexts that have been initialized with `hasTouch` set to true.

## async method: Touchscreen.tap
* since: v1.8

Dispatches a `touchstart` and `touchend` event with a single touch at the position ([`param: x`],[`param: y`]).

:::note
[`method: Page.tap`] the method will throw if [`option: hasTouch`] option of the browser context is false.
:::

### param: Touchscreen.tap.x
* since: v1.8
- `x` <[float]>

### param: Touchscreen.tap.y
* since: v1.8
- `y` <[float]>

## async method: Touchscreen.swipe
* since: v1.46

Synthesizes a scroll gesture over a time period by issuing appropriate touch events.

### param: Touchscreen.swipe.x
* since: v1.46
- `x` <[float]>

X coordinate of the start of the gesture in CSS pixels.

### param: Touchscreen.swipe.y
* since: v1.46
- `y` <[float]>

Y coordinate of the start of the gesture in CSS pixels.

### param: Touchscreen.swipe.xDistance
* since: v1.46
- `xDistance` <[float]>

The distance to scroll along the X axis (positive to scroll left).

### param: Touchscreen.swipe.yDistance
* since: v1.46
- `yDistance` <[float]>

The distance to scroll along the Y axis (positive to scroll up).

### option: Touchscreen.swipe.speed
* since: v1.46
- `speed` ?<[int]>

Swipe speed in pixels per second. Defaults to `1000`.

### option: Touchscreen.swipe.steps
* since: v1.46
- `steps` ?<[int]>

The number of `touchmove` events that will be fired for the gesture. Defaults to `1`.

# class: Frame

At every point of time, page exposes its current frame tree via the [`method: Page.mainFrame`] and
[`method: Frame.childFrames`] methods.

[Frame] object's lifecycle is controlled by three events, dispatched on the page object:
* [`event: Page.frameattached`] - fired when the frame gets attached to the page. A Frame can be attached to the page
  only once.
* [`event: Page.framenavigated`] - fired when the frame commits navigation to a different URL.
* [`event: Page.framedetached`] - fired when the frame gets detached from the page.  A Frame can be detached from the
  page only once.

An example of dumping frame tree:

```js
const { firefox } = require('playwright');  // Or 'chromium' or 'webkit'.

(async () => {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  await page.goto('https://www.google.com/chrome/browser/canary.html');
  dumpFrameTree(page.mainFrame(), '');
  await browser.close();

  function dumpFrameTree(frame, indent) {
    console.log(indent + frame.url());
    for (const child of frame.childFrames()) {
      dumpFrameTree(child, indent + '  ');
    }
  }
})();
```

```python async
import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    firefox = playwright.firefox
    browser = await firefox.launch()
    page = await browser.new_page()
    await page.goto("https://www.theverge.com")
    dump_frame_tree(page.main_frame, "")
    await browser.close()

def dump_frame_tree(frame, indent):
    print(indent + frame.name + '@' + frame.url)
    for child in frame.child_frames:
        dump_frame_tree(child, indent + "    ")

async def main():
    async with async_playwright() as playwright:
        await run(playwright)
asyncio.run(main())
```

```python sync
from playwright.sync_api import sync_playwright

def run(playwright):
    firefox = playwright.firefox
    browser = firefox.launch()
    page = browser.new_page()
    page.goto("https://www.theverge.com")
    dump_frame_tree(page.main_frame, "")
    browser.close()

def dump_frame_tree(frame, indent):
    print(indent + frame.name + '@' + frame.url)
    for child in frame.child_frames:
        dump_frame_tree(child, indent + "    ")

with sync_playwright() as playwright:
    run(playwright)
```

## async method: Frame.$
* langs:
  - alias-python: query_selector
  - alias-csharp: QuerySelectorAsync
- returns: <[null]|[ElementHandle]>

Returns the ElementHandle pointing to the frame element.

The method finds an element matching the specified selector within the frame. See
[Working with selectors](./selectors.md) for more details. If no elements match the selector,
returns `null`.

### param: Frame.$.selector = %%-query-selector-%%

## async method: Frame.$$
* langs:
  - alias-python: query_selector_all
  - alias-csharp: QuerySelectorAllAsync
- returns: <[Array]<[ElementHandle]>>

Returns the ElementHandles pointing to the frame elements.

The method finds all elements matching the specified selector within the frame. See
[Working with selectors](./selectors.md) for more details. If no elements match the selector,
returns empty array.

### param: Frame.$$.selector = %%-query-selector-%%

## async method: Frame.$eval
* langs:
  - alias-python: eval_on_selector
  - alias-csharp: EvalOnSelectorAsync
- returns: <[Serializable]>

Returns the return value of [`param: pageFunction`]

The method finds an element matching the specified selector within the frame and passes it as a first argument to
[`param: pageFunction`]. See [Working with selectors](./selectors.md) for more details. If no
elements match the selector, the method throws an error.

If [`param: pageFunction`] returns a [Promise], then `frame.$eval` would wait for the promise to resolve and return its
value.

Examples:

```js
const searchValue = await frame.$eval('#search', el => el.value);
const preloadHref = await frame.$eval('link[rel=preload]', el => el.href);
const html = await frame.$eval('.main-container', (e, suffix) => e.outerHTML + suffix, 'hello');
```

```python async
search_value = await frame.eval_on_selector("#search", "el => el.value")
preload_href = await frame.eval_on_selector("link[rel=preload]", "el => el.href")
html = await frame.eval_on_selector(".main-container", "(e, suffix) => e.outerHTML + suffix", "hello")
```

```python sync
search_value = frame.eval_on_selector("#search", "el => el.value")
preload_href = frame.eval_on_selector("link[rel=preload]", "el => el.href")
html = frame.eval_on_selector(".main-container", "(e, suffix) => e.outerHTML + suffix", "hello")
```

### param: Frame.$eval.selector = %%-query-selector-%%

### param: Frame.$eval.pageFunction
* langs: js
- `pageFunction` <[function]\([Element]\)>

Function to be evaluated in browser context

### param: Frame.$eval.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

## async method: Frame.$$eval
* langs:
  - alias-python: eval_on_selector_all
  - alias-csharp: EvalOnSelectorAllAsync
- returns: <[Serializable]>

Returns the return value of [`param: pageFunction`]

The method finds all elements matching the specified selector within the frame and passes an array of matched elements
as a first argument to [`param: pageFunction`]. See [Working with selectors](./selectors.md) for
more details.

If [`param: pageFunction`] returns a [Promise], then `frame.$$eval` would wait for the promise to resolve and return its
value.

Examples:

```js
const divsCounts = await frame.$$eval('div', (divs, min) => divs.length >= min, 10);
```

```python async
divs_counts = await frame.eval_on_selector_all("div", "(divs, min) => divs.length >= min", 10)
```

```python sync
divs_counts = frame.eval_on_selector_all("div", "(divs, min) => divs.length >= min", 10)
```

### param: Frame.$$eval.selector = %%-query-selector-%%

### param: Frame.$$eval.pageFunction
* langs: js
- `pageFunction` <[function]\([Array]<[Element]>\)>

Function to be evaluated in browser context

### param: Frame.$$eval.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

## async method: Frame.addScriptTag
- returns: <[ElementHandle]>

Returns the added tag when the script's onload fires or when the script content was injected into frame.

Adds a `<script>` tag into the page with the desired url or content.

### option: Frame.addScriptTag.url
- `url` <[string]>

URL of a script to be added.

### option: Frame.addScriptTag.path
- `path` <[path]>

Path to the JavaScript file to be injected into frame. If `path` is a relative path, then it is resolved relative to the
current working directory.

### option: Frame.addScriptTag.content
- `content` <[string]>

Raw JavaScript content to be injected into frame.

### option: Frame.addScriptTag.type
- `type` <[string]>

Script type. Use 'module' in order to load a Javascript ES6 module. See
[script](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script) for more details.

## async method: Frame.addStyleTag
- returns: <[ElementHandle]>

Returns the added tag when the stylesheet's onload fires or when the CSS content was injected into frame.

Adds a `<link rel="stylesheet">` tag into the page with the desired url or a `<style type="text/css">` tag with the
content.

### option: Frame.addStyleTag.url
- `url` <[string]>

URL of the `<link>` tag.

### option: Frame.addStyleTag.path
- `path` <[path]>

Path to the CSS file to be injected into frame. If `path` is a relative path, then it is resolved relative to the
current working directory.

### option: Frame.addStyleTag.content
- `content` <[string]>

Raw CSS content to be injected into frame.

## async method: Frame.check

This method checks an element matching [`param: selector`] by performing the following steps:
1. Find an element match matching [`param: selector`]. If there is none, wait until a matching element is attached to
   the DOM.
1. Ensure that matched element is a checkbox or a radio input. If not, this method rejects. If the element is already
   checked, this method returns immediately.
1. Wait for [actionability](./actionability.md) checks on the matched element, unless [`option: force`] option is
   set. If the element is detached during the checks, the whole action is retried.
1. Scroll the element into view if needed.
1. Use [`property: Page.mouse`] to click in the center of the element.
1. Wait for initiated navigations to either succeed or fail, unless [`option: noWaitAfter`] option is set.
1. Ensure that the element is now checked. If not, this method rejects.

When all steps combined have not finished during the specified [`option: timeout`], this method rejects with a
[TimeoutError]. Passing zero timeout disables this.

### param: Frame.check.selector = %%-input-selector-%%

### option: Frame.check.force = %%-input-force-%%

### option: Frame.check.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.check.timeout = %%-input-timeout-%%

## method: Frame.childFrames
- returns: <[Array]<[Frame]>>

## async method: Frame.click

This method clicks an element matching [`param: selector`] by performing the following steps:
1. Find an element match matching [`param: selector`]. If there is none, wait until a matching element is attached to
   the DOM.
1. Wait for [actionability](./actionability.md) checks on the matched element, unless [`option: force`] option is
   set. If the element is detached during the checks, the whole action is retried.
1. Scroll the element into view if needed.
1. Use [`property: Page.mouse`] to click in the center of the element, or the specified [`option: position`].
1. Wait for initiated navigations to either succeed or fail, unless [`option: noWaitAfter`] option is set.

When all steps combined have not finished during the specified [`option: timeout`], this method rejects with a
[TimeoutError]. Passing zero timeout disables this.

### param: Frame.click.selector = %%-input-selector-%%

### option: Frame.click.button = %%-input-button-%%

### option: Frame.click.clickCount = %%-input-click-count-%%

### option: Frame.click.delay = %%-input-down-up-delay-%%

### option: Frame.click.position = %%-input-position-%%

### option: Frame.click.modifiers = %%-input-modifiers-%%

### option: Frame.click.force = %%-input-force-%%

### option: Frame.click.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.click.timeout = %%-input-timeout-%%

## async method: Frame.content
- returns: <[string]>

Gets the full HTML contents of the frame, including the doctype.

## async method: Frame.dblclick

This method double clicks an element matching [`param: selector`] by performing the following steps:
1. Find an element match matching [`param: selector`]. If there is none, wait until a matching element is attached to
   the DOM.
1. Wait for [actionability](./actionability.md) checks on the matched element, unless [`option: force`] option is
   set. If the element is detached during the checks, the whole action is retried.
1. Scroll the element into view if needed.
1. Use [`property: Page.mouse`] to double click in the center of the element, or the specified [`option: position`].
1. Wait for initiated navigations to either succeed or fail, unless [`option: noWaitAfter`] option is set. Note that
   if the first click of the `dblclick()` triggers a navigation event, this method will reject.

When all steps combined have not finished during the specified [`option: timeout`], this method rejects with a
[TimeoutError]. Passing zero timeout disables this.

:::note
`frame.dblclick()` dispatches two `click` events and a single `dblclick` event.
:::

### param: Frame.dblclick.selector = %%-input-selector-%%

### option: Frame.dblclick.button = %%-input-button-%%

### option: Frame.dblclick.delay = %%-input-down-up-delay-%%

### option: Frame.dblclick.position = %%-input-position-%%

### option: Frame.dblclick.modifiers = %%-input-modifiers-%%

### option: Frame.dblclick.force = %%-input-force-%%

### option: Frame.dblclick.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.dblclick.timeout = %%-input-timeout-%%

## async method: Frame.dispatchEvent

The snippet below dispatches the `click` event on the element. Regardless of the visibility state of the elment, `click`
is dispatched. This is equivalend to calling
[element.click()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/click).

```js
await frame.dispatchEvent('button#submit', 'click');
```

```python async
await frame.dispatch_event("button#submit", "click")
```

```python sync
frame.dispatch_event("button#submit", "click")
```

Under the hood, it creates an instance of an event based on the given [`param: type`], initializes it with
[`param: eventInit`] properties and dispatches it on the element. Events are `composed`, `cancelable` and bubble by
default.

Since [`param: eventInit`] is event-specific, please refer to the events documentation for the lists of initial
properties:
* [DragEvent](https://developer.mozilla.org/en-US/docs/Web/API/DragEvent/DragEvent)
* [FocusEvent](https://developer.mozilla.org/en-US/docs/Web/API/FocusEvent/FocusEvent)
* [KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/KeyboardEvent)
* [MouseEvent](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent)
* [PointerEvent](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/PointerEvent)
* [TouchEvent](https://developer.mozilla.org/en-US/docs/Web/API/TouchEvent/TouchEvent)
* [Event](https://developer.mozilla.org/en-US/docs/Web/API/Event/Event)

You can also specify `JSHandle` as the property value if you want live objects to be passed into the event:

```js
// Note you can only create DataTransfer in Chromium and Firefox
const dataTransfer = await frame.evaluateHandle(() => new DataTransfer());
await frame.dispatchEvent('#source', 'dragstart', { dataTransfer });
```

```python async
# note you can only create data_transfer in chromium and firefox
data_transfer = await frame.evaluate_handle("new DataTransfer()")
await frame.dispatch_event("#source", "dragstart", { "dataTransfer": data_transfer })
```

```python sync
# note you can only create data_transfer in chromium and firefox
data_transfer = frame.evaluate_handle("new DataTransfer()")
frame.dispatch_event("#source", "dragstart", { "dataTransfer": data_transfer })
```


### param: Frame.dispatchEvent.selector = %%-input-selector-%%

### param: Frame.dispatchEvent.type
- `type` <[string]>

DOM event type: `"click"`, `"dragstart"`, etc.

### param: Frame.dispatchEvent.eventInit
- `eventInit` <[EvaluationArgument]>

Optional event-specific initialization properties.

### option: Frame.dispatchEvent.timeout = %%-input-timeout-%%

## async method: Frame.evaluate
- returns: <[Serializable]>

Returns the return value of [`param: pageFunction`]

If the function passed to the [`method: Frame.evaluate`] returns a [Promise], then [`method: Frame.evaluate`] would wait for the promise to
resolve and return its value.

If the function passed to the [`method: Frame.evaluate`] returns a non-[Serializable] value, then
[`method: Frame.evaluate`] returns `undefined`. DevTools Protocol also supports transferring some additional values that
are not serializable by `JSON`: `-0`, `NaN`, `Infinity`, `-Infinity`, and bigint literals.

```js
const result = await frame.evaluate(([x, y]) => {
  return Promise.resolve(x * y);
}, [7, 8]);
console.log(result); // prints "56"
```

```python async
result = await frame.evaluate("([x, y]) => Promise.resolve(x * y)", [7, 8])
print(result) # prints "56"
```

```python sync
result = frame.evaluate("([x, y]) => Promise.resolve(x * y)", [7, 8])
print(result) # prints "56"
```


A string can also be passed in instead of a function.

```js
console.log(await frame.evaluate('1 + 2')); // prints "3"
```

```python async
print(await frame.evaluate("1 + 2")) # prints "3"
x = 10
print(await frame.evaluate(f"1 + {x}")) # prints "11"
```

```python sync
print(frame.evaluate("1 + 2")) # prints "3"
x = 10
print(frame.evaluate(f"1 + {x}")) # prints "11"
```


[ElementHandle] instances can be passed as an argument to the [`method: Frame.evaluate`]:

```js
const bodyHandle = await frame.$('body');
const html = await frame.evaluate(([body, suffix]) => body.innerHTML + suffix, [bodyHandle, 'hello']);
await bodyHandle.dispose();
```

```python async
body_handle = await frame.query_selector("body")
html = await frame.evaluate("([body, suffix]) => body.innerHTML + suffix", [body_handle, "hello"])
await body_handle.dispose()
```

```python sync
body_handle = frame.query_selector("body")
html = frame.evaluate("([body, suffix]) => body.innerHTML + suffix", [body_handle, "hello"])
body_handle.dispose()
```

### param: Frame.evaluate.pageFunction
* langs: js
- `pageFunction` <[function]|[string]>

Function to be evaluated in browser context

### param: Frame.evaluate.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

## async method: Frame.evaluateHandle
- returns: <[JSHandle]>

Returns the return value of [`param: pageFunction`] as in-page object (JSHandle).

The only difference between [`method: Frame.evaluate`] and [`method: Frame.evaluateHandle`] is that
[method: Frame.evaluateHandle`] returns in-page object (JSHandle).

If the function, passed to the [`method: Frame.evaluateHandle`], returns a [Promise], then
[`method: Frame.evaluateHandle`] would wait for the promise to resolve and return its value.

```js
const aWindowHandle = await frame.evaluateHandle(() => Promise.resolve(window));
aWindowHandle; // Handle for the window object.
```

```python async
a_window_handle = await frame.evaluate_handle("Promise.resolve(window)")
a_window_handle # handle for the window object.
```

```python sync
a_window_handle = frame.evaluate_handle("Promise.resolve(window)")
a_window_handle # handle for the window object.
```

A string can also be passed in instead of a function.

```js
const aHandle = await frame.evaluateHandle('document'); // Handle for the 'document'.
```

```python async
a_handle = await page.evaluate_handle("document") # handle for the "document"
```

```python sync
a_handle = page.evaluate_handle("document") # handle for the "document"
```

[JSHandle] instances can be passed as an argument to the [`method: Frame.evaluateHandle`]:

```js
const aHandle = await frame.evaluateHandle(() => document.body);
const resultHandle = await frame.evaluateHandle(([body, suffix]) => body.innerHTML + suffix, [aHandle, 'hello']);
console.log(await resultHandle.jsonValue());
await resultHandle.dispose();
```

```python async
a_handle = await page.evaluate_handle("document.body")
result_handle = await page.evaluate_handle("body => body.innerHTML", a_handle)
print(await result_handle.json_value())
await result_handle.dispose()
```

```python sync
a_handle = page.evaluate_handle("document.body")
result_handle = page.evaluate_handle("body => body.innerHTML", a_handle)
print(result_handle.json_value())
result_handle.dispose()
```

### param: Frame.evaluateHandle.pageFunction
* langs: js
- `pageFunction` <[function]|[string]>

Function to be evaluated in the page context

### param: Frame.evaluateHandle.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

## async method: Frame.fill

This method waits for an element matching [`param: selector`], waits for [actionability](./actionability.md) checks,
focuses the element, fills it and triggers an `input` event after filling. If the element matching [`param: selector`]
is not an `<input>`, `<textarea>` or `[contenteditable]` element, this method throws an error. Note that you can pass an
empty string to clear the input field.

To send fine-grained keyboard events, use [`method: Frame.type`].

### param: Frame.fill.selector = %%-input-selector-%%

### param: Frame.fill.value
- `value` <[string]>

Value to fill for the `<input>`, `<textarea>` or `[contenteditable]` element.

### option: Frame.fill.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.fill.timeout = %%-input-timeout-%%

## async method: Frame.focus

This method fetches an element with [`param: selector`] and focuses it. If there's no element matching
[`param: selector`], the method waits until a matching element appears in the DOM.

### param: Frame.focus.selector = %%-input-selector-%%

### option: Frame.focus.timeout = %%-input-timeout-%%

## async method: Frame.frameElement
- returns: <[ElementHandle]>

Returns the `frame` or `iframe` element handle which corresponds to this frame.

This is an inverse of [`method: ElementHandle.contentFrame`]. Note that returned handle actually belongs to the parent
frame.

This method throws an error if the frame has been detached before `frameElement()` returns.

```js
const frameElement = await frame.frameElement();
const contentFrame = await frameElement.contentFrame();
console.log(frame === contentFrame);  // -> true
```

```python async
frame_element = await frame.frame_element()
content_frame = await frame_element.content_frame()
assert frame == content_frame
```

```python sync
frame_element = frame.frame_element()
content_frame = frame_element.content_frame()
assert frame == content_frame
```

## async method: Frame.getAttribute
- returns: <[null]|[string]>

Returns element attribute value.

### param: Frame.getAttribute.selector = %%-input-selector-%%

### param: Frame.getAttribute.name
- `name` <[string]>

Attribute name to get the value for.

### option: Frame.getAttribute.timeout = %%-input-timeout-%%

## async method: Frame.goto
- returns: <[null]|[Response]>

Returns the main resource response. In case of multiple redirects, the navigation will resolve with the response of the
last redirect.

`frame.goto` will throw an error if:
* there's an SSL error (e.g. in case of self-signed certificates).
* target URL is invalid.
* the [`option: timeout`] is exceeded during navigation.
* the remote server does not respond or is unreachable.
* the main resource failed to load.

`frame.goto` will not throw an error when any valid HTTP status code is returned by the remote server, including 404
"Not Found" and 500 "Internal Server Error".  The status code for such responses can be retrieved by calling
[`method: Response.status`].

:::note
`frame.goto` either throws an error or returns a main resource response. The only exceptions are navigation to
`about:blank` or navigation to the same URL with a different hash, which would succeed and return `null`.
:::

:::note
Headless mode doesn't support navigation to a PDF document. See the
[upstream issue](https://bugs.chromium.org/p/chromium/issues/detail?id=761295).
:::

### param: Frame.goto.url
- `url` <[string]>

URL to navigate frame to. The url should include scheme, e.g. `https://`.

### option: Frame.goto.timeout = %%-navigation-timeout-%%

### option: Frame.goto.waitUntil = %%-navigation-wait-until-%%

### option: Frame.goto.referer
- `referer` <[string]>

Referer header value. If provided it will take preference over the referer header value set by
[`method: Page.setExtraHTTPHeaders`].

## async method: Frame.hover

This method hovers over an element matching [`param: selector`] by performing the following steps:
1. Find an element match matching [`param: selector`]. If there is none, wait until a matching element is attached to
   the DOM.
1. Wait for [actionability](./actionability.md) checks on the matched element, unless [`option: force`] option is
   set. If the element is detached during the checks, the whole action is retried.
1. Scroll the element into view if needed.
1. Use [`property: Page.mouse`] to hover over the center of the element, or the specified [`option: position`].
1. Wait for initiated navigations to either succeed or fail, unless `noWaitAfter` option is set.

When all steps combined have not finished during the specified [`option: timeout`], this method rejects with a
[TimeoutError]. Passing zero timeout disables this.

### param: Frame.hover.selector = %%-input-selector-%%

### option: Frame.hover.position = %%-input-position-%%

### option: Frame.hover.modifiers = %%-input-modifiers-%%

### option: Frame.hover.force = %%-input-force-%%

### option: Frame.hover.timeout = %%-input-timeout-%%

## async method: Frame.innerHTML
- returns: <[string]>

Returns `element.innerHTML`.

### param: Frame.innerHTML.selector = %%-input-selector-%%

### option: Frame.innerHTML.timeout = %%-input-timeout-%%

## async method: Frame.innerText
- returns: <[string]>

Returns `element.innerText`.

### param: Frame.innerText.selector = %%-input-selector-%%

### option: Frame.innerText.timeout = %%-input-timeout-%%

## async method: Frame.isChecked
- returns: <[boolean]>

Returns whether the element is checked. Throws if the element is not a checkbox or radio input.

### param: Frame.isChecked.selector = %%-input-selector-%%

### option: Frame.isChecked.timeout = %%-input-timeout-%%

## method: Frame.isDetached
- returns: <[boolean]>

Returns `true` if the frame has been detached, or `false` otherwise.

## async method: Frame.isDisabled
- returns: <[boolean]>

Returns whether the element is disabled, the opposite of [enabled](./actionability.md#enabled).

### param: Frame.isDisabled.selector = %%-input-selector-%%

### option: Frame.isDisabled.timeout = %%-input-timeout-%%

## async method: Frame.isEditable
- returns: <[boolean]>

Returns whether the element is [editable](./actionability.md#editable).

### param: Frame.isEditable.selector = %%-input-selector-%%

### option: Frame.isEditable.timeout = %%-input-timeout-%%

## async method: Frame.isEnabled
- returns: <[boolean]>

Returns whether the element is [enabled](./actionability.md#enabled).

### param: Frame.isEnabled.selector = %%-input-selector-%%

### option: Frame.isEnabled.timeout = %%-input-timeout-%%

## async method: Frame.isHidden
- returns: <[boolean]>

Returns whether the element is hidden, the opposite of [visible](./actionability.md#visible).

### param: Frame.isHidden.selector = %%-input-selector-%%

### option: Frame.isHidden.timeout = %%-input-timeout-%%

## async method: Frame.isVisible
- returns: <[boolean]>

Returns whether the element is [visible](./actionability.md#visible).

### param: Frame.isVisible.selector = %%-input-selector-%%

### option: Frame.isVisible.timeout = %%-input-timeout-%%

## method: Frame.name
- returns: <[string]>

Returns frame's name attribute as specified in the tag.

If the name is empty, returns the id attribute instead.

:::note
This value is calculated once when the frame is created, and will not update if the attribute is changed later.
:::

## method: Frame.page
- returns: <[Page]>

Returns the page containing this frame.

## method: Frame.parentFrame
- returns: <[null]|[Frame]>

Parent frame, if any. Detached frames and main frames return `null`.

## async method: Frame.press

[`param: key`] can specify the intended
[keyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) value or a single character to
generate the text for. A superset of the [`param: key`] values can be found
[here](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values). Examples of the keys are:

`F1` - `F12`, `Digit0`- `Digit9`, `KeyA`- `KeyZ`, `Backquote`, `Minus`, `Equal`, `Backslash`, `Backspace`, `Tab`,
`Delete`, `Escape`, `ArrowDown`, `End`, `Enter`, `Home`, `Insert`, `PageDown`, `PageUp`, `ArrowRight`, `ArrowUp`, etc.

Following modification shortcuts are also supported: `Shift`, `Control`, `Alt`, `Meta`, `ShiftLeft`.

Holding down `Shift` will type the text that corresponds to the [`param: key`] in the upper case.

If [`param: key`] is a single character, it is case-sensitive, so the values `a` and `A` will generate different
respective texts.

Shortcuts such as `key: "Control+o"` or `key: "Control+Shift+T"` are supported as well. When speficied with the
modifier, modifier is pressed and being held while the subsequent key is being pressed.

### param: Frame.press.selector = %%-input-selector-%%

### param: Frame.press.key
- `key` <[string]>

Name of the key to press or a character to generate, such as `ArrowLeft` or `a`.

### option: Frame.press.delay
- `delay` <[float]>

Time to wait between `keydown` and `keyup` in milliseconds. Defaults to 0.

### option: Frame.press.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.press.timeout = %%-input-timeout-%%

## async method: Frame.selectOption
- returns: <[Array]<[string]>>

Returns the array of option values that have been successfully selected.

Triggers a `change` and `input` event once all the provided options have been selected. If there's no `<select>` element
matching [`param: selector`], the method throws an error.

Will wait until all specified options are present in the `<select>` element.

```js
// single selection matching the value
frame.selectOption('select#colors', 'blue');

// single selection matching both the value and the label
frame.selectOption('select#colors', { label: 'Blue' });

// multiple selection
frame.selectOption('select#colors', 'red', 'green', 'blue');
```

```python async
# single selection matching the value
await frame.select_option("select#colors", "blue")
# single selection matching the label
await frame.select_option("select#colors", label="blue")
# multiple selection
await frame.select_option("select#colors", value=["red", "green", "blue"])
```

```python sync
# single selection matching the value
frame.select_option("select#colors", "blue")
# single selection matching both the label
frame.select_option("select#colors", label="blue")
# multiple selection
frame.select_option("select#colors", value=["red", "green", "blue"])
```

### param: Frame.selectOption.selector = %%-query-selector-%%

### param: Frame.selectOption.values = %%-select-options-values-%%

### option: Frame.selectOption.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.selectOption.timeout = %%-input-timeout-%%

## async method: Frame.setContent

### param: Frame.setContent.html
- `html` <[string]>

HTML markup to assign to the page.

### option: Frame.setContent.timeout = %%-navigation-timeout-%%

### option: Frame.setContent.waitUntil = %%-navigation-wait-until-%%

## async method: Frame.setInputFiles

This method expects [`param: selector`] to point to an
[input element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input).

Sets the value of the file input to these file paths or files. If some of the `filePaths` are relative paths, then they
are resolved relative to the the current working directory. For empty array, clears the selected files.

### param: Frame.setInputFiles.selector = %%-input-selector-%%

### param: Frame.setInputFiles.files = %%-input-files-%%

### option: Frame.setInputFiles.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.setInputFiles.timeout = %%-input-timeout-%%

## async method: Frame.tap

This method taps an element matching [`param: selector`] by performing the following steps:
1. Find an element match matching [`param: selector`]. If there is none, wait until a matching element is attached to
   the DOM.
1. Wait for [actionability](./actionability.md) checks on the matched element, unless [`option: force`] option is
   set. If the element is detached during the checks, the whole action is retried.
1. Scroll the element into view if needed.
1. Use [`property: Page.touchscreen`] to tap the center of the element, or the specified [`option: position`].
1. Wait for initiated navigations to either succeed or fail, unless [`option: noWaitAfter`] option is set.

When all steps combined have not finished during the specified [`option: timeout`], this method rejects with a
[TimeoutError]. Passing zero timeout disables this.

:::note
`frame.tap()` requires that the `hasTouch` option of the browser context be set to true.
:::

### param: Frame.tap.selector = %%-input-selector-%%

### option: Frame.tap.position = %%-input-position-%%

### option: Frame.tap.modifiers = %%-input-modifiers-%%

### option: Frame.tap.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.tap.force = %%-input-force-%%

### option: Frame.tap.timeout = %%-input-timeout-%%

## async method: Frame.textContent
- returns: <[null]|[string]>

Returns `element.textContent`.

### param: Frame.textContent.selector = %%-input-selector-%%

### option: Frame.textContent.timeout = %%-input-timeout-%%

## async method: Frame.title
- returns: <[string]>

Returns the page title.

## async method: Frame.type

Sends a `keydown`, `keypress`/`input`, and `keyup` event for each character in the text. `frame.type` can be used to
send fine-grained keyboard events. To fill values in form fields, use [`method: Frame.fill`].

To press a special key, like `Control` or `ArrowDown`, use [`method: Keyboard.press`].

```js
await frame.type('#mytextarea', 'Hello'); // Types instantly
await frame.type('#mytextarea', 'World', {delay: 100}); // Types slower, like a user
```

```python async
await frame.type("#mytextarea", "hello") # types instantly
await frame.type("#mytextarea", "world", delay=100) # types slower, like a user
```

```python sync
frame.type("#mytextarea", "hello") # types instantly
frame.type("#mytextarea", "world", delay=100) # types slower, like a user
```

### param: Frame.type.selector = %%-input-selector-%%

### param: Frame.type.text
- `text` <[string]>

A text to type into a focused element.

### option: Frame.type.delay
- `delay` <[float]>

Time to wait between key presses in milliseconds. Defaults to 0.

### option: Frame.type.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.type.timeout = %%-input-timeout-%%

## async method: Frame.uncheck

This method checks an element matching [`param: selector`] by performing the following steps:
1. Find an element match matching [`param: selector`]. If there is none, wait until a matching element is attached to
   the DOM.
1. Ensure that matched element is a checkbox or a radio input. If not, this method rejects. If the element is already
   unchecked, this method returns immediately.
1. Wait for [actionability](./actionability.md) checks on the matched element, unless [`option: force`] option is
   set. If the element is detached during the checks, the whole action is retried.
1. Scroll the element into view if needed.
1. Use [`property: Page.mouse`] to click in the center of the element.
1. Wait for initiated navigations to either succeed or fail, unless [`option: noWaitAfter`] option is set.
1. Ensure that the element is now unchecked. If not, this method rejects.

When all steps combined have not finished during the specified [`option: timeout`], this method rejects with a
[TimeoutError]. Passing zero timeout disables this.

### param: Frame.uncheck.selector = %%-input-selector-%%

### option: Frame.uncheck.force = %%-input-force-%%

### option: Frame.uncheck.noWaitAfter = %%-input-no-wait-after-%%

### option: Frame.uncheck.timeout = %%-input-timeout-%%

## method: Frame.url
- returns: <[string]>

Returns frame's url.

## async method: Frame.waitForFunction
- returns: <[JSHandle]>

Returns when the [`param: pageFunction`] returns a truthy value, returns that value.

The [`method: Frame.waitForFunction`] can be used to observe viewport size change:

```js
const { firefox } = require('playwright');  // Or 'chromium' or 'webkit'.

(async () => {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  const watchDog = page.mainFrame().waitForFunction('window.innerWidth < 100');
  page.setViewportSize({width: 50, height: 50});
  await watchDog;
  await browser.close();
})();
```

```python async
import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    webkit = playwright.webkit
    browser = await webkit.launch()
    page = await browser.new_page()
    await page.evaluate("window.x = 0; setTimeout(() => { window.x = 100 }, 1000);", force_expr=True)
    await page.main_frame.wait_for_function("() => window.x > 0")
    await browser.close()

async def main():
    async with async_playwright() as playwright:
        await run(playwright)
asyncio.run(main())
```

```python sync
from playwright.sync_api import sync_playwright

def run(playwright):
    webkit = playwright.webkit
    browser = webkit.launch()
    page = browser.new_page()
    page.evaluate("window.x = 0; setTimeout(() => { window.x = 100 }, 1000);", force_expr=True)
    page.main_frame.wait_for_function("() => window.x > 0")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
```

To pass an argument to the predicate of `frame.waitForFunction` function:

```js
const selector = '.foo';
await frame.waitForFunction(selector => !!document.querySelector(selector), selector);
```

```python async
selector = ".foo"
await frame.wait_for_function("selector => !!document.querySelector(selector)", selector)
```

```python sync
selector = ".foo"
frame.wait_for_function("selector => !!document.querySelector(selector)", selector)
```

### param: Frame.waitForFunction.pageFunction
* langs: js
- `pageFunction` <[function]|[string]>

Function to be evaluated in browser context

### param: Frame.waitForFunction.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

### option: Frame.waitForFunction.polling
- `polling` <[float]|"raf">

If [`option: polling`] is `'raf'`, then [`param: pageFunction`] is constantly executed in `requestAnimationFrame`
callback. If [`option: polling`] is a number, then it is treated as an interval in milliseconds at which the function
would be executed. Defaults to `raf`.

### option: Frame.waitForFunction.timeout = %%-wait-for-timeout-%%

## async method: Frame.waitForLoadState

Waits for the required load state to be reached.

This returns when the frame reaches a required load state, `load` by default. The navigation must have been committed
when this method is called. If current document has already reached the required state, resolves immediately.

```js
await frame.click('button'); // Click triggers navigation.
await frame.waitForLoadState(); // Waits for 'load' state by default.
```

```python async
await frame.click("button") # click triggers navigation.
await frame.wait_for_load_state() # the promise resolves after "load" event.
```

```python sync
frame.click("button") # click triggers navigation.
frame.wait_for_load_state() # the promise resolves after "load" event.
```

### param: Frame.waitForLoadState.state = %%-wait-for-load-state-state-%%

### option: Frame.waitForLoadState.timeout = %%-navigation-timeout-%%

## async method: Frame.waitForNavigation
* langs:
  * alias-python: expect_navigation
- returns: <[null]|[Response]>

Waits for the frame navigation and returns the main resource response. In case of multiple redirects, the navigation
will resolve with the response of the last redirect. In case of navigation to a different anchor or navigation due to
History API usage, the navigation will resolve with `null`.

This method waits for the frame to navigate to a new URL. It is useful for when you run code which will indirectly cause
the frame to navigate. Consider this example:

```js
const [response] = await Promise.all([
  frame.waitForNavigation(), // The promise resolves after navigation has finished
  frame.click('a.delayed-navigation'), // Clicking the link will indirectly cause a navigation
]);
```

```python async
async with frame.expect_navigation():
    await frame.click("a.delayed-navigation") # clicking the link will indirectly cause a navigation
# Resolves after navigation has finished
```

```python sync
with frame.expect_navigation():
    frame.click("a.delayed-navigation") # clicking the link will indirectly cause a navigation
# Resolves after navigation has finished
```

:::note
Usage of the [History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API) to change the URL is considered
a navigation.
:::

### option: Frame.waitForNavigation.timeout = %%-navigation-timeout-%%

### option: Frame.waitForNavigation.url
- `url` <[string]|[RegExp]|[function]\([URL]\):[boolean]>

URL string, URL regex pattern or predicate receiving [URL] to match while waiting for the navigation.

### option: Frame.waitForNavigation.waitUntil = %%-navigation-wait-until-%%

## async method: Frame.waitForSelector
- returns: <[null]|[ElementHandle]>

Returns when element specified by selector satisfies [`option: state`] option. Returns `null` if waiting for `hidden` or
`detached`.

Wait for the [`param: selector`] to satisfy [`option: state`] option (either appear/disappear from dom, or become
visible/hidden). If at the moment of calling the method [`param: selector`] already satisfies the condition, the method
will return immediately. If the selector doesn't satisfy the condition for the [`option: timeout`] milliseconds, the
function will throw.

This method works across navigations:

```js
const { chromium } = require('playwright');  // Or 'firefox' or 'webkit'.

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (let currentURL of ['https://google.com', 'https://bbc.com']) {
    await page.goto(currentURL);
    const element = await page.mainFrame().waitForSelector('img');
    console.log('Loaded image: ' + await element.getAttribute('src'));
  }
  await browser.close();
})();
```

```python async
import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    chromium = playwright.chromium
    browser = await chromium.launch()
    page = await browser.new_page()
    for current_url in ["https://google.com", "https://bbc.com"]:
        await page.goto(current_url, wait_until="domcontentloaded")
        element = await page.main_frame.wait_for_selector("img")
        print("Loaded image: " + str(await element.get_attribute("src")))
    await browser.close()

async def main():
    async with async_playwright() as playwright:
        await run(playwright)
asyncio.run(main())
```

```python sync
from playwright.sync_api import sync_playwright

def run(playwright):
    chromium = playwright.chromium
    browser = chromium.launch()
    page = browser.new_page()
    for current_url in ["https://google.com", "https://bbc.com"]:
        page.goto(current_url, wait_until="domcontentloaded")
        element = page.main_frame.wait_for_selector("img")
        print("Loaded image: " + str(element.get_attribute("src")))
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
```

### param: Frame.waitForSelector.selector = %%-query-selector-%%

### option: Frame.waitForSelector.state = %%-wait-for-selector-state-%%

### option: Frame.waitForSelector.timeout = %%-input-timeout-%%

## async method: Frame.waitForTimeout

Waits for the given [`param: timeout`] in milliseconds.

Note that `frame.waitForTimeout()` should only be used for debugging. Tests using the timer in production are going to
be flaky. Use signals such as network events, selectors becoming visible and others instead.

### param: Frame.waitForTimeout.timeout
- `timeout` <[float]>

A timeout to wait for

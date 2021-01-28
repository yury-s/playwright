---
id: handles
title: "Handles"
---

Playwright can create handles to the page DOM elements or any other objects inside the
page. These handles live in the Playwright process, whereas the actual objects live
in the browser. There are two types of handles:
- [JSHandle] to reference any JavaScript objects in the page
- [ElementHandle] to reference DOM elements in the page, it has extra methods that allow
performing actions on the elements and asserting their properties.

Since any DOM element in the page is also a JavaScript object, any [ElementHandle] is
a [JSHandle] as well.

Handles are used to perform operations on those actual objects in the page. You can evaluate
on a handle, get handle properties, pass handle as an evaluation parameter, serialize page
object into JSON etc. See the [JSHandle] class API for these and methods.

### API reference
- [JSHandle]
- [ElementHandle]

Here is the easiest way to obtain a [JSHandle].

```js
const jsHandle = await page.evaluateHandle('window');
//  Use jsHandle for evaluations.
```

```python async
js_handle = await page.evaluate_handle('window')
#  Use jsHandle for evaluations.
```

```python sync
js_handle = page.evaluate_handle('window')
#  Use jsHandle for evaluations.
```

```js
const ulElementHandle = await page.waitForSelector('ul');
//  Use ulElementHandle for actions and evaluation.
```

```python async
ul_element_handle = await page.wait_for_selector('ul')
#  Use ul_element_handle for actions and evaluation.
```

```python sync
ul_element_handle = page.wait_for_selector('ul')
#  Use ul_element_handle for actions and evaluation.
```

## Element Handles

:::note
It is recommended to use selector-based actions like [`method: Page.click`] rather than using the [ElementHandle] for input actions, unless your use case specifically requires the use of handles.
:::

When [ElementHandle] is required, it is recommended to fetch it with the
[`method: Page.waitForSelector`] or [`method: Frame.waitForSelector`] methods. These
APIs wait for the element to be attached and visible.

```js
// Get the element handle
const elementHandle = page.waitForSelector('#box');

// Assert bounding box for the element
const boundingBox = await elementHandle.boundingBox();
expect(boundingBox.width).toBe(100);

// Assert attribute for the element
const classNames = await elementHandle.getAttribute('class');
expect(classNames.includes('highlighted')).toBeTruthy();
```

```python async
# Get the element handle
element_handle = page.wait_for_selector('#box')

# Assert bounding box for the element
bounding_box = await element_handle.bounding_box()
assert bounding_box.width == 100

# Assert attribute for the element
class_names = await element_handle.get_attribute('class')
assert 'highlighted' in class_names
```

```python sync
# Get the element handle
element_handle = page.wait_for_selector('#box')

# Assert bounding box for the element
bounding_box = element_handle.bounding_box()
assert bounding_box.width == 100

# Assert attribute for the element
class_names = element_handle.get_attribute('class')
assert 'highlighted' in class_names
```

## Handles as parameters

Handles can be passed into the [`method: Page.evaluate`] and similar methods.
The following snippet creates a new array in the page, initializes it with data
and returns a handle to this array into Playwright. It then uses the handle
in subsequent evaluations:

```js
// Create new array in page.
const myArrayHandle = await page.evaluateHandle(() => {
  window.myArray = [1];
  return myArray;
});

// Get the length of the array.
const length = await page.evaluate(a => a.length, myArrayHandle);

// Add one more element to the array using the handle
await page.evaluate(arg => arg.myArray.push(arg.newElement), {
  myArray: myArrayHandle,
  newElement: 2
});

// Release the object when it's no longer needed.
await myArrayHandle.dispose();
```

```python async
# Create new array in page.
my_array_handle = await page.evaluate_handle("""() => {
  window.myArray = [1];
  return myArray;
}""")

# Get current length of the array.
length = await page.evaluate("a => a.length", my_array_handle)

# Add one more element to the array using the handle
await page.evaluate("(arg) => arg.myArray.push(arg.newElement)", {
  'myArray': my_array_handle,
  'newElement': 2
})

# Release the object when it's no longer needed.
await my_array_handle.dispose()
```

```python sync
# Create new array in page.
my_array_handle = page.evaluate_handle("""() => {
  window.myArray = [1];
  return myArray;
}""")

# Get current length of the array.
length = page.evaluate("a => a.length", my_array_handle)

# Add one more element to the array using the handle
page.evaluate("(arg) => arg.myArray.push(arg.newElement)", {
  'myArray': my_array_handle,
  'newElement': 2
})

# Release the object when it's no longer needed.
my_array_handle.dispose()
```

## Handle Lifecycle

Handles can be acquired using the page methods such as [`method: Page.evaluateHandle`],
[`method: Page.querySelector`] or [`method: Page.querySelectorAll`] or their frame counterparts
[`method: Frame.evaluateHandle`], [`method: Frame.querySelector`] or [`method: Frame.querySelectorAll`]. Once
created, handles will retain object from
[garbage collection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
unless page navigates or the handle is manually disposed via the [`method: JSHandle.dispose`] method.


### API reference
- [JSHandle]
- [ElementHandle]
- [`method: ElementHandle.boundingBox`]
- [`method: ElementHandle.getAttribute`]
- [`method: ElementHandle.innerText`]
- [`method: ElementHandle.innerHTML`]
- [`method: ElementHandle.textContent`]
- [`method: JSHandle.evaluate`]
- [`method: Page.evaluateHandle`]
- [`method: Page.querySelector`]
- [`method: Page.querySelectorAll`]

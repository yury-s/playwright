# class: JSHandle

JSHandle represents an in-page JavaScript object. JSHandles can be created with the [`method: Page.evaluateHandle`]
method.

```js
const windowHandle = await page.evaluateHandle(() => window);
// ...
```

```python async
window_handle = await page.evaluate_handle("window")
# ...
```

```python sync
window_handle = page.evaluate_handle("window")
# ...
```

JSHandle prevents the referenced JavaScript object being garbage collected unless the handle is exposed with
[`method: JSHandle.dispose`]. JSHandles are auto-disposed when their origin frame gets navigated or the parent context
gets destroyed.

JSHandle instances can be used as an argument in [`method: Page.evalOnSelector`], [`method: Page.evaluate`] and
[`method: Page.evaluateHandle`] methods.

## method: JSHandle.asElement
- returns: <[null]|[ElementHandle]>

Returns either `null` or the object handle itself, if the object handle is an instance of [ElementHandle].

## async method: JSHandle.dispose

The `jsHandle.dispose` method stops referencing the element handle.

## async method: JSHandle.evaluate
- returns: <[Serializable]>

Returns the return value of [`param: pageFunction`]

This method passes this handle as the first argument to [`param: pageFunction`].

If [`param: pageFunction`] returns a [Promise], then `handle.evaluate` would wait for the promise to resolve and return
its value.

Examples:

```js
const tweetHandle = await page.$('.tweet .retweets');
expect(await tweetHandle.evaluate(node => node.innerText)).toBe('10 retweets');
```

```python async
tweet_handle = await page.query_selector(".tweet .retweets")
assert await tweet_handle.evaluate("node => node.innerText") == "10 retweets"
```

```python sync
tweet_handle = page.query_selector(".tweet .retweets")
assert tweet_handle.evaluate("node => node.innerText") == "10 retweets"
```

### param: JSHandle.evaluate.pageFunction
* langs: js
- `pageFunction` <[function]>

Function to be evaluated in browser context

### param: JSHandle.evaluate.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

## async method: JSHandle.evaluateHandle
- returns: <[JSHandle]>

Returns the return value of [`param: pageFunction`] as in-page object (JSHandle).

This method passes this handle as the first argument to [`param: pageFunction`].

The only difference between `jsHandle.evaluate` and `jsHandle.evaluateHandle` is that `jsHandle.evaluateHandle` returns
in-page object (JSHandle).

If the function passed to the `jsHandle.evaluateHandle` returns a [Promise], then `jsHandle.evaluateHandle` would wait
for the promise to resolve and return its value.

See [`method: Page.evaluateHandle`] for more details.

### param: JSHandle.evaluateHandle.pageFunction
* langs: js
- `pageFunction` <[function]|[string]>

Function to be evaluated

### param: JSHandle.evaluateHandle.arg
- `arg` <[EvaluationArgument]>

Optional argument to pass to [`param: pageFunction`]

## async method: JSHandle.getProperties
- returns: <[Map]<[string], [JSHandle]>>

The method returns a map with **own property names** as keys and JSHandle instances for the property values.

```js
const handle = await page.evaluateHandle(() => ({window, document}));
const properties = await handle.getProperties();
const windowHandle = properties.get('window');
const documentHandle = properties.get('document');
await handle.dispose();
```

```python async
handle = await page.evaluate_handle("{window, document}")
properties = await handle.get_properties()
window_handle = properties.get("window")
document_handle = properties.get("document")
await handle.dispose()
```

```python sync
handle = page.evaluate_handle("{window, document}")
properties = handle.get_properties()
window_handle = properties.get("window")
document_handle = properties.get("document")
handle.dispose()
```

## async method: JSHandle.getProperty
- returns: <[JSHandle]>

Fetches a single property from the referenced object.

### param: JSHandle.getProperty.propertyName
- `propertyName` <[string]>

property to get

## async method: JSHandle.jsonValue
- returns: <[Serializable]>

Returns a JSON representation of the object. If the object has a `toJSON` function, it **will not be called**.

:::note
The method will return an empty JSON object if the referenced object is not stringifiable. It will throw an error if the
object has circular references.
:::


## Generate protocol.d.ts
spec -> cddl -> json (via cddlconv) -> javascript

reuse core/bidi from pptr?


## Spec questions
- browsingContext.CreateType = "tab" / "window"
  why is it important at all?
- referenceContext?: BrowsingContext.BrowsingContext; passed when creating a new page, is it like a popup opener?
- command responses are not attributed to sessions, contain only command id

- wait: browsingContext.ReadinessState in browsingContext.navigate

- browsingContext.navigationFailed/Aborted - no reason

- script.Target vs. script.realm - for window contexts realm doesn't work, only {context, sandbox}

- script.RemoteValue and return handle
-- what's Script.InternalId?

- Any notes on the semantics of things like Script.ResultOwnership? - currently only works if passed 'root'

- How to create a 'sandbox' aka isolated world? - created automatically it seems
- no way to pass overridden 'referrer' in goto()  - use interception?
- no fromServiceWorker bit

- no way to specify screen different from viewport
- no support for isMobile
- no support for landscape
- no request body (https://github.com/w3c/webdriver-bidi/issues/748)
- no response body (https://github.com/w3c/webdriver-bidi/issues/747)

- network.failRequest doesn't accept error code

- user agent emulation is client side: https://github.com/w3c/webdriver-bidi/issues/448#issuecomment-1944294296

## Problems
- about:blank page is required for firefox to not close even in headless! (use --silent?)

- always launches with persistent context?

- "browsingContext.create","params":{"type":"tab", does not return (only type: window works)

- no signal that main frame is ready, only execution context created, navigation started to about:blank etc

-- prepend session id to command id?

- script.realmDestroyed comes after browsingContext.contextDestroyed

- browsingContext.navigationStarted is it navigation requested or committed? There is no navigation committed event. file:// url navigation is a problem.

- ff: script.evaluate exception have no details/message

- ff: script.callFunction does NOT work with playwright build of FF, throws 'Not allowed to define cross-origin object as property on [Object] or [Array] XrayWrapper'

- getContentQuads is missing, which prevents us from clicking in transformed frames
  use DOMMatrixReadOnly?!

- Expected "x" to be an integer, got [object Number] 49.48 in pointerDown
- performActions need to contain down/up in one command to generate doubleclick

- element.contentWindow will not work for cross-origin iframes?

- FF impl bug: 'ensure events are dispatched in the individual tasks'

- browsingContext.contextDestroyed comes before input.performActions response, see 'should not throw UnhandledPromiseRejection when page closes'. I.e. some events can come after browsingContext was destroyed.

- browsingContext.contextCreated comes with no `originalOpener` for popups, see 'should issue clicks in parallel in page and popup' ==> fixed in 129!

- network request resourceType is missing?
- network request events do not provide postData
- no security details on response
- no timing details on response

- navigation id stays the same for different navigations, see 'should return from goto if new navigation is started'

- Intermittent Error: Protocol error (script.evaluate): unknown error
  Message: AbortError: Actor 'MessageHandlerFrame' destroyed before query 'MessageHandlerFrameParent:sendCommand' was resolved - apparently fails if a command is sent before about:blank navigation finishes.

-  lazy loading iframes are not reported (can be disabled in settings I think)

- setViewport does not affect window.screen.width/height, matchMedia (pptr with cdp is same), see 'should emulate device width'

- CSP tests are failing

- \"url\" not supported yet in network.continueRequest

- FF: 'should not throw if request was cancelled by the page' - no requestfailed event when it's cancelled by the page

- FF: 'should amend utf8 post data' - doesn't work with non-latin post data
- FF: 'redirected requests should report overridden headers' - does not allow to override headers on redirects

- FF: browsingContext.create sometimes hangs in parallel tests


TODO:
- emulation
- network interception
- cookies
- downloads
- proxy
- expose bindings
- addInitScript
- browsercontext-*

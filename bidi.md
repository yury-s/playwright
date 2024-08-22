
## Generate protocol.d.ts
spec -> cddl -> json (via cddlconv) -> javascript

reuse core/bidi from pptr?


## Spec questions
- browsingContext.CreateType = "tab" / "window"
  why is it important at all?
- referenceContext?: BrowsingContext.BrowsingContext; passed when creating a new page, is it like a popup opener?

- wait: browsingContext.ReadinessState in browsingContext.navigate

- command responses are not attributed to sessions, contain only commend id

- log.entryAdded contains only reference to script.Realm (no browsing context)

- browsingContext.navigationFailed/Aborted - no reason

- script.Target vs. script.realm - for window contexts realm doesn't work, only {context, sandbox}

- script.RemoteValue and return handle
-- Script.InternalId?

- Any notes on the semantics of things like Script.ResultOwnership?

- How to create a 'sandbox' aka isolated world?

- no way to pass overridden 'referrer' in goto()

- no fromServiceWorker bit

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
  Message: AbortError: Actor 'MessageHandlerFrame' destroyed before query 'MessageHandlerFrameParent:sendCommand' was resolved

-  lazy loading iframes are not reported (can be disabled in settings I think)


TODO:
- emulation
- network interception
- expose bindings
- addInitScript
- browsercontext-*

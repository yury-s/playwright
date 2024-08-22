
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

## Problems
- about:blank page is required for firefox to not close even in headless! (use --silent?)

- always launches with persistent context?

- "browsingContext.create","params":{"type":"tab", does not return (only type: window works)

- no signal that main frame is ready, only execution context created, navigation started to about:blank etc

-- prepend session id to command id?

- script.realmDestroyed comes after browsingContext.contextDestroyed

- browsingContext.navigationStarted is it navigation requested or committed?

- ff: script.evaluate exception have no details/message

- ff: script.callFunction does NOT work with playwright build of FF, throws 'Not allowed to define cross-origin object as property on [Object] or [Array] XrayWrapper'

- getContentQuads is missing, which prevents us from clicking in transformed frames
  use DOMMatrixReadOnly?!

- Expected "x" to be an integer, got [object Number] 49.48 in pointerDown
- performActions need to contain down/up in one command to generate doubleclick

- element.contentWindow will not work for cross-origin iframes?

- FF impl bug: 'ensure events are dispatched in the individual tasks'


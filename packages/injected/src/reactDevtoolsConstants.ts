/**
 * Tree- and Suspense-operation codes used by the React DevTools backend
 * when emitting the `operations` payload over the hook.
 *
 * Vendored verbatim from facebook/react. When React adds, removes, or
 * reorders an operation code, sync this file with upstream.
 *
 * Source:  https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/constants.js
 * License: MIT (Copyright (c) Meta Platforms, Inc. and affiliates)
 */

export const TREE_OPERATION_ADD = 1;
export const TREE_OPERATION_REMOVE = 2;
export const TREE_OPERATION_REORDER_CHILDREN = 3;
export const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;
export const TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS = 5;
// 6 is the removed `TREE_OPERATION_REMOVE_ROOT`. Older React versions may still
// emit it, so the decoder must accept it as a no-op.
export const TREE_OPERATION_REMOVE_ROOT_LEGACY = 6;
export const TREE_OPERATION_SET_SUBTREE_MODE = 7;
export const SUSPENSE_TREE_OPERATION_ADD = 8;
export const SUSPENSE_TREE_OPERATION_REMOVE = 9;
export const SUSPENSE_TREE_OPERATION_REORDER_CHILDREN = 10;
export const SUSPENSE_TREE_OPERATION_RESIZE = 11;
export const SUSPENSE_TREE_OPERATION_SUSPENDERS = 12;
export const TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE = 13;

// `unknownSuspenders` reason codes returned by `inspectElement`.
// Source: same constants.js file as above.
export const UNKNOWN_SUSPENDERS_REASON_PRODUCTION = 1;
export const UNKNOWN_SUSPENDERS_REASON_OLD_VERSION = 2;
export const UNKNOWN_SUSPENDERS_REASON_THROWN_PROMISE = 3;

// `ElementType` codes returned in the second slot of TREE_OPERATION_ADD.
// Source: https://github.com/facebook/react/blob/main/packages/react-devtools-shared/src/frontend/types.js
export const ElementTypeClass = 1;
export const ElementTypeContext = 2;
export const ElementTypeFunction = 5;
export const ElementTypeForwardRef = 6;
export const ElementTypeHostComponent = 7;
export const ElementTypeMemo = 8;
export const ElementTypeOtherOrUnknown = 9;
export const ElementTypeProfiler = 10;
export const ElementTypeRoot = 11;
export const ElementTypeSuspense = 12;
export const ElementTypeSuspenseList = 13;
export const ElementTypeTracingMarker = 14;
export const ElementTypeVirtual = 15;
export const ElementTypeViewTransition = 16;
export const ElementTypeActivity = 17;

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { RegisteredListener } from '../../utils/eventsHelper';
import { eventsHelper } from '../../utils/eventsHelper';
import type { Page } from '../page';
import * as network from '../network';
import type * as frames from '../frames';
import type * as types from '../types';
import * as bidiTypes from './bidi-types';
import { BidiSession } from './bidiConnection';


export class BidiNetworkManager {
  private readonly _session: BidiSession;
  private readonly _requests: Map<string, BidiRequest>;
  private readonly _page: Page;
  private readonly _eventListeners: RegisteredListener[];
  private readonly _onNavigationResponseStarted: (params: bidiTypes.Network.ResponseStartedParameters) => void;

  constructor(bidiSession: BidiSession, page: Page, onNavigationResponseStarted: (params: bidiTypes.Network.ResponseStartedParameters) => void) {
    this._session = bidiSession;
    this._requests = new Map();
    this._page = page;
    this._onNavigationResponseStarted = onNavigationResponseStarted;
    this._eventListeners = [
      eventsHelper.addEventListener(bidiSession, 'network.beforeRequestSent', this._onBeforeRequestSent.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'network.responseStarted', this._onResponseStarted.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'network.responseCompleted', this._onResponseCompleted.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'network.fetchError', this._onFetchError.bind(this)),
      eventsHelper.addEventListener(bidiSession, 'network.authRequired', this._onAuthRequired.bind(this)),
    ];
  }

  dispose() {
    eventsHelper.removeEventListeners(this._eventListeners);
  }

  private _onBeforeRequestSent(param: bidiTypes.Network.BeforeRequestSentParameters) {
    if (param.request.url.startsWith('data:'))
      return;
    const redirectedFrom = param.redirectCount ? (this._requests.get(param.request.request) || null) : null;
    const frame = redirectedFrom ? redirectedFrom.request.frame() : (param.context ? this._page._frameManager.frame(param.context) : null);
    if (!frame)
      return;
    if (redirectedFrom)
      this._requests.delete(redirectedFrom._id);
    const request = new BidiRequest(frame, redirectedFrom, param);
    let route;
    // if (param.intercepts)
    //   route = new FFRouteImpl(this._session, request);
    this._requests.set(request._id, request);
    this._page._frameManager.requestStarted(request.request, route);
  }

  private _onResponseStarted(params: bidiTypes.Network.ResponseStartedParameters) {
    const request = this._requests.get(params.request.request);
    if (!request)
      return;
    const getResponseBody = async () => {
      throw new Error(`Response body is not available for requests in Bidi`);
    };
    const timings = params.request.timings;
    const startTime = timings.requestTime;
    function relativeToStart(time: number): number {
      if (!time)
        return -1;
      return (time - startTime) / 1000;
    }
    const timing: network.ResourceTiming = {
      startTime: startTime / 1000,
      requestStart: relativeToStart(timings.requestStart),
      responseStart: relativeToStart(timings.responseStart),
      domainLookupStart: relativeToStart(timings.dnsStart),
      domainLookupEnd: relativeToStart(timings.dnsEnd),
      connectStart: relativeToStart(timings.connectStart),
      secureConnectionStart: relativeToStart(timings.tlsStart),
      connectEnd: relativeToStart(timings.connectEnd),
    };
    const response = new network.Response(request.request, params.response.status, params.response.statusText, bidiToHeadersArray(params.response.headers), timing, getResponseBody, false);
    response._serverAddrFinished();
    response._securityDetailsFinished();
    // "raw" headers are the same as "provisional" headers in Bidi.
    response.setRawResponseHeaders(null);
    response.setResponseHeadersSize(params.response.headersSize);
    this._page._frameManager.requestReceivedResponse(response);
    if (params.navigation)
      this._onNavigationResponseStarted(params);
  }

  private _onResponseCompleted(params: bidiTypes.Network.ResponseCompletedParameters) {
    const request = this._requests.get(params.request.request);
    if (!request)
      return;
    const response = request.request._existingResponse()!;
    // TODO: body size is the encoded size
    response.setTransferSize(params.response.bodySize);
    response.setEncodedBodySize(params.response.bodySize);

    // Keep redirected requests in the map for future reference as redirectedFrom.
    const isRedirected = response.status() >= 300 && response.status() <= 399;
    const responseEndTime = params.request.timings.responseEnd / 1000 - response.timing().startTime;
    if (isRedirected) {
      response._requestFinished(responseEndTime);
    } else {
      this._requests.delete(request._id);
      response._requestFinished(responseEndTime);
    }
    response._setHttpVersion(params.response.protocol);
    this._page._frameManager.reportRequestFinished(request.request, response);

  }

  private _onFetchError(params: bidiTypes.Network.FetchErrorParameters) {
    const request = this._requests.get(params.request.request);
    if (!request)
      return;
    this._requests.delete(request._id);
    const response = request.request._existingResponse();
    if (response) {
      response.setTransferSize(null);
      response.setEncodedBodySize(null);
      response._requestFinished(-1);
    }
    request.request._setFailureText(params.errorText);
    // TODO: support canceled flag
    this._page._frameManager.requestFailed(request.request, params.errorText === 'NS_BINDING_ABORTED');
  }

  private _onAuthRequired(params: bidiTypes.Network.AuthRequiredParameters) {
    console.log('onAuthRequired:', params);
  }

}


class BidiRequest {
  readonly request: network.Request;
  readonly _id: string;
  private _redirectedTo: BidiRequest | undefined;
  startTime: number;

  constructor(frame: frames.Frame, redirectedFrom: BidiRequest | null, payload: bidiTypes.Network.BeforeRequestSentParameters) {
    this._id = payload.request.request;
    if (redirectedFrom)
      redirectedFrom._redirectedTo = this;
    // TODO: missing in the spec?
    let postDataBuffer = null;
    this.request = new network.Request(frame._page._browserContext, frame, null, redirectedFrom ? redirectedFrom.request : null, payload.navigation ?? undefined,
        payload.request.url, 'other', payload.request.method, postDataBuffer, bidiToHeadersArray(payload.request.headers));
    // "raw" headers are the same as "provisional" headers in Bidi.
    this.request.setRawRequestHeaders(null);
    this.startTime = payload.timestamp;
  }

  _finalRequest(): BidiRequest {
    let request: BidiRequest = this;
    while (request._redirectedTo)
      request = request._redirectedTo;
    return request;
  }
}

function bidiToHeadersArray(bidiHeaders: bidiTypes.Network.Header[]): types.HeadersArray {
  const result: types.HeadersArray = [];
  for (const {name, value} of bidiHeaders) {
    let valueString = 'unsupported header value type';
    if (value.type === 'string')
      valueString = value.value;
    else if (value.type === 'base64')
      Buffer.from(value.type, 'base64').toString('binary');
    result.push({ name, value: valueString });
  }
  return result;
}

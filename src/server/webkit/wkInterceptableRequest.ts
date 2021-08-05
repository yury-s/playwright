/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as frames from '../frames';
import * as network from '../network';
import * as types from '../types';
import { Protocol } from './protocol';
import { WKSession } from './wkConnection';
import { assert, headersObjectToArray, headersArrayToObject } from '../../utils/utils';
import { InterceptedResponse } from '../network';
import { WKPage } from './wkPage';

const errorReasons: { [reason: string]: Protocol.Network.ResourceErrorType } = {
  'aborted': 'Cancellation',
  'accessdenied': 'AccessControl',
  'addressunreachable': 'General',
  'blockedbyclient': 'Cancellation',
  'blockedbyresponse': 'General',
  'connectionaborted': 'General',
  'connectionclosed': 'General',
  'connectionfailed': 'General',
  'connectionrefused': 'General',
  'connectionreset': 'General',
  'internetdisconnected': 'General',
  'namenotresolved': 'General',
  'timedout': 'Timeout',
  'failed': 'General',
};

export class WKInterceptableRequest {
  private readonly _session: WKSession;
  readonly request: network.Request;
  readonly _requestId: string;
  _timestamp: number;
  _wallTime: number;
  readonly _route: WKRouteImpl | null;
  private _redirectedFrom: WKInterceptableRequest | null;

  constructor(session: WKSession, route: WKRouteImpl | null, frame: frames.Frame, event: Protocol.Network.requestWillBeSentPayload, redirectedFrom: WKInterceptableRequest | null, documentId: string | undefined) {
    this._session = session;
    this._requestId = event.requestId;
    this._route = route;
    this._redirectedFrom = redirectedFrom;
    const resourceType = event.type ? event.type.toLowerCase() : (redirectedFrom ? redirectedFrom.request.resourceType() : 'other');
    let postDataBuffer = null;
    this._timestamp = event.timestamp;
    this._wallTime = event.walltime * 1000;
    if (event.request.postData)
      postDataBuffer = Buffer.from(event.request.postData, 'base64');
    this.request = new network.Request(frame, redirectedFrom?.request || null, documentId, event.request.url,
        resourceType, event.request.method, postDataBuffer, headersObjectToArray(event.request.headers));
  }

  _routeForRedirectChain(): WKRouteImpl | null {
    let request: WKInterceptableRequest = this;
    while (request._redirectedFrom)
      request = request._redirectedFrom;
    return request._route;
  }

  createResponse(responsePayload: Protocol.Network.Response): network.Response {
    const getResponseBody = async () => {
      const response = await this._session.send('Network.getResponseBody', { requestId: this._requestId });
      return Buffer.from(response.body, response.base64Encoded ? 'base64' : 'utf8');
    };
    const timingPayload = responsePayload.timing;
    const timing: network.ResourceTiming = {
      startTime: this._wallTime,
      domainLookupStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.domainLookupStart) : -1,
      domainLookupEnd: timingPayload ? wkMillisToRoundishMillis(timingPayload.domainLookupEnd) : -1,
      connectStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.connectStart) : -1,
      secureConnectionStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.secureConnectionStart) : -1,
      connectEnd: timingPayload ? wkMillisToRoundishMillis(timingPayload.connectEnd) : -1,
      requestStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.requestStart) : -1,
      responseStart: timingPayload ? wkMillisToRoundishMillis(timingPayload.responseStart) : -1,
    };
    return new network.Response(this.request, responsePayload.status, responsePayload.statusText, headersObjectToArray(responsePayload.headers), timing, getResponseBody);
  }
}

export class WKRouteImpl implements network.RouteDelegate {
  private readonly _session: WKSession;
  private readonly _requestId: string;
  _requestInterceptedCallback: () => void = () => {};
  private readonly _requestInterceptedPromise: Promise<unknown>;
  _responseInterceptedCallback: ((responsePayload: Protocol.Network.Response) => void) | undefined;
  private _responseInterceptedPromise: Promise<Protocol.Network.Response> | undefined;
  private readonly _page: WKPage;

  constructor(session: WKSession, page: WKPage, requestId: string) {
    this._session = session;
    this._page = page;
    this._requestId = requestId;
    this._requestInterceptedPromise = new Promise<void>(f => this._requestInterceptedCallback = f);
  }

  async responseBody(): Promise<Buffer> {
    const response = await this._session.send('Network.getInterceptedResponseBody', { requestId: this._requestId });
    return Buffer.from(response.body, 'base64');
  }

  async abort(errorCode: string) {
    const errorType = errorReasons[errorCode];
    assert(errorType, 'Unknown error code: ' + errorCode);
    await this._requestInterceptedPromise;
    const isResponseIntercepted = await this._responseInterceptedPromise;
    // In certain cases, protocol will return error if the request was already canceled
    // or the page was closed. We should tolerate these errors.
    await this._session.sendMayFail(isResponseIntercepted ? 'Network.interceptResponseWithError' : 'Network.interceptRequestWithError', { requestId: this._requestId, errorType });
  }

  async fulfill(response: types.NormalizedFulfillResponse) {
    if (300 <= response.status && response.status < 400)
      throw new Error('Cannot fulfill with redirect status: ' + response.status);

    await this._requestInterceptedPromise;
    // In certain cases, protocol will return error if the request was already canceled
    // or the page was closed. We should tolerate these errors.
    let mimeType = response.isBase64 ? 'application/octet-stream' : 'text/plain';
    const headers = headersArrayToObject(response.headers, false /* lowerCase */);
    const contentType = headers['content-type'];
    if (contentType)
      mimeType = contentType.split(';')[0].trim();

    const isResponseIntercepted = await this._responseInterceptedPromise;
    await this._session.sendMayFail(isResponseIntercepted ? 'Network.interceptWithResponse' : 'Network.interceptRequestWithResponse', {
      requestId: this._requestId,
      status: response.status,
      statusText: network.STATUS_TEXTS[String(response.status)],
      mimeType,
      headers,
      base64Encoded: response.isBase64,
      content: response.body
    });
  }

  async continue(request: network.Request, overrides: types.NormalizedContinueOverrides): Promise<network.InterceptedResponse|null> {
    if (overrides.interceptResponse) {
      await this._page._ensureResponseInterceptionEnabled();
      this._responseInterceptedPromise = new Promise(f => this._responseInterceptedCallback = f);
    }
    await this._requestInterceptedPromise;
    // In certain cases, protocol will return error if the request was already canceled
    // or the page was closed. We should tolerate these errors.
    await this._session.sendMayFail('Network.interceptWithRequest', {
      requestId: this._requestId,
      url: overrides.url,
      method: overrides.method,
      headers: overrides.headers ? headersArrayToObject(overrides.headers, false /* lowerCase */) : undefined,
      postData: overrides.postData ? Buffer.from(overrides.postData).toString('base64') : undefined
    });
    if (!this._responseInterceptedPromise)
      return null;
    const responsePayload = await this._responseInterceptedPromise;
    return new InterceptedResponse(request, responsePayload.status, responsePayload.statusText, headersObjectToArray(responsePayload.headers));
  }
}

function wkMillisToRoundishMillis(value: number): number {
  // WebKit uses -1000 for unavailable.
  if (value === -1000)
    return -1;

  // WebKit has a bug, instead of -1 it sends -1000 to be in ms.
  if (value <= 0) {
    // DNS can start before request start on Mac Network Stack
    return -1;
  }

  return ((value * 1000) | 0) / 1000;
}

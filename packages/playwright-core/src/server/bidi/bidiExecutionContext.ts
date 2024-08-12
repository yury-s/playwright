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

import type { BidiSession } from './bidiConnection';
import * as js from '../javascript';
import * as bidiTypes from './bidi-types';

export class BidiExecutionContext implements js.ExecutionContextDelegate {
  private readonly _session: BidiSession;
  readonly _realm: string;

  constructor(session: BidiSession, realm: string) {
    this._session = session;
    this._realm = realm;
  }

  // rawCallFunctionNoReply(func: Function, ...args: any[]): void;
  // evaluateWithArguments(expression: string, returnByValue: boolean, utilityScript: JSHandle<any>, values: any[], objectIds: ObjectId[]): Promise<any>;
  // getProperties(context: ExecutionContext, objectId: ObjectId): Promise<Map<string, JSHandle>>;
  // createHandle(context: ExecutionContext, remoteObject: RemoteObject): JSHandle;
  // releaseHandle(objectId: ObjectId): Promise<void>;
  // objectCount(objectId: ObjectId): Promise<number>;

  async rawEvaluateJSON(expression: string): Promise<any> {
    const response = await this._session.send('script.evaluate', {
      expression,
      target: {
        realm: this._realm,
      },
      serializationOptions: {
        maxObjectDepth: 10,
        maxDomDepth: 10,
      },
      awaitPromise: true,
      userActivation: true,
    });
    if (response.type === 'success')
      return response.result;
    if (response.type === 'exception')
      throw new js.JavaScriptErrorInEvaluate(response.exceptionDetails.text + '\nFull val: ' + JSON.stringify(response.exceptionDetails));
    throw new js.JavaScriptErrorInEvaluate('Unexpected response type: ' + JSON.stringify(response));
  }

  async rawEvaluateHandle(expression: string): Promise<js.ObjectId> {
    const response = await this._session.send('script.evaluate', {
      expression,
      target: {
        realm: this._realm,
      },
      resultOwnership: bidiTypes.Script.ResultOwnership.Root, // Necessary for the handle to be returned.
      awaitPromise: true,
      userActivation: true,
    });
    if (response.type === 'success') {
      if ('handle' in response.result)
        return response.result.handle!;
      throw new js.JavaScriptErrorInEvaluate('Cannot get handle: ' + JSON.stringify(response.result));
    }
    if (response.type === 'exception')
      throw new js.JavaScriptErrorInEvaluate(response.exceptionDetails.text + '\nFull val: ' + JSON.stringify(response.exceptionDetails));
    throw new js.JavaScriptErrorInEvaluate('Unexpected response type: ' + JSON.stringify(response));
  }

  rawCallFunctionNoReply(func: Function, ...args: any[]) {
    throw new Error('Method not implemented.');
  }

  async evaluateWithArguments(expression: string, returnByValue: boolean, utilityScript: js.JSHandle<any>, values: any[], objectIds: string[]): Promise<any> {
    throw new Error('Method not implemented.');
  }

  async getProperties(context: js.ExecutionContext, objectId: js.ObjectId): Promise<Map<string, js.JSHandle>> {
    throw new Error('Method not implemented.');
  }

  createHandle(context: js.ExecutionContext, remoteObject: js.RemoteObject): js.JSHandle {
    throw new Error('Method not implemented.');
  }

  async releaseHandle(objectId: js.ObjectId): Promise<void> {
    throw new Error('Method not implemented.');
  }

  objectCount(objectId: js.ObjectId): Promise<number> {
    throw new Error('Method not implemented.');
  }
}

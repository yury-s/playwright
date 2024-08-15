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
import { BidiSerializer } from './bidi-serializer';
import { BidiDeserializer } from './bidi-deserializer';

export class BidiExecutionContext implements js.ExecutionContextDelegate {
  private readonly _session: BidiSession;
  private readonly _target: bidiTypes.Script.Target;

  constructor(session: BidiSession, realmInfo: bidiTypes.Script.RealmInfo) {
    this._session = session;
    if (realmInfo.type === 'window') {
      // Simple realm does not seem to work for Window contexts.
      this._target = {
        context: realmInfo.context,
        sandbox: realmInfo.sandbox,
      };
    } else {
      this._target = {
        realm: realmInfo.realm
      };
    }
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
      target: this._target,
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
      target: this._target,
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

  async evaluateWithArguments(functionDeclaration: string, returnByValue: boolean, utilityScript: js.JSHandle<any>, values: any[], objectIds: string[]): Promise<any> {
    const response = await this._session.send('script.callFunction', {
      functionDeclaration,
      target: this._target,
      arguments: [
        { handle: utilityScript._objectId! },
        ...values.map(BidiSerializer.serialize),
        ...objectIds.map(handle => ({ handle })),
      ],
      resultOwnership: returnByValue ? undefined : bidiTypes.Script.ResultOwnership.Root, // Necessary for the handle to be returned.
      awaitPromise: true,
      userActivation: true,
    });
    if (response.type === 'exception')
      throw new js.JavaScriptErrorInEvaluate(response.exceptionDetails.text + '\nFull val: ' + JSON.stringify(response.exceptionDetails));
    if (response.type === 'success') {
      if (returnByValue)
        return BidiDeserializer.deserialize(response.result);
      if ('handle' in response.result)
        return utilityScript._context.createHandle({ objectId: response.result.handle! });
      throw new js.JavaScriptErrorInEvaluate('Cannot get response handle: ' + JSON.stringify(response.result));
    }
    throw new js.JavaScriptErrorInEvaluate('Unexpected response type: ' + JSON.stringify(response));
  }

  async getProperties(context: js.ExecutionContext, objectId: js.ObjectId): Promise<Map<string, js.JSHandle>> {
    throw new Error('Method not implemented.');
  }

  createHandle(context: js.ExecutionContext, remoteObject: js.RemoteObject): js.JSHandle {
    // const isPromise = remoteObject.className === 'Promise';
    // return new js.JSHandle(context, isPromise ? 'promise' : remoteObject.subtype || remoteObject.type, renderPreview(remoteObject), remoteObject.objectId, potentiallyUnserializableValue(remoteObject));
    throw new Error('Method not implemented.');
  }

  async releaseHandle(objectId: js.ObjectId): Promise<void> {
    throw new Error('Method not implemented.');
  }

  objectCount(objectId: js.ObjectId): Promise<number> {
    throw new Error('Method not implemented.');
  }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.microsoft.playwright;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

class Message {
  String id;
  String guid;
  String method;
  JsonObject params;
  String result;
  String error;

  @Override
  public String toString() {
    return "Message{" +
      "id='" + id + '\'' +
      ", guid='" + guid + '\'' +
      ", method='" + method + '\'' +
      ", params=" + (params == null ? null : "<...>") +
      ", result='" + result + '\'' +
      ", error='" + error + '\'' +
      '}';
  }
}


public class Connection {
  private final Transport transport;
  private final Map<String, ChannelOwner> objects = new HashMap();
  private final Root root;

  class Root extends ChannelOwner {
    Root(Connection connection) {
      super(connection, "", "");
    }
  }

  public Connection(InputStream in, OutputStream out) {
    transport = new Transport(in, out, message -> {
      System.out.println("recv message = " + message);
    });
    root = new Root(this);
  }

  public ChannelOwner waitForObjectWithKnownName(String guid) {
    while (!objects.containsKey(guid)) {
      processOneMessage();
    }
    return objects.get(guid);
  }

  public <T> T getExistingObject(String guid) {
    T result = (T) objects.get(guid);
    if (result == null)
      throw new RuntimeException("Object doesn't exist: " + guid);
    return result;
  }

  void registerObject(String guid, ChannelOwner object) {
    objects.put(guid, object);
  }

  void unregisterObject(String guid, ChannelOwner object) {
    objects.remove(guid);
  }

  private void processOneMessage() {
    String messageString = transport.read();
    Gson gson = new Gson();
    Message message = gson.fromJson(messageString, Message.class);
    dispatch(message);
  }

  private void dispatch(Message message) {
    System.out.println("Message guid: " + message);
    if (message.id != null) {
      System.out.println("channel:response");
//      const callback = this._callbacks.get(id);
//      if (!callback)
//        throw new Error(`Cannot find command to respond: ${id}`);
//      this._callbacks.delete(id);
//      if (error)
//        callback.reject(parseError(error));
//      else
//        callback.resolve(this._replaceGuidsWithChannels(result));
      return;
    }

    System.out.println("channel:event" + message.method);
    System.out.println("  method: " + message.method);
    if (message.method.equals("__create__")) {
      createRemoteObject(message.guid, message.params);
      return;
    }
    if (message.method.equals("__dispose__")) {
      ChannelOwner object = objects.get(message.guid);
      if (object == null)
        throw new RuntimeException("Cannot find object to dispose: " + message.guid);
      object.dispose();
      return;
    }
    ChannelOwner object = objects.get(message.guid);
    if (object == null)
      throw new RuntimeException("Cannot find object to call " + message.method + ": " + message.guid);
//    object._channel.emit(message.method, this._replaceGuidsWithChannels(message.params));
  }

  private ChannelOwner createRemoteObject(String parentGuid, JsonObject params) {
    String type = params.get("type").getAsString();
    String guid = params.get("guid").getAsString();

    ChannelOwner parent = objects.get(parentGuid);
    if (parent == null)
      throw new RuntimeException("Cannot find parent object " + parentGuid + " to create " + guid);
    JsonObject initializer = params.getAsJsonObject("initializer");
    ChannelOwner result = null;
//    initializer = this._replaceGuidsWithChannels(initializer);
    switch (type) {
      case "BrowserType":
        result = new BrowserType(parent, type, guid, initializer);
        break;
      case "Electron":
//        result = new Playwright(parent, type, guid, initializer);
        break;
      case "Playwright":
        result = new Playwright(parent, type, guid, initializer);
        break;
      case "Selectors":
//        result = new Playwright(parent, type, guid, initializer);
        break;
      default:
        throw new RuntimeException("Unknown type " + type);
    }

    return result;
  }
}

/**
 * Copyright (c) Microsoft Corporation.
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.microsoft.playwright;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.*;
import java.util.function.Supplier;


public class Page extends ChannelOwner {
  private final Frame mainFrame;

  Page(ChannelOwner parent, String type, String guid, JsonObject initializer) {
    super(parent, type, guid, initializer);
    mainFrame = connection.getExistingObject(initializer.getAsJsonObject("mainFrame").get("guid").getAsString());
    mainFrame.page = this;
  }

  public Response navigate(String url) {
    return navigate(url, new NavigateOptions());
  }
  public Response navigate(String url, NavigateOptions options) {
    return mainFrame.navigate(url, options);
  }

  public void click(String selector) {
    mainFrame.click(selector);
  }

  public Supplier<Page> waitForPopup() {
    Supplier<JsonObject> popupSupplier = waitForEvent("popup");
    return () -> {
      JsonObject params = popupSupplier.get();
      String guid = params.getAsJsonObject("page").get("guid").getAsString();
      return connection.getExistingObject(guid);
    };
  }

  private static <T> T deserialize(SerializedValue value) {
    if (value.n != null) {
      return (T) value.n;
    }
    if (value.b != null)
      return (T) value.b;
    if (value.s != null)
      return (T) value.s;
    if (value.v != null) {
      switch (value.v) {
        case "undefined":
          return null;
        case "Infinity":
          return (T) Double.valueOf(Double.POSITIVE_INFINITY);
        case "-Infinity":
          return (T) Double.valueOf(Double.NEGATIVE_INFINITY);
        case "-0":
          return (T) Double.valueOf(-0);
        case "NaN":
          return (T) Double.valueOf(Double.NaN);
        default:
          throw new RuntimeException("Unexpected value: " + value.v);
      }
    }
    if (value.a != null) {
      List list = new ArrayList();
      for (SerializedValue v : value.a)
        list.add(deserialize(v));
      return (T) list;
    }
    if (value.o != null) {
      Map map = new LinkedHashMap<>();
      for (SerializedValue.O o : value.o)
        map.put(o.k, deserialize(o.v));
      return (T) map;
    }
    throw new RuntimeException("Unexpected result: " + new Gson().toJson(value));
  }

  public <T> T evalTyped(String expression) {
    JsonElement json = evaluate(expression);
    System.out.println("json = " + new Gson().toJson(json));
    SerializedValue value = new Gson().fromJson(json.getAsJsonObject().get("value"), SerializedValue.class);
    return deserialize(value);
  }

  public JsonElement evaluate(String expression) {
    return evaluate(expression, null);
  }

  public JsonElement evaluate(String expression, Object arg) {
    return evaluate(expression, arg, false);
  }

  public JsonElement evaluate(String expression, Object arg, boolean forceExpression) {
    return mainFrame.evaluate(expression, arg, forceExpression);
  }
  }

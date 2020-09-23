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
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.*;

import static com.microsoft.playwright.Helpers.isFunctionBody;

public class Frame  extends ChannelOwner {
  Page page;

  Frame(ChannelOwner parent, String type, String guid, JsonObject initializer) {
    super(parent, type, guid, initializer);
  }

  public Response navigate(String url) {
    return navigate(url, new NavigateOptions());
  }

  public Response navigate(String url, NavigateOptions options) {
    JsonObject params = new Gson().toJsonTree(options).getAsJsonObject();
    params.addProperty("url", url);
    JsonElement result = sendMessage("goto", params);
    System.out.println("result = " + new Gson().toJson(result));
    return connection.getExistingObject(result.getAsJsonObject().getAsJsonObject("response").get("guid").getAsString());
  }

  public void click(String selector) {
    JsonObject params = new JsonObject();
    params.addProperty("selector", selector);
    JsonElement result = sendMessage("click", params);
  }

  private static SerializedValue serializeValue(Object value) {
    SerializedValue result = new SerializedValue();
    if (value == null)
      result.v = "undefined";
    else if (value instanceof Double) {
      double d = ((Double) value).doubleValue();
      if (d == Double.POSITIVE_INFINITY)
        result.v = "Infinity";
      else if (d == Double.NEGATIVE_INFINITY)
        result.v = "-Infinity";
      else if (d == -0)
        result.v = "-0";
      else if (Double.isNaN(d))
        result.v="NaN";
    }
//    if (value instanceof Date)
    else if (value instanceof Boolean)
      result.b = (Boolean) value;
    else if (value instanceof Integer)
      result.n = ((Integer) value).doubleValue();
    else if (value instanceof Double)
      result.n = (Double) value; // ?
    else if (value instanceof String)
      result.s = (String) value;
    else if (value instanceof List) {
      List<SerializedValue> list = new ArrayList<>();
      for (Object o : (List) value)
        list.add(serializeValue(o));
      result.a = list.toArray(new SerializedValue[0]);
    } else if (value instanceof Map) {
      List<SerializedValue.O> list = new ArrayList<>();
      Map<String, Object> map = (Map<String, Object>) value;
      for (Map.Entry<String, Object> e : map.entrySet()) {
        SerializedValue.O o = new SerializedValue.O();
        o.k = e.getKey();
        o.v = serializeValue(e.getValue());
        list.add(o);
      }
      result.o = list.toArray(new SerializedValue.O[0]);
    } else
      throw new RuntimeException("Unsupported type of argument: " + value);
    return result;
  }
  private static SerializedArgument serializeArgument(Object arg) {
    SerializedArgument result = new SerializedArgument();
    result.value = serializeValue(arg);
    result.handles = new Channel[0];
    return result;
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
    JsonElement json = evaluate(expression, null, false);
    System.out.println("json = " + new Gson().toJson(json));
    SerializedValue value = new Gson().fromJson(json.getAsJsonObject().get("value"), SerializedValue.class);
    return deserialize(value);
  }

  public JsonElement evaluate(String expression, Object arg, boolean forceExpression) {
    JsonObject params = new JsonObject();
    params.addProperty("expression", expression);
    params.addProperty("world", "main");
    if (!isFunctionBody(expression))
      forceExpression = true;
    params.addProperty("isFunction", !forceExpression);
    params.add("arg", new Gson().toJsonTree(serializeArgument(arg)));
    return sendMessage("evaluateExpression", params);
  }
}

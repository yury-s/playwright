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
    if (value instanceof Double) {
      if (value == Double.POSITIVE_INFINITY)
        result.v = "Infinity";
      else if (value == Double.NEGATIVE_INFINITY)
        result.v = "-Infinity";
      else if (value == -0)
        result.v = "-0";
      else if Double.isNaN(value)
        result.v="NaN";
    }


    return result;
  }
  private static JsonObject serializeArgument() {
    return null;
  }

  public JsonElement evaluate(String expression, Object arg1) {
    JsonObject params = new JsonObject();
    params.addProperty("expression", expression);
    params.addProperty("world", "main");
    params.addProperty("isFunction", false);
    JsonObject arg = new JsonObject();
    JsonObject value = new JsonObject();
    value.addProperty("n", 2020);
    arg.add("value", value);
    arg.add("handles", new JsonArray());
    params.add("arg", arg);
    return sendMessage("evaluateExpression", params);
  }
}

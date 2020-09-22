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

  public JsonElement evaluate(String expression) {
    return mainFrame.evaluate(expression);
  }
}

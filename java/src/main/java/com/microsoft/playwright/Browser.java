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

public class Browser extends ChannelOwner {
  Browser(ChannelOwner parent, String type, String guid, JsonObject initializer) {
    super(parent, type, guid, initializer);
  }

  BrowserContext newContext() {
    JsonObject params = new JsonObject();
    JsonElement result = sendMessage("newContext", params);
    System.out.println("result = " + new Gson().toJson(result));
    return connection.getExistingObject(result.getAsJsonObject().getAsJsonObject("context").get("guid").getAsString());
  }


}
